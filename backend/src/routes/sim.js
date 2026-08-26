import { Router } from "express";
import { pool } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimit } from "../middleware/rateLimit.js";
import { getPrices, PriceFeedError } from "../services/priceFeed.js";
import { placeMarketOrder, valueSession, roundQty, SimError } from "../services/simEngine.js";
import { seedMoneyForLevel } from "../data/simRules.js";

// 시연 범위: 라이브 모드 · 시장가 주문만 지원한다 (지정가·과거 시나리오 재생은 제외).
const router = Router();

const orderLimit = createRateLimit({ windowMs: 60 * 1000, limit: 30 });
// 같은 내용의 주문을 아주 짧은 간격으로 다시 보내면(더블클릭, 네트워크 재시도) 중복 체결로 본다.
const DUPLICATE_WINDOW_MS = 2_000;
const recentRequests = new Map(); // fingerprint -> timestamp

function isDuplicateRequest(fingerprint) {
  const now = Date.now();
  const last = recentRequests.get(fingerprint);
  recentRequests.set(fingerprint, now);
  // 메모리 누수 방지: 가끔 오래된 항목 정리
  if (recentRequests.size > 5_000) {
    for (const [key, at] of recentRequests) {
      if (now - at > DUPLICATE_WINDOW_MS) recentRequests.delete(key);
    }
  }
  return last != null && now - last < DUPLICATE_WINDOW_MS;
}

async function getUserLevel(userId) {
  const [[u]] = await pool.query("SELECT level FROM users WHERE id = ?", [userId]);
  return u?.level ?? 1;
}

async function loadLiveInstruments() {
  const [rows] = await pool.query(
    "SELECT id, symbol, display_name FROM instruments WHERE mode = 'live' ORDER BY id"
  );
  return rows;
}

// instrument_id -> {price, source, stale} 맵
async function livePriceMap(instruments) {
  const prices = await getPrices(instruments.map((i) => i.symbol));
  const map = new Map();
  for (const i of instruments) {
    const p = prices.get(i.symbol);
    if (p) map.set(i.id, p);
  }
  return map;
}

// 세션 소유 검증 (본인 세션만 접근 가능)
async function loadOwnSession(conn, userId, sessionId, { forUpdate = false } = {}) {
  const [[session]] = await conn.query(
    `SELECT * FROM sim_sessions WHERE id = ? AND user_id = ?${forUpdate ? " FOR UPDATE" : ""}`,
    [sessionId, userId]
  );
  if (!session) throw new SimError("세션이 없습니다", 404);
  return session;
}

// 종목 + 현재가
router.get("/instruments", requireAuth, async (req, res) => {
  try {
    const instruments = await loadLiveInstruments();
    const prices = await livePriceMap(instruments);
    res.json(
      instruments.map((i) => {
        const p = prices.get(i.id);
        return {
          id: i.id,
          symbol: i.symbol,
          displayName: i.display_name,
          price: p?.price ?? null,
          changeRate: p?.changeRate ?? null,
          source: p?.source ?? "fixture",
          stale: p?.stale ?? true,
        };
      })
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "종목 조회 중 오류가 발생했습니다" });
  }
});

// 진행 중인 라이브 세션 (없으면 null)
router.get("/sessions/active", requireAuth, async (req, res) => {
  try {
    const [[session]] = await pool.query(
      "SELECT id FROM sim_sessions WHERE user_id = ? AND mode = 'live' AND status = 'active' ORDER BY id DESC LIMIT 1",
      [req.user.id]
    );
    res.json({ sessionId: session?.id ?? null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "세션 조회 중 오류가 발생했습니다" });
  }
});

// 세션 시작 (사용자당 활성 라이브 세션은 동시에 1개)
router.post("/sessions", requireAuth, async (req, res) => {
  try {
    const [[existing]] = await pool.query(
      "SELECT id FROM sim_sessions WHERE user_id = ? AND mode = 'live' AND status = 'active' LIMIT 1",
      [req.user.id]
    );
    if (existing) {
      return res
        .status(409)
        .json({ error: "이미 진행 중인 모의투자가 있습니다", sessionId: existing.id });
    }
    const level = await getUserLevel(req.user.id);
    const seedMoney = seedMoneyForLevel(level);
    const [ins] = await pool.query(
      "INSERT INTO sim_sessions (user_id, mode, seed_money, cash) VALUES (?, 'live', ?, ?)",
      [req.user.id, seedMoney, seedMoney]
    );
    res.status(201).json({ sessionId: ins.insertId, seedMoney });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "세션 생성 중 오류가 발생했습니다" });
  }
});

// 포트폴리오 (현금, 보유 종목, 총자산, 수익률)
router.get("/sessions/:id", requireAuth, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const session = await loadOwnSession(conn, req.user.id, req.params.id);
    const instruments = await loadLiveInstruments();
    const prices = await livePriceMap(instruments);
    const valuation = await valueSession(conn, session, prices);
    res.json({
      id: session.id,
      status: session.status,
      seedMoney: Number(session.seed_money),
      startedAt: session.started_at,
      finalReturn: session.final_return != null ? Number(session.final_return) : null,
      ...valuation,
    });
  } catch (err) {
    if (err instanceof SimError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: "포트폴리오 조회 중 오류가 발생했습니다" });
  } finally {
    conn.release();
  }
});

// 시장가 주문
// body: { instrumentId, side, qty?, amountKrw?, clientOrderId? }
router.post("/sessions/:id/orders", requireAuth, orderLimit, async (req, res) => {
  const { instrumentId, side, clientOrderId } = req.body || {};
  let { qty, amountKrw } = req.body || {};

  if (!["BUY", "SELL"].includes(side)) {
    return res.status(400).json({ error: "side는 BUY 또는 SELL이어야 합니다" });
  }
  if (req.body?.orderType && req.body.orderType !== "MARKET") {
    return res.status(400).json({ error: "이 데모에서는 시장가 주문만 지원합니다" });
  }

  const fingerprint = `${req.user.id}:${req.params.id}:${side}:${instrumentId}:${qty ?? amountKrw}`;
  if (isDuplicateRequest(fingerprint)) {
    return res.status(409).json({ error: "같은 주문이 방금 처리됐어요. 잠시 후 다시 시도해주세요." });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const session = await loadOwnSession(conn, req.user.id, req.params.id, { forUpdate: true });
    if (session.status !== "active") {
      throw new SimError("종료된 세션에는 주문할 수 없습니다");
    }
    const instruments = await loadLiveInstruments();
    const instrument = instruments.find((i) => i.id === Number(instrumentId));
    if (!instrument) throw new SimError("종목이 없습니다", 404);

    const prices = await livePriceMap([instrument]);
    const marketPrice = prices.get(instrument.id)?.price;
    if (!marketPrice) throw new SimError("현재가를 가져올 수 없습니다", 503);

    if (qty == null && amountKrw != null && side === "BUY") {
      qty = Number(amountKrw) / marketPrice;
    }
    qty = roundQty(Number(qty));
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new SimError("수량이 올바르지 않습니다");
    }

    let result;
    try {
      result = await placeMarketOrder(conn, session, {
        instrumentId: instrument.id,
        side,
        qty,
        marketPrice,
        clientOrderId: clientOrderId ?? null,
      });
    } catch (err) {
      // client_order_id 재사용 (재시도) → 새 주문 대신 기존 체결 결과를 그대로 반환
      if (clientOrderId && err.code === "ER_DUP_ENTRY") {
        const [[prev]] = await conn.query(
          "SELECT id, status, executed_price FROM sim_orders WHERE session_id = ? AND client_order_id = ?",
          [session.id, clientOrderId]
        );
        await conn.commit();
        return res.status(200).json({
          orderId: prev.id,
          status: prev.status,
          executedPrice: prev.executed_price != null ? Number(prev.executed_price) : null,
          duplicate: true,
        });
      }
      throw err;
    }
    await conn.commit();
    res.status(201).json(result);
  } catch (err) {
    await conn.rollback();
    if (err instanceof SimError) {
      return res.status(err.status).json({ error: err.message });
    }
    if (err instanceof PriceFeedError || err.name === "TimeoutError") {
      return res.status(503).json({ error: "시세 서버에 연결할 수 없습니다" });
    }
    console.error(err);
    res.status(500).json({ error: "주문 처리 중 오류가 발생했습니다" });
  } finally {
    conn.release();
  }
});

// 세션 종료: 현재가로 평가해 수익률 확정
router.post("/sessions/:id/end", requireAuth, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const session = await loadOwnSession(conn, req.user.id, req.params.id, { forUpdate: true });
    if (session.status !== "active") throw new SimError("이미 종료된 세션입니다");

    const instruments = await loadLiveInstruments();
    const prices = await livePriceMap(instruments);
    const valuation = await valueSession(conn, session, prices);
    await conn.query(
      "UPDATE sim_sessions SET status = 'ended', final_return = ?, ended_at = NOW() WHERE id = ?",
      [valuation.returnRate.toFixed(4), session.id]
    );
    await conn.commit();
    res.json({ ended: true, equity: valuation.equity, returnRate: valuation.returnRate });
  } catch (err) {
    await conn.rollback();
    if (err instanceof SimError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: "종료 처리 중 오류가 발생했습니다" });
  } finally {
    conn.release();
  }
});

export default router;

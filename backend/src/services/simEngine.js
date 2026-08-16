// 모의투자 체결 엔진 — 시연 범위는 시장가 매수/매도만 다룬다 (지정가 제외).
// 모든 함수는 이미 열려 있는 트랜잭션(conn) 안에서 행 잠금(FOR UPDATE)과 함께 호출되어야 한다.

export const TRADE_FEE_RATE = 0.0005; // 업비트 KRW 마켓 수수료 0.05%

export const roundCash = (v) => Math.round(v * 100) / 100;
export const roundQty = (v) => Math.round(v * 1e8) / 1e8;

export class SimError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// 보유 수량에 매수 반영, 추가 매수 시 평단(가중평균) 갱신
async function applyBuyToHoldings(conn, sessionId, instrumentId, qty, price) {
  const [[h]] = await conn.query(
    "SELECT qty, avg_price FROM sim_holdings WHERE session_id = ? AND instrument_id = ? FOR UPDATE",
    [sessionId, instrumentId]
  );
  if (!h) {
    await conn.query(
      "INSERT INTO sim_holdings (session_id, instrument_id, qty, avg_price) VALUES (?, ?, ?, ?)",
      [sessionId, instrumentId, roundQty(qty), price]
    );
    return;
  }
  const oldQty = Number(h.qty);
  const newQty = roundQty(oldQty + qty);
  const newAvg = (oldQty * Number(h.avg_price) + qty * price) / (oldQty + qty);
  await conn.query(
    "UPDATE sim_holdings SET qty = ?, avg_price = ? WHERE session_id = ? AND instrument_id = ?",
    [newQty, roundCash(newAvg), sessionId, instrumentId]
  );
}

// 매도 체결: 보유량 초과 시 차단
async function deductHoldings(conn, sessionId, instrumentId, qty) {
  const [[h]] = await conn.query(
    "SELECT qty FROM sim_holdings WHERE session_id = ? AND instrument_id = ? FOR UPDATE",
    [sessionId, instrumentId]
  );
  const held = h ? Number(h.qty) : 0;
  if (held + 1e-9 < qty) {
    throw new SimError("보유 수량이 부족합니다");
  }
  const remain = roundQty(held - qty);
  if (remain <= 0) {
    await conn.query(
      "DELETE FROM sim_holdings WHERE session_id = ? AND instrument_id = ?",
      [sessionId, instrumentId]
    );
  } else {
    await conn.query(
      "UPDATE sim_holdings SET qty = ? WHERE session_id = ? AND instrument_id = ?",
      [remain, sessionId, instrumentId]
    );
  }
}

// 현금 증감 (delta 음수 = 차감). 부족하면 SimError로 차단.
async function adjustCash(conn, sessionId, delta) {
  const [[s]] = await conn.query(
    "SELECT cash FROM sim_sessions WHERE id = ? FOR UPDATE",
    [sessionId]
  );
  const next = roundCash(Number(s.cash) + delta);
  if (next < -1e-6) {
    throw new SimError("주문 가능 금액이 부족합니다");
  }
  await conn.query("UPDATE sim_sessions SET cash = ? WHERE id = ?", [
    Math.max(0, next),
    sessionId,
  ]);
}

// 시장가 주문 체결. side: 'BUY'|'SELL'. marketPrice = 현재가.
export async function placeMarketOrder(conn, session, { instrumentId, side, qty, marketPrice, clientOrderId }) {
  if (side === "BUY") {
    const cost = roundCash(qty * marketPrice * (1 + TRADE_FEE_RATE));
    await adjustCash(conn, session.id, -cost);
    await applyBuyToHoldings(conn, session.id, instrumentId, qty, marketPrice);
  } else {
    await deductHoldings(conn, session.id, instrumentId, qty);
    const proceeds = roundCash(qty * marketPrice * (1 - TRADE_FEE_RATE));
    await adjustCash(conn, session.id, proceeds);
  }

  const [ins] = await conn.query(
    `INSERT INTO sim_orders
       (session_id, instrument_id, side, order_type, qty, status, executed_price, client_order_id)
     VALUES (?, ?, ?, 'MARKET', ?, 'filled', ?, ?)`,
    [session.id, instrumentId, side, roundQty(qty), marketPrice, clientOrderId ?? null]
  );
  return { orderId: ins.insertId, status: "filled", executedPrice: marketPrice };
}

// 세션 평가: 현금 + 보유 평가액, 종목별 비중·손익, 총자산·수익률
export async function valueSession(conn, session, prices) {
  const [holdings] = await conn.query(
    `SELECT h.instrument_id, h.qty, h.avg_price, i.symbol, i.display_name
     FROM sim_holdings h JOIN instruments i ON i.id = h.instrument_id
     WHERE h.session_id = ?`,
    [session.id]
  );
  let holdingsValue = 0;
  const detailed = holdings.map((h) => {
    const qty = Number(h.qty);
    const avg = Number(h.avg_price);
    const current = prices.get(h.instrument_id)?.price ?? avg;
    const value = qty * current;
    holdingsValue += value;
    return {
      instrumentId: h.instrument_id,
      symbol: h.symbol,
      displayName: h.display_name,
      qty,
      avgPrice: avg,
      currentPrice: current,
      value: roundCash(value),
      pnl: roundCash((current - avg) * qty),
      pnlRate: avg > 0 ? (current - avg) / avg : 0,
    };
  });
  const cash = Number(session.cash);
  const equity = roundCash(cash + holdingsValue);
  const seed = Number(session.seed_money);
  return {
    cash,
    holdings: detailed.map((h) => ({
      ...h,
      weight: equity > 0 ? h.value / equity : 0,
    })),
    equity,
    returnRate: seed > 0 ? equity / seed - 1 : 0,
  };
}

import { Router } from "express";
import { pool } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import { chat, LlmError } from "../services/llm.js";
import { systemPromptFor, summarizePortfolio } from "../data/personas.js";
import { buildNudge, nudgeToReply } from "../services/nudges.js";
import { valueSession } from "../services/simEngine.js";
import { getPrices } from "../services/priceFeed.js";

const router = Router();

const HISTORY_LIMIT = 10; // 프롬프트에 넣는 최근 대화 수 (토큰 절약)
const MESSAGE_MAX_LEN = 500;
const DISCLAIMER = "※ 교육 목적의 안내이며 투자 권유가 아닙니다.";

// 사용자의 라이브 세션 평가 요약 (세션이 없으면 null)
async function portfolioSummaryFor(userId, sessionId) {
  if (!sessionId) return null;
  const [[session]] = await pool.query(
    "SELECT * FROM sim_sessions WHERE id = ? AND user_id = ?",
    [sessionId, userId]
  );
  if (!session) return null;
  const [instruments] = await pool.query(
    "SELECT id, symbol FROM instruments WHERE mode = 'live'"
  );
  const prices = new Map();
  try {
    const tickers = await getPrices(instruments.map((i) => i.symbol));
    for (const i of instruments) {
      const t = tickers.get(i.symbol);
      if (t) prices.set(i.id, t);
    }
  } catch {
    // 시세 실패 시 평단 기준으로 평가 (valueSession의 fallback)
  }
  const conn = await pool.getConnection();
  try {
    const valuation = await valueSession(conn, session, prices);
    return { valuation, summary: summarizePortfolio(valuation) };
  } finally {
    conn.release();
  }
}

// AI 코치 채팅. Gemini 실패(키 없음/timeout/quota 초과) 시 규칙 기반 피드백으로 대체한다.
router.post("/chat", requireAuth, async (req, res) => {
  const { message, simSessionId } = req.body || {};
  const text = String(message ?? "").trim();
  if (!text) return res.status(400).json({ error: "메시지를 입력해주세요" });
  if (text.length > MESSAGE_MAX_LEN) {
    return res.status(400).json({ error: `메시지는 ${MESSAGE_MAX_LEN}자 이내로 보내주세요` });
  }

  try {
    const [[user]] = await pool.query(
      "SELECT id, name, risk_type, level FROM users WHERE id = ?",
      [req.user.id]
    );
    const portfolio = await portfolioSummaryFor(
      req.user.id,
      simSessionId ? Number(simSessionId) : null
    );

    let reply;
    let aiUsed;
    try {
      const [historyRows] = await pool.query(
        `SELECT role, content FROM chat_messages WHERE user_id = ? ORDER BY id DESC LIMIT ${HISTORY_LIMIT}`,
        [req.user.id]
      );
      const history = historyRows.reverse();
      const systemPrompt = systemPromptFor(user, portfolio?.summary ?? null);
      reply = await chat(systemPrompt, [...history, { role: "user", content: text }]);
      aiUsed = true;
    } catch (err) {
      if (!(err instanceof LlmError) && err.name !== "TimeoutError") throw err;
      // Gemini 키 없음 / timeout / quota 초과 → 규칙 기반 피드백으로 대체
      console.warn(`[assistant] Gemini 실패, 규칙 기반으로 대체: ${err.message}`);
      const nudge = portfolio ? buildNudge(portfolio.valuation, user.risk_type) : null;
      reply = nudge
        ? nudgeToReply(nudge)
        : "지금은 AI 코치를 사용할 수 없어요. 매수 전엔 항상 근거·리스크·손절 기준 세 가지를 먼저 정리해보세요.";
      aiUsed = false;
    }

    const replyWithNote = `${reply}\n\n${DISCLAIMER}`;
    await pool.query(
      "INSERT INTO chat_messages (user_id, sim_session_id, role, content) VALUES (?, ?, 'user', ?), (?, ?, 'assistant', ?)",
      [req.user.id, simSessionId ?? null, text, req.user.id, simSessionId ?? null, replyWithNote]
    );

    res.json({ reply: replyWithNote, aiUsed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "채팅 처리 중 오류가 발생했습니다" });
  }
});

// 대화 이력
router.get("/history", requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, role, content, created_at FROM chat_messages WHERE user_id = ? ORDER BY id DESC LIMIT 50",
      [req.user.id]
    );
    res.json(rows.reverse());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "이력 조회 중 오류가 발생했습니다" });
  }
});

// 상황 개입 코멘트 (규칙 기반, LLM 미사용 — 포트폴리오 화면 등에서 상시 호출용)
router.get("/nudge", requireAuth, async (req, res) => {
  const sessionId = Number(req.query.sessionId);
  if (!sessionId) return res.status(400).json({ error: "sessionId가 필요합니다" });
  try {
    const [[user]] = await pool.query("SELECT risk_type FROM users WHERE id = ?", [req.user.id]);
    const portfolio = await portfolioSummaryFor(req.user.id, sessionId);
    if (!portfolio) return res.status(404).json({ error: "세션이 없습니다" });
    res.json({ nudge: buildNudge(portfolio.valuation, user?.risk_type) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "코멘트 생성 중 오류가 발생했습니다" });
  }
});

export default router;

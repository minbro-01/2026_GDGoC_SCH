import { Router } from "express";
import { pool } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimit } from "../middleware/rateLimit.js";
import {
  getJudgmentScenario,
  getScenarioRubric,
  listJudgmentScenarios,
} from "../data/judgmentScenarios.js";
import { scoreJudgmentAnswers } from "../utils/judgmentScore.js";
import { generateJudgmentFeedback } from "../services/aiFeedback.js";
import { awardXpOnce } from "../utils/xp.js";

const router = Router();
const HOLDING_PERIODS = new Set(["1M", "3M", "6M", "1Y"]);
const ACTIONS = new Set(["buy", "hold", "avoid"]);
const ANSWER_FIELDS = ["businessModel", "thesis", "moat", "risks", "exitPlan"];

const submitLimit = createRateLimit({ windowMs: 10 * 60 * 1000, limit: 20 });

function parseJson(value) {
  if (value === null || value === undefined) return value;
  return typeof value === "string" ? JSON.parse(value) : value;
}

function validateAnswers(raw) {
  if (!raw || typeof raw !== "object") return { error: "answers 객체가 필요합니다." };
  const answers = {};
  for (const field of ANSWER_FIELDS) {
    const value = typeof raw[field] === "string" ? raw[field].trim() : "";
    if (value.length < 20) {
      return { error: "각 답변은 최소 20자 이상 구체적으로 작성해주세요." };
    }
    if (value.length > 1_200) {
      return { error: "각 답변은 1,200자 이하로 작성해주세요." };
    }
    answers[field] = value;
  }
  return { answers };
}

function mapAttempt(row) {
  return {
    id: row.id,
    scenarioId: row.scenario_id,
    action: row.action,
    holdingPeriod: row.holding_period,
    answers: parseJson(row.answers),
    totalScore: row.total_score,
    dimensions: parseJson(row.dimension_scores),
    narrative: row.narrative,
    aiUsed: Boolean(row.ai_used),
    afterReturn: Number(row.after_return),
    createdAt: row.created_at,
  };
}

router.get("/scenarios", requireAuth, (req, res) => {
  res.json({ scenarios: listJudgmentScenarios() });
});

router.get("/scenarios/:id", requireAuth, (req, res) => {
  const scenario = getJudgmentScenario(req.params.id);
  if (!scenario) return res.status(404).json({ error: "훈련 시나리오를 찾을 수 없습니다." });
  res.json({ scenario });
});

router.post("/attempts", requireAuth, submitLimit, async (req, res) => {
  const { scenarioId, action, holdingPeriod } = req.body || {};
  const scenario = getJudgmentScenario(scenarioId, { revealOutcome: true });
  if (!scenario) return res.status(404).json({ error: "훈련 시나리오를 찾을 수 없습니다." });
  if (!ACTIONS.has(action)) {
    return res.status(400).json({ error: "판단은 buy, hold, avoid 중 하나여야 합니다." });
  }
  if (!HOLDING_PERIODS.has(holdingPeriod)) {
    return res.status(400).json({ error: "보유 기간이 올바르지 않습니다." });
  }

  const validation = validateAnswers(req.body.answers);
  if (validation.error) return res.status(400).json({ error: validation.error });

  const rubric = getScenarioRubric(scenarioId);
  const score = scoreJudgmentAnswers(validation.answers, rubric);
  const aiFeedback = await generateJudgmentFeedback({
    scenario,
    answers: validation.answers,
    score,
  });
  const afterReturn = scenario.afterReturns[holdingPeriod];

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO judgment_attempts
       (user_id, scenario_id, action, holding_period, answers, total_score,
        dimension_scores, narrative, ai_used, after_return)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        scenarioId,
        action,
        holdingPeriod,
        JSON.stringify(validation.answers),
        score.total,
        JSON.stringify(score.dimensions),
        aiFeedback.narrative,
        aiFeedback.aiUsed,
        afterReturn,
      ]
    );
    const xp = await awardXpOnce(conn, req.user.id, 20, `judgment:${scenarioId}`);
    await conn.commit();
    res.status(201).json({
      attemptId: result.insertId,
      score: score.total,
      xpAwarded: xp.awarded ? 20 : 0,
    });
  } catch (error) {
    await conn.rollback();
    console.error(error);
    res.status(500).json({ error: "판단 훈련 결과를 저장하지 못했습니다." });
  } finally {
    conn.release();
  }
});

router.get("/attempts/:id", requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, scenario_id, action, holding_period, answers, total_score,
              dimension_scores, narrative, ai_used, after_return, created_at
       FROM judgment_attempts WHERE id = ? AND user_id = ?`,
      [req.params.id, req.user.id]
    );
    const row = rows[0];
    if (!row) return res.status(404).json({ error: "훈련 결과를 찾을 수 없습니다." });
    const attempt = mapAttempt(row);
    const scenario = getJudgmentScenario(attempt.scenarioId);
    res.json({ attempt, scenario });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "훈련 결과를 조회하지 못했습니다." });
  }
});

router.get("/history", requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, scenario_id, action, holding_period, total_score,
              after_return, created_at
       FROM judgment_attempts
       WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({
      attempts: rows.map((row) => ({
        id: row.id,
        scenarioId: row.scenario_id,
        action: row.action,
        holdingPeriod: row.holding_period,
        totalScore: row.total_score,
        afterReturn: Number(row.after_return),
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "훈련 기록을 조회하지 못했습니다." });
  }
});

export default router;

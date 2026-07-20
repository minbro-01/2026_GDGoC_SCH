import { buildDeterministicNarrative } from "../utils/judgmentScore.js";

const DISCLAIMER = "교육 목적의 피드백이며 특정 종목의 매수·매도 권유가 아닙니다.";

function systemPrompt() {
  return [
    "당신은 투자 판단 과정을 훈련하는 교육 코치입니다.",
    "수익률을 예측하거나 특정 종목의 매수·매도를 권유하지 마세요.",
    "사용자의 투자 성향을 부추기지 말고 근거, 리스크, 판단 변경 기준을 점검하세요.",
    "제공된 루브릭 점수를 바꾸지 말고 3문장 이내의 한국어 피드백만 작성하세요.",
  ].join(" ");
}
function userPrompt({ scenario, answers, score }) {
  return JSON.stringify({
    asset: `${scenario.stock.nameKr}(${scenario.ticker})`,
    date: scenario.period.dateLabel,
    userAnswers: answers,
    rubricScore: score,
  });
}

async function requestGemini(payload, signal) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not configured");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt() }] },
      contents: [{ role: "user", parts: [{ text: userPrompt(payload) }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 280 },
    }),
  });
  if (!response.ok) throw new Error(`Gemini returned ${response.status}`);
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text;
}

async function requestGroq(payload, signal) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not configured");
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    signal,
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      temperature: 0.3,
      max_tokens: 280,
      messages: [
        { role: "system", content: systemPrompt() },
        { role: "user", content: userPrompt(payload) },
      ],
    }),
  });
  if (!response.ok) throw new Error(`Groq returned ${response.status}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content;
}

export async function generateJudgmentFeedback(payload) {
  const fallback = `${buildDeterministicNarrative(payload.score)} ${DISCLAIMER}`;
  if (process.env.AI_FEEDBACK_ENABLED !== "true") {
    return { narrative: fallback, aiUsed: false };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const provider = (process.env.LLM_PROVIDER || "gemini").toLowerCase();
    const text = provider === "groq"
      ? await requestGroq(payload, controller.signal)
      : await requestGemini(payload, controller.signal);
    if (!text?.trim()) return { narrative: fallback, aiUsed: false };
    return { narrative: `${text.trim()} ${DISCLAIMER}`, aiUsed: true };
  } catch (error) {
    console.warn(`[ai-feedback] ${error.message}`);
    return { narrative: fallback, aiUsed: false };
  } finally {
    clearTimeout(timeout);
  }
}

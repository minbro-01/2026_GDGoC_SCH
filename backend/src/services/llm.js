// Gemini 어댑터. 키가 없거나 실패(timeout·quota 초과 등)하면 LlmError를 던진다 —
// 호출부(assistant.js)가 이를 잡아 규칙 기반(nudges.js) 피드백으로 대체한다.

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

export class LlmError extends Error {}

export function hasGeminiKey() {
  return Boolean(process.env.GEMINI_API_KEY);
}

// messages: [{role: 'user'|'assistant', content}]
export async function chat(systemPrompt, messages) {
  if (!hasGeminiKey()) {
    throw new LlmError("GEMINI_API_KEY가 설정되지 않았습니다");
  }
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const url = `${GEMINI_BASE}/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    generationConfig: {
      maxOutputTokens: 512, // 무료 쿼터 절약: 답변 길이 제한
      temperature: 0.7,
    },
  };

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    // AbortSignal.timeout()이 던지는 TimeoutError 포함
    throw new LlmError(`Gemini 요청 실패: ${err.message}`);
  }

  if (res.status === 429) {
    throw new LlmError("Gemini 쿼터를 초과했습니다");
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new LlmError(`Gemini API 오류 (${res.status}): ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("").trim();
  if (!text) throw new LlmError("Gemini 응답이 비어 있습니다");
  return text;
}

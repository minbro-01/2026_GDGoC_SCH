// 규칙 기반 코칭 코멘트 — LLM 없이 결정적으로 동작한다.
// AI 코치가 실패(키 없음/timeout/quota 초과)했을 때의 폴백으로도 사용된다.
// 우선순위 순서대로 첫 번째로 걸리는 규칙 하나만 반환한다.

const CONCENTRATION_LIMIT = 0.7; // 한 종목 비중 70%
const DRAWDOWN_LIMIT = -0.1; // 보유 손실 -10%
const RISK_EXPOSURE_LIMIT = 0.7; // 안정 성향의 코인 노출 70%
const PROFIT_MARK = 0.15; // 보유 수익 +15%

const CONSERVATIVE_TYPES = new Set(["안정형", "안정추구형"]);

export function buildNudge(valuation, riskType) {
  const { equity, holdings, cash } = valuation;
  if (!equity || equity <= 0) return null;

  // 1) 집중 투자 경고 — 한 종목 비중 70% 이상
  for (const h of holdings) {
    const weight = h.value / equity;
    if (weight >= CONCENTRATION_LIMIT) {
      return {
        kind: "concentration",
        message:
          `${h.displayName} 한 종목이 총자산의 ${Math.round(weight * 100)}%예요. ` +
          "이 종목이 크게 흔들리면 전체가 흔들립니다. 비중을 나눠볼 생각은 없으신가요?",
      };
    }
  }

  // 2) 큰 손실 → 손절 기준 질문
  for (const h of holdings) {
    if (h.pnlRate <= DRAWDOWN_LIMIT) {
      return {
        kind: "drawdown",
        message:
          `${h.displayName}이(가) ${(h.pnlRate * 100).toFixed(1)}%까지 내려왔어요. ` +
          "사기 전에 정한 손절 기준이 있었나요? 없었다면 지금이라도 기준을 정해보세요.",
      };
    }
  }

  // 3) 안정 성향인데 코인 노출 과다
  if (CONSERVATIVE_TYPES.has(riskType)) {
    const exposure = 1 - cash / equity;
    if (exposure >= RISK_EXPOSURE_LIMIT) {
      return {
        kind: "risk_mismatch",
        message:
          `${riskType} 성향인데 자산의 ${Math.round(exposure * 100)}%가 변동성 큰 코인에 들어가 있어요. ` +
          "내 성향이 감당할 수 있는 변동폭인지 한 번 점검해보세요.",
      };
    }
  }

  // 4) 수익 구간 → 익절 기준 상기
  for (const h of holdings) {
    if (h.pnlRate >= PROFIT_MARK) {
      return {
        kind: "take_profit",
        message:
          `${h.displayName}이(가) +${(h.pnlRate * 100).toFixed(1)}%예요. ` +
          "이익이 손실로 바뀌는 일은 흔합니다. 목표가(익절 기준)를 정해두셨나요?",
      };
    }
  }

  return null;
}

// buildNudge 결과를 채팅 답변처럼 자연스러운 한 단락으로 바꾼다 (AI 실패 시 대체 응답용).
// nudge가 없으면(=경고할 것 없음, 또는 보유 종목 자체가 없음) 무난한 기본 안내를 준다.
export function nudgeToReply(nudge) {
  if (!nudge) {
    return "지금 포트폴리오엔 특별한 경고 신호는 없어요. 다음 매매 전에도 근거와 손절 기준을 먼저 정해보세요.";
  }
  return nudge.message;
}

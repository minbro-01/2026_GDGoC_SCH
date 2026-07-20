const METRIC_TERMS = [
  "eps",
  "per",
  "pbr",
  "roe",
  "매출",
  "성장률",
  "영업이익",
  "마진",
  "실적",
];
const CONDITION_TERMS = ["하면", "할 때", "경우", "이하", "이상", "하락", "상승", "달성"];
const THESIS_BREAK_TERMS = ["가설", "근거", "훼손", "변화", "철회", "실적", "경쟁력"];
const HORIZON_TERMS = ["1개월", "3개월", "6개월", "1년", "분기", "장기", "단기"];

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function uniqueMatches(text, terms) {
  return [...new Set(terms.filter((term) => text.includes(term.toLowerCase())))];
}

const REASONING_TERMS = /때문|따라|반면|하지만|따라서|통해|기여|만들|악화|개선|증가|감소|낮출|높일|보면|깨지|경우/;

function depthCap(score, text, max) {
  let cap = max;
  if (text.length < 35) cap = Math.min(cap, Math.floor(max * 0.5));
  if (!REASONING_TERMS.test(text)) cap = Math.min(cap, Math.ceil(max * 0.7));
  return Math.min(score, cap);
}

function feedback(matched, missing, good, improve) {
  if (matched.length >= Math.min(2, matched.length + missing.length)) return good;
  return `${improve}${missing.length ? ` 예: ${missing.slice(0, 3).join(", ")}` : ""}`;
}

export function scoreJudgmentAnswers(answers, rubric) {
  const business = normalize(answers.businessModel);
  const thesis = normalize(answers.thesis);
  const moat = normalize(answers.moat);
  const risks = normalize(answers.risks);
  const exitPlan = normalize(answers.exitPlan);

  const businessMatches = uniqueMatches(business, rubric.businessConcepts);
  const businessSpecific = /고객|판매|구독|수수료|매출|서비스/.test(business);
  const understandingScore = depthCap(
    Math.min(20, businessMatches.length * 5 + (businessSpecific ? 5 : 0)),
    business,
    20
  );

  const metricMatches = uniqueMatches(thesis, METRIC_TERMS);
  const hasNumber = /\d/.test(thesis);
  const linksEvidence = /때문|대비|반면|따라서|근거/.test(thesis);
  const evidenceScore = depthCap(
    Math.min(25, metricMatches.length * 4 + (hasNumber ? 5 : 0) + (linksEvidence ? 4 : 0)),
    thesis,
    25
  );

  const moatMatches = uniqueMatches(moat, rubric.moatConcepts);
  const moatScore = depthCap(
    Math.min(15, moatMatches.length * 4 + (/유지|지속|경쟁/.test(moat) ? 3 : 0)),
    moat,
    15
  );

  const riskMatches = uniqueMatches(risks, rubric.riskConcepts);
  const riskHasImpact = /영향|악화|감소|하락|손실|둔화/.test(risks);
  const riskScore = depthCap(
    Math.min(20, riskMatches.length * 4 + (riskHasImpact ? 4 : 0)),
    risks,
    20
  );

  const conditionMatches = uniqueMatches(exitPlan, CONDITION_TERMS);
  const thesisMatches = uniqueMatches(exitPlan, THESIS_BREAK_TERMS);
  const horizonMatches = uniqueMatches(exitPlan, HORIZON_TERMS);
  const exitScore = depthCap(
    Math.min(
      20,
      (conditionMatches.length ? 5 : 0) +
        (/\d|%/.test(exitPlan) ? 5 : 0) +
        (thesisMatches.length ? 5 : 0) +
        (horizonMatches.length ? 5 : 0)
    ),
    exitPlan,
    20
  );

  const dimensions = [
    {
      key: "understanding",
      label: "사업 이해",
      score: understandingScore,
      max: 20,
      matched: businessMatches,
      feedback: feedback(
        businessMatches,
        rubric.businessConcepts,
        "수익 구조와 핵심 제품·서비스를 구체적으로 짚었습니다.",
        "회사가 누구에게 무엇을 팔아 돈을 버는지 더 구체화해보세요."
      ),
    },
    {
      key: "evidence",
      label: "근거 사용",
      score: evidenceScore,
      max: 25,
      matched: metricMatches,
      feedback: feedback(
        metricMatches,
        METRIC_TERMS,
        "화면에 제시된 수치와 실적을 판단 근거로 연결했습니다.",
        "느낌 대신 재무 수치나 뉴스의 구체적인 근거를 인용해보세요."
      ),
    },
    {
      key: "moat",
      label: "경쟁력 분석",
      score: moatScore,
      max: 15,
      matched: moatMatches,
      feedback: feedback(
        moatMatches,
        rubric.moatConcepts,
        "기업의 지속 가능한 경쟁우위를 찾아냈습니다.",
        "경쟁사가 쉽게 따라 하기 어려운 강점이 무엇인지 설명해보세요."
      ),
    },
    {
      key: "risk",
      label: "리스크 인식",
      score: riskScore,
      max: 20,
      matched: riskMatches,
      feedback: feedback(
        riskMatches,
        rubric.riskConcepts,
        "당시 시장 환경과 기업 고유 위험을 함께 고려했습니다.",
        "현재 시점에서 틀릴 수 있는 이유와 손실 경로를 더 적어보세요."
      ),
    },
    {
      key: "exit",
      label: "판단 변경 기준",
      score: exitScore,
      max: 20,
      matched: [...conditionMatches, ...thesisMatches, ...horizonMatches],
      feedback:
        exitScore >= 15
          ? "기간·수치·투자 가설의 변화를 기준으로 판단 변경 조건을 세웠습니다."
          : "가격 숫자만이 아니라 기간과 투자 가설이 깨지는 조건을 함께 정해보세요.",
    },
  ];

  return {
    total: dimensions.reduce((sum, item) => sum + item.score, 0),
    dimensions,
  };
}

export function buildDeterministicNarrative(result) {
  const strongest = [...result.dimensions].sort((a, b) => b.score / b.max - a.score / a.max)[0];
  const weakest = [...result.dimensions].sort((a, b) => a.score / a.max - b.score / b.max)[0];
  return `가장 잘한 부분은 ${strongest.label}입니다. 다음 훈련에서는 ${weakest.label}을 보완해보세요. 수익률과 별개로 같은 판단 과정을 반복할 수 있는지가 중요합니다.`;
}

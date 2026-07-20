import {
  getAvailablePeriods,
  getSnapshot,
  getStockData,
} from "./stockData.js";

const STOCKS = {
  AAPL: {
    name: "Apple",
    nameKr: "애플",
    sector: "기술",
    businessConcepts: ["아이폰", "하드웨어", "서비스", "구독", "앱스토어"],
    moatConcepts: ["브랜드", "생태계", "전환비용", "서비스", "현금흐름"],
  },
  MSFT: {
    name: "Microsoft",
    nameKr: "마이크로소프트",
    sector: "소프트웨어·클라우드",
    businessConcepts: ["소프트웨어", "클라우드", "azure", "구독", "오피스"],
    moatConcepts: ["전환비용", "기업고객", "생태계", "구독", "클라우드"],
  },
  NVDA: {
    name: "NVIDIA",
    nameKr: "엔비디아",
    sector: "반도체",
    businessConcepts: ["gpu", "반도체", "데이터센터", "게임", "ai"],
    moatConcepts: ["cuda", "생태계", "소프트웨어", "기술력", "시장점유율"],
  },
  AMZN: {
    name: "Amazon",
    nameKr: "아마존",
    sector: "이커머스·클라우드",
    businessConcepts: ["이커머스", "aws", "클라우드", "광고", "구독"],
    moatConcepts: ["규모", "물류", "네트워크", "클라우드", "프라임"],
  },
  GOOGL: {
    name: "Alphabet",
    nameKr: "알파벳",
    sector: "광고·클라우드",
    businessConcepts: ["광고", "검색", "유튜브", "클라우드", "구독"],
    moatConcepts: ["데이터", "네트워크", "검색", "브랜드", "생태계"],
  },
};

const PERIODS = {
  covid2020: {
    dateLabel: "2020년 3월",
    cutoffDate: "2020-03-31",
    eventLabel: "코로나19 충격",
    eventType: "crisis",
    description:
      "팬데믹 선언과 공급망 중단 우려가 겹친 급락 구간입니다. 당시 공개된 정보만 보고 판단합니다.",
    riskConcepts: ["팬데믹", "공급망", "봉쇄", "수요", "유동성", "불확실성"],
    sources: [
      {
        label: "WHO 코로나19 미디어 브리핑 (2020-03-11)",
        publishedAt: "2020-03-11",
        url: "https://www.who.int/news-room/speeches/item/who-director-general-s-opening-remarks-at-the-media-briefing-on-covid-19---11-march-2020",
      },
      {
        label: "Apple 분기 가이던스 업데이트 (2020-02-17)",
        publishedAt: "2020-02-17",
        url: "https://www.apple.com/newsroom/2020/02/investor-update-on-quarterly-guidance/",
      },
    ],
  },
  vaccine2020: {
    dateLabel: "2020년 11월",
    cutoffDate: "2020-11-30",
    eventLabel: "백신 기대와 경제 재개",
    eventType: "boom",
    description:
      "백신 임상 결과와 경제 정상화 기대가 반영되던 구간입니다. 낙관론에 가려진 밸류에이션 위험도 함께 봅니다.",
    riskConcepts: ["밸류에이션", "기대", "금리", "과열", "실적", "변동성"],
    sources: [
      {
        label: "Pfizer·BioNTech 백신 후보 1차 결과 (2020-11-09)",
        publishedAt: "2020-11-09",
        url: "https://www.pfizer.com/news/press-release/press-release-detail/pfizer-and-biontech-announce-vaccine-candidate-against",
      },
    ],
  },
  ratehike2022: {
    dateLabel: "2022년 1월",
    cutoffDate: "2022-01-31",
    eventLabel: "고물가와 금리 인상",
    eventType: "crisis",
    description:
      "높은 인플레이션과 긴축 전환이 성장주 가치평가에 충격을 주던 구간입니다.",
    riskConcepts: ["금리", "인플레이션", "할인율", "밸류에이션", "부채", "성장둔화"],
    sources: [
      {
        label: "미 연준 FOMC 성명 (2022-01-26)",
        publishedAt: "2022-01-26",
        url: "https://www.federalreserve.gov/newsevents/pressreleases/monetary20220126a.htm",
      },
    ],
  },
  aiboom2023: {
    dateLabel: "2023년 1월",
    cutoffDate: "2023-01-31",
    eventLabel: "생성형 AI 확산",
    eventType: "boom",
    description:
      "생성형 AI 수요가 반도체·클라우드 기업의 기대를 빠르게 끌어올리던 초기 구간입니다.",
    riskConcepts: ["과열", "경쟁", "밸류에이션", "수요", "규제", "공급"],
    sources: [
      {
        label: "Microsoft·OpenAI 파트너십 확대 (2023-01-23)",
        publishedAt: "2023-01-23",
        url: "https://blogs.microsoft.com/blog/2023/01/23/microsoftandopenaiextendpartnership/",
      },
    ],
  },
};

const COMMON_RISKS = [
  "경쟁",
  "규제",
  "환율",
  "마진",
  "밸류에이션",
  "경기",
  "집중",
  "변동성",
];

function splitScenarioId(id) {
  const separator = id.indexOf("-");
  if (separator < 1) return null;
  return { ticker: id.slice(0, separator), periodId: id.slice(separator + 1) };
}

export function listJudgmentScenarios() {
  return Object.entries(STOCKS).flatMap(([ticker, stock]) => {
    const data = getStockData(ticker);
    if (!data) return [];
    return getAvailablePeriods(ticker).map((periodId) => {
      const snapshot = getSnapshot(ticker, periodId);
      const period = PERIODS[periodId];
      return {
        id: `${ticker}-${periodId}`,
        ticker,
        stock,
        periodId,
        period,
        currentPrice: snapshot.priceAtTime,
        changeFromPrevYear: snapshot.changeFromPrevYear,
        dataStatus: "prototype-derived-review-required",
      };
    });
  });
}

export function getJudgmentScenario(id, { revealOutcome = false } = {}) {
  const parsed = splitScenarioId(id);
  if (!parsed || !STOCKS[parsed.ticker] || !PERIODS[parsed.periodId]) return null;
  const snapshot = getSnapshot(parsed.ticker, parsed.periodId);
  if (!snapshot) return null;

  const { afterReturns, ...visibleSnapshot } = snapshot;
  return {
    id,
    ticker: parsed.ticker,
    stock: STOCKS[parsed.ticker],
    periodId: parsed.periodId,
    period: PERIODS[parsed.periodId],
    snapshot: visibleSnapshot,
    ...(revealOutcome ? { afterReturns } : {}),
    dataNotice:
      "프로토타입에서 이관한 교육용 스냅샷입니다. 가격·재무 수치는 운영 전 원문 대조가 필요하며 실제 투자 판단에 사용할 수 없습니다.",
    reviewedAt: "2026-07-20",
  };
}

export function getScenarioRubric(id) {
  const scenario = getJudgmentScenario(id);
  if (!scenario) return null;
  return {
    businessConcepts: scenario.stock.businessConcepts,
    moatConcepts: scenario.stock.moatConcepts,
    riskConcepts: [...scenario.period.riskConcepts, ...COMMON_RISKS],
  };
}

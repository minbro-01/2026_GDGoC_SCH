import test from "node:test";
import assert from "node:assert/strict";
import {
  getJudgmentScenario,
  getScenarioRubric,
  listJudgmentScenarios,
} from "../src/data/judgmentScenarios.js";
import { scoreJudgmentAnswers } from "../src/utils/judgmentScore.js";

const scenarioId = "AAPL-covid2020";

const detailedAnswers = {
  businessModel:
    "Apple은 아이폰 하드웨어 판매와 서비스·구독 매출에서 수익을 얻고, 설치 기반 고객이 반복 구매를 만든다.",
  thesis:
    "화면의 매출 91.8B, EPS 4.99와 성장률 8.9%를 보면 실적은 견조하지만 공급망 충격을 함께 봐야 한다.",
  moat:
    "브랜드와 생태계, 전환비용이 고객 유지에 기여하지만 경쟁 제품의 품질 개선 여부를 계속 확인한다.",
  risks:
    "팬데믹과 공급망 중단이 생산과 수요를 동시에 악화시켜 매출과 마진을 낮출 수 있다.",
  exitPlan:
    "6개월 동안 분기 매출 성장률이 0% 아래로 내려가거나 공급 정상화 가설이 깨지면 비중을 절반 줄인다.",
};

test("scenario outcomes stay hidden until the server explicitly reveals them", () => {
  const hidden = getJudgmentScenario(scenarioId);
  const revealed = getJudgmentScenario(scenarioId, { revealOutcome: true });

  assert.ok(hidden);
  assert.equal("afterReturns" in hidden, false);
  assert.deepEqual(Object.keys(revealed.afterReturns), ["1M", "3M", "6M", "1Y"]);
});

test("every listed scenario can be loaded without revealing its outcome", () => {
  const scenarios = listJudgmentScenarios();
  assert.ok(scenarios.length >= 10);

  for (const item of scenarios) {
    const scenario = getJudgmentScenario(item.id);
    assert.equal(scenario.id, item.id);
    assert.equal("afterReturns" in scenario, false);
    assert.equal(item.dataStatus, "prototype-derived-review-required");
    assert.ok(scenario.period.sources.every((source) => source.url.startsWith("https://")));
    assert.ok(
      scenario.period.sources.every(
        (source) => source.publishedAt <= scenario.period.cutoffDate
      ),
      `${item.id} contains a source published after the scenario cutoff`
    );
  }
});

test("scenario-grounded answers receive dimensioned deterministic feedback", () => {
  const score = scoreJudgmentAnswers(detailedAnswers, getScenarioRubric(scenarioId));

  assert.ok(score.total >= 70);
  assert.equal(score.dimensions.length, 5);
  assert.equal(score.dimensions.reduce((sum, item) => sum + item.max, 0), 100);
  assert.equal(score.dimensions.reduce((sum, item) => sum + item.score, 0), score.total);
});

test("the same reasoning receives the same score regardless of future return", () => {
  const rubric = getScenarioRubric(scenarioId);
  const first = scoreJudgmentAnswers(detailedAnswers, rubric);
  const second = scoreJudgmentAnswers(detailedAnswers, rubric);

  assert.deepEqual(second, first);
});

test("keyword lists without reasoning cannot earn a high score", () => {
  const keywordDump = {
    businessModel: "아이폰 하드웨어 서비스 구독 앱스토어 고객 판매",
    thesis: "EPS PER PBR ROE 매출 영업이익 마진 91.8 수치",
    moat: "브랜드 생태계 전환비용 서비스 현금흐름 경쟁 우위",
    risks: "팬데믹 공급망 봉쇄 수요 유동성 불확실성 영향 손실",
    exitPlan: "만약 1개월 10% 하락 손절 매도 철회 조건",
  };
  const score = scoreJudgmentAnswers(keywordDump, getScenarioRubric(scenarioId));

  assert.ok(score.total < 65);
});

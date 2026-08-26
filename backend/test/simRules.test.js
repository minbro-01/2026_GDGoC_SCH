import test from "node:test";
import assert from "node:assert/strict";
import { seedMoneyForLevel } from "../src/data/simRules.js";
import { roundCash, roundQty, TRADE_FEE_RATE } from "../src/services/simEngine.js";

test("레벨별 시드머니", () => {
  assert.equal(seedMoneyForLevel(1), 1_000_000);
  assert.equal(seedMoneyForLevel(2), 1_000_000);
  assert.equal(seedMoneyForLevel(3), 5_000_000);
  assert.equal(seedMoneyForLevel(4), 5_000_000);
  assert.equal(seedMoneyForLevel(5), 10_000_000);
  assert.equal(seedMoneyForLevel(10), 10_000_000);
});

test("수수료율은 업비트 KRW 마켓 기준 0.05%", () => {
  assert.equal(TRADE_FEE_RATE, 0.0005);
});

test("금액/수량 반올림 자릿수", () => {
  assert.equal(roundCash(499750.00499), 499750); // 소수 2자리
  assert.equal(roundCash(0.005), 0.01);
  assert.equal(roundQty(308.071472581234), 308.07147258); // 소수 8자리
  // 수수료 포함 매수 비용 계산이 2자리로 안정적으로 떨어지는지
  const cost = roundCash(100 * 1000 * (1 + TRADE_FEE_RATE));
  assert.equal(cost, 100050);
});

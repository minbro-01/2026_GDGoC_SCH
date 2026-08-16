import test from "node:test";
import assert from "node:assert/strict";
import { buildNudge, nudgeToReply } from "../src/services/nudges.js";

const holding = (over = {}) => ({
  displayName: "비트코인",
  value: 100_000,
  pnlRate: 0,
  ...over,
});

test("한 종목 비중 70% 이상이면 집중 경고", () => {
  const n = buildNudge(
    { equity: 1_000_000, cash: 250_000, holdings: [holding({ value: 750_000 })] },
    "위험중립형"
  );
  assert.equal(n.kind, "concentration");
});

test("보유 손실 -10% 이하면 손절 기준 질문", () => {
  const n = buildNudge(
    {
      equity: 1_000_000,
      cash: 800_000,
      holdings: [holding({ value: 200_000, pnlRate: -0.12 })],
    },
    "적극투자형"
  );
  assert.equal(n.kind, "drawdown");
});

test("안정 성향 + 코인 노출 70% 이상이면 성향 불일치", () => {
  const n = buildNudge(
    {
      equity: 1_000_000,
      cash: 200_000,
      holdings: [
        holding({ value: 400_000 }),
        holding({ displayName: "이더리움", value: 400_000 }),
      ],
    },
    "안정형"
  );
  assert.equal(n.kind, "risk_mismatch");
});

test("공격 성향은 같은 노출에서 성향 불일치 넛지가 없다", () => {
  const n = buildNudge(
    {
      equity: 1_000_000,
      cash: 200_000,
      holdings: [
        holding({ value: 400_000 }),
        holding({ displayName: "이더리움", value: 400_000 }),
      ],
    },
    "공격투자형"
  );
  assert.equal(n, null);
});

test("수익 +15% 이상이면 익절 기준 상기", () => {
  const n = buildNudge(
    {
      equity: 1_000_000,
      cash: 800_000,
      holdings: [holding({ value: 200_000, pnlRate: 0.2 })],
    },
    "위험중립형"
  );
  assert.equal(n.kind, "take_profit");
});

test("평온한 포트폴리오는 넛지 없음", () => {
  const n = buildNudge(
    {
      equity: 1_000_000,
      cash: 600_000,
      holdings: [holding({ value: 400_000, pnlRate: 0.03 })],
    },
    "위험중립형"
  );
  assert.equal(n, null);
});

test("우선순위: 집중 경고가 익절보다 먼저", () => {
  const n = buildNudge(
    {
      equity: 1_000_000,
      cash: 100_000,
      holdings: [holding({ value: 900_000, pnlRate: 0.3 })],
    },
    "위험중립형"
  );
  assert.equal(n.kind, "concentration");
});

test("nudgeToReply: 넛지 없으면 무난한 기본 문구", () => {
  const reply = nudgeToReply(null);
  assert.match(reply, /경고 신호는 없어요/);
});

test("nudgeToReply: 넛지 있으면 그 메시지 그대로", () => {
  const nudge = { kind: "concentration", message: "테스트 메시지" };
  assert.equal(nudgeToReply(nudge), "테스트 메시지");
});

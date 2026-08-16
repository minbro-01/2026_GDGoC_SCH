// 레벨별 모의투자 시드머니 (docs/PLAN.md 2.3장). 시연 범위는 시장가 주문만 다룬다.

export function seedMoneyForLevel(level) {
  if (level >= 5) return 10_000_000;
  if (level >= 3) return 5_000_000;
  return 1_000_000;
}

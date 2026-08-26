// 시세 조회 계층 — 업비트 공개 API 우선, 실패 시 fixture 가격으로 자동 전환한다.
// 시연 중 외부 API 장애로 데모가 멈추는 일이 없도록 하는 것이 목적이다.
// 모든 응답에 source('upbit'|'fixture')와 stale(오래된 값 여부)을 포함한다.

const BASE = "https://api.upbit.com/v1";
const TICKER_TTL_MS = 5_000;
const STALE_AFTER_MS = TICKER_TTL_MS * 3;

// 업비트 API가 완전히 죽었을 때(첫 요청부터 실패 등)를 위한 최후의 폴백값.
// 실제 가격과 다를 수 있음 — 시연이 끊기지 않게 하는 용도.
const FIXTURE_PRICES = {
  "KRW-BTC": 139_000_000,
  "KRW-ETH": 5_200_000,
  "KRW-XRP": 900,
};

const tickerCache = new Map(); // market -> { at, price, changeRate }

export class PriceFeedError extends Error {}

async function fetchTickers(markets) {
  const url = `${BASE}/ticker?markets=${encodeURIComponent(markets.join(","))}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw new PriceFeedError(`업비트 API 오류 (${res.status})`);
  return res.json();
}

// markets: ["KRW-BTC", ...] → Map(market -> {price, changeRate, source, stale})
export async function getPrices(markets) {
  const now = Date.now();
  const need = markets.filter((m) => {
    const c = tickerCache.get(m);
    return !c || now - c.at > TICKER_TTL_MS;
  });

  if (need.length > 0) {
    try {
      const rows = await fetchTickers(need);
      for (const t of rows) {
        tickerCache.set(t.market, {
          at: now,
          price: t.trade_price,
          changeRate: t.signed_change_rate,
        });
      }
    } catch {
      // 업비트 실패 — 아래에서 캐시/fixture로 폴백
    }
  }

  const out = new Map();
  for (const m of markets) {
    const cached = tickerCache.get(m);
    if (cached) {
      out.set(m, {
        price: cached.price,
        changeRate: cached.changeRate,
        source: "upbit",
        stale: Date.now() - cached.at > STALE_AFTER_MS,
      });
    } else if (FIXTURE_PRICES[m] != null) {
      out.set(m, {
        price: FIXTURE_PRICES[m],
        changeRate: 0,
        source: "fixture",
        stale: true,
      });
    }
  }
  return out;
}

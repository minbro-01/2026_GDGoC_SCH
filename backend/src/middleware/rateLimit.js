export function createRateLimit({ windowMs, limit }) {
  const buckets = new Map();

  return function rateLimit(req, res, next) {
    const now = Date.now();
    const key = String(req.user?.id || req.ip);
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (current.count >= limit) {
      return res.status(429).json({
        error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
      });
    }
    current.count += 1;
    next();
  };
}

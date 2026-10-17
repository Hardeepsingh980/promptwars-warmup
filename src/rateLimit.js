/**
 * A small in-memory rate limiter keyed by client IP.
 * It allows `max` requests per `windowMs`. Good enough for one server; swap for Redis at scale.
 */
export function createRateLimiter({ windowMs, max, now = Date.now }) {
  const hits = new Map();

  function isAllowed(key) {
    const current = now();
    const windowStart = current - windowMs;
    const recent = (hits.get(key) ?? []).filter((time) => time > windowStart);
    recent.push(current);
    hits.set(key, recent);
    if (hits.size > 10_000) hits.clear();
    return recent.length <= max;
  }

  function middleware(request, response, next) {
    if (isAllowed(request.ip ?? "unknown")) return next();
    response.status(429).json({ error: "Too many requests. Please wait a minute and try again." });
  }

  return { isAllowed, middleware };
}

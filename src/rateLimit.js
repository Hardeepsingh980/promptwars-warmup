/**
 * A fixed-window rate limiter keyed by client IP, with O(1) work per request.
 * Each key holds one counter and the start of its window. Stale keys are swept
 * on a timer, so memory stays bounded. Good for one instance; use Redis to scale out.
 */
export function createRateLimiter({ windowMs, max, now = Date.now, sweepEvery = 5 * 60_000 }) {
  const counters = new Map();
  let lastSweep = now();

  function sweep(current) {
    if (current - lastSweep < sweepEvery) return;
    lastSweep = current;
    for (const [key, entry] of counters) if (current - entry.start >= windowMs) counters.delete(key);
  }

  function isAllowed(key) {
    const current = now();
    sweep(current);
    const entry = counters.get(key);
    if (!entry || current - entry.start >= windowMs) {
      counters.set(key, { start: current, count: 1 });
      return true;
    }
    entry.count += 1;
    return entry.count <= max;
  }

  function middleware(request, response, next) {
    if (isAllowed(request.ip ?? "unknown")) return next();
    response.set("Retry-After", String(Math.ceil(windowMs / 1000)));
    response.status(429).json({ error: "Too many requests. Please wait a minute and try again." });
  }

  return { isAllowed, middleware, size: () => counters.size };
}

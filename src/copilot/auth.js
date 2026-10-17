import { createHash, timingSafeEqual } from "node:crypto";

const digest = (value) => createHash("sha256").update(String(value)).digest();

/**
 * Express middleware: allow the request only when the X-Copilot-Key header matches `key`.
 * The compare takes the same time for every wrong key, so it does not leak the key.
 */
export function requireToolKey(key) {
  return (request, response, next) => {
    const sent = request.get("x-copilot-key") ?? "";
    if (key && sent && timingSafeEqual(digest(sent), digest(key))) return next();
    response.status(401).json({ error: "Missing or wrong X-Copilot-Key header" });
  };
}

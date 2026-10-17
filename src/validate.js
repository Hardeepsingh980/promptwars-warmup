import { HttpError } from "./errors.js";
import { LANGUAGES } from "./config.js";

/** Return a valid language code or throw 400. */
export function requireLanguage(code) {
  if (typeof code === "string" && code in LANGUAGES) return code;
  throw new HttpError(400, "language must be one of: " + Object.keys(LANGUAGES).join(", "));
}

/** Return trimmed text within the limit, or throw 400. Empty text is allowed when `optional` is true. */
export function requireText(value, { max, optional = false, field = "text" } = {}) {
  if (value === undefined || value === null || value === "") {
    if (optional) return "";
    throw new HttpError(400, `${field} is required`);
  }
  if (typeof value !== "string") throw new HttpError(400, `${field} must be a string`);
  const text = value.trim();
  if (text.length > max) throw new HttpError(400, `${field} must be at most ${max} characters`);
  return text;
}

/** Return a finite number within [min, max], or throw 400. */
export function requireNumber(value, { min = 0, max = Number.MAX_SAFE_INTEGER, field = "number" } = {}) {
  const number = typeof value === "string" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isFinite(number)) throw new HttpError(400, `${field} must be a number`);
  if (number < min || number > max) throw new HttpError(400, `${field} must be between ${min} and ${max}`);
  return number;
}

/** Rough byte size of a base64 string without decoding it. */
export function base64Bytes(base64) {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/**
 * Validate an inline media object { mimeType, data } and return it as a Gemini part.
 * Returns null when `media` is missing and `optional` is true.
 */
export function requireMedia(media, { allowed, maxBytes, optional = true, field = "media" } = {}) {
  if (!media) {
    if (optional) return null;
    throw new HttpError(400, `${field} is required`);
  }
  const { mimeType, data } = media;
  if (!allowed.includes(mimeType)) throw new HttpError(400, `${field} type must be one of: ${allowed.join(", ")}`);
  if (typeof data !== "string" || !/^[A-Za-z0-9+/]+=*$/.test(data)) throw new HttpError(400, `${field} data must be base64`);
  if (base64Bytes(data) > maxBytes) throw new HttpError(400, `${field} must be at most ${Math.round(maxBytes / 1024 / 1024)} MB`);
  return { inlineData: { mimeType, data } };
}

/** Return the value if it is in the allowed list, else the fallback. */
export function pickOne(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

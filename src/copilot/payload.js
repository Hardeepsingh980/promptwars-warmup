/**
 * Helpers that read an end-of-call webhook whose exact shape we do not control.
 * They search the JSON for a transcript and a caller number by common field names.
 */

const TRANSCRIPT_KEY = /transcript|transcription|conversation|dialog|messages|chat/i;
const NUMBER_KEY = /^(from|caller|caller_?number|customer_?number|phone|phone_?number|mobile|from_?number|contact)$/i;
const TEXT_KEYS = ["text", "content", "message", "transcript", "utterance"];
const ROLE_KEYS = ["role", "speaker", "sender", "from", "type"];
const MAX_DEPTH = 6;

/** Turn one transcript value (string or list of turns) into plain text. */
function transcriptText(value) {
  if (typeof value === "string") return value.trim();
  if (!Array.isArray(value)) return "";
  return value
    .map((turn) => {
      if (typeof turn === "string") return turn;
      if (!turn || typeof turn !== "object") return "";
      const text = TEXT_KEYS.map((key) => turn[key]).find((item) => typeof item === "string");
      const role = ROLE_KEYS.map((key) => turn[key]).find((item) => typeof item === "string");
      return text ? (role ? `${role}: ${text}` : text) : "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

/** Walk the payload and return the longest transcript we can find, or "". */
export function findTranscript(payload, depth = 0) {
  if (!payload || typeof payload !== "object" || depth > MAX_DEPTH) return "";
  let best = "";
  for (const [key, value] of Object.entries(payload)) {
    const candidate = TRANSCRIPT_KEY.test(key) ? transcriptText(value) : "";
    const nested = typeof value === "object" ? findTranscript(value, depth + 1) : "";
    for (const text of [candidate, nested]) if (text.length > best.length) best = text;
  }
  return best;
}

/** Return the first phone-like value under a caller-number key, digits only, or "". */
export function findCallerNumber(payload, depth = 0) {
  if (!payload || typeof payload !== "object" || depth > MAX_DEPTH) return "";
  for (const [key, value] of Object.entries(payload)) {
    if (NUMBER_KEY.test(key) && (typeof value === "string" || typeof value === "number")) {
      const digits = String(value).replace(/\D/g, "");
      if (digits.length >= 10 && digits.length <= 15) return digits;
    }
  }
  for (const value of Object.values(payload)) {
    if (value && typeof value === "object") {
      const found = findCallerNumber(value, depth + 1);
      if (found) return found;
    }
  }
  return "";
}

/** Hide all but the last 4 digits, for display. */
export function maskNumber(digits) {
  if (!digits) return "";
  return `${"•".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

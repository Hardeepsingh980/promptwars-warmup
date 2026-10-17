import { LANGUAGES } from "../config.js";
import { STRINGS, STRINGS_VERSION } from "../../shared/strings.js";
import { requireLanguage } from "../validate.js";

const cache = new Map();

const ROLE = `
Translate the user interface text of a mobile app for gig workers in India.
Keep each translation short, friendly, and simple, like words people use every day.
Keep {placeholders}, numbers, ₹ signs, and the names Haqdar, WhatsApp, Gemini, e-Shram, and OTP exactly as they are.`;

const SCHEMA = {
  type: "OBJECT",
  properties: Object.fromEntries(Object.keys(STRINGS).map((key) => [key, { type: "STRING" }])),
  required: Object.keys(STRINGS),
};

export function parseInput(query) {
  return { language: requireLanguage(query.language) };
}

/**
 * Keep a translation only when it is a non-empty string with the same {placeholders}.
 * Otherwise fall back to the English text for that key.
 */
export function sanitizeTranslation(translated, source = STRINGS) {
  const placeholders = (text) => (text.match(/\{\w+\}/g) ?? []).sort().join();
  return Object.fromEntries(
    Object.entries(source).map(([key, english]) => {
      const value = translated?.[key];
      const ok = typeof value === "string" && value.trim() !== "" && placeholders(value) === placeholders(english);
      return [key, ok ? value.trim() : english];
    }),
  );
}

const COLLECTION = "translations";

/**
 * Return the interface strings in the language. English needs no model call.
 * Finished translations are saved in the db, so a restart does not call the model again.
 * The in-memory cache holds promises, so requests that arrive together share one model call.
 */
export function run(ai, { language }, db = null) {
  if (language === "en") return Promise.resolve({ version: STRINGS_VERSION, strings: STRINGS });
  if (!cache.has(language)) {
    const saved = db?.get(COLLECTION, language);
    const pending = saved?.version === STRINGS_VERSION
      ? Promise.resolve({ version: saved.version, strings: saved.strings })
      : translate(ai, language).then((result) => { db?.put(COLLECTION, language, result); return result; }).catch((error) => {
        cache.delete(language);
        throw error;
      });
    cache.set(language, pending);
  }
  return cache.get(language);
}

async function translate(ai, language) {
  const { name, native } = LANGUAGES[language];
  const translated = await ai.generateJson({
    system: `${ROLE.trim()}\nTranslate into ${name} (${native}).`,
    parts: [{ text: JSON.stringify(STRINGS) }],
    schema: SCHEMA,
    maxOutputTokens: 8192,
    temperature: 0.2,
  });
  return { version: STRINGS_VERSION, strings: sanitizeTranslation(translated) };
}

/**
 * Translate every language in the background, one at a time, so the first
 * worker who picks a language does not wait. Failures are retried on demand.
 */
export async function warmUp(ai, db = null) {
  for (const language of Object.keys(LANGUAGES)) {
    await run(ai, { language }, db).catch(() => {});
  }
}

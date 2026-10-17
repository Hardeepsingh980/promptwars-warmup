import { createHash } from "node:crypto";
import { config } from "../config.js";
import { requireLanguage, requireText } from "../validate.js";

const CACHE_SIZE = 50;
const cache = new Map();

export function parseInput(body) {
  return {
    language: requireLanguage(body.language),
    text: requireText(body.text, { max: config.maxSpeakChars, field: "text" }),
  };
}

/** Turn text into speech. Repeat requests come from a small in-memory cache. */
export async function run(ai, { language, text }) {
  const key = createHash("sha256").update(`${language}\n${text}`).digest("hex");
  if (cache.has(key)) return cache.get(key);

  const audio = await ai.generateSpeech(text);
  cache.set(key, audio);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
  return audio;
}

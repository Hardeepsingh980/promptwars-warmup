/**
 * Interface text. English comes from /shared/strings.js.
 * Other languages come from the server, which asks Gemini once and caches the result.
 */
import { STRINGS, STRINGS_VERSION } from "/shared/strings.js";
import { api } from "./api.js";
import { $$ } from "./dom.js";
import * as store from "./store.js";

let current = STRINGS;

/** Look up a string. `{name}` placeholders are filled from `vars`. */
export function t(key, vars = {}) {
  const text = current[key] ?? STRINGS[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}

/** Fill every [data-i18n] text and [data-i18n-aria] label under `root`. */
export function applyStrings(root = document) {
  for (const element of $$("[data-i18n]", root)) element.textContent = t(element.dataset.i18n);
  for (const element of $$("[data-i18n-aria]", root)) element.setAttribute("aria-label", t(element.dataset.i18nAria));
}

/** Load the strings for a language. Falls back to English if the server call fails. */
export async function loadStrings(language) {
  if (language === "en") {
    current = STRINGS;
    return;
  }
  const cached = store.getCachedStrings(language, STRINGS_VERSION);
  if (cached) {
    current = cached;
    return;
  }
  try {
    const { version, strings } = await api.strings(language, STRINGS_VERSION);
    current = strings;
    store.setCachedStrings(language, version, strings);
  } catch {
    current = STRINGS;
  }
}

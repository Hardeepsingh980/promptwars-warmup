/**
 * Data that stays on the worker's phone: language, profile, and the earnings log.
 * Every read and write is wrapped in try/catch, because storage can be blocked.
 */
const KEYS = { language: "haqdar.language", profile: "haqdar.profile", log: "haqdar.log", strings: "haqdar.strings." };
const MAX_LOG_ENTRIES = 366;

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is full or blocked. The app still works for this visit.
  }
}

export const getLanguage = () => read(KEYS.language, null);
export const setLanguage = (code) => write(KEYS.language, code);

export const getProfile = () => read(KEYS.profile, {});
export const updateProfile = (changes) => write(KEYS.profile, { ...getProfile(), ...changes });

export const getLog = () => read(KEYS.log, []);

/** Add a day to the log, newest first. */
export function addLogEntry(entry) {
  const log = [{ id: crypto.randomUUID(), ...entry }, ...getLog()].slice(0, MAX_LOG_ENTRIES);
  write(KEYS.log, log);
  return log;
}

export function removeLogEntry(id) {
  const log = getLog().filter((entry) => entry.id !== id);
  write(KEYS.log, log);
  return log;
}

export const getCachedStrings = (language, version) => {
  const cached = read(KEYS.strings + language, null);
  return cached?.version === version ? cached.strings : null;
};
export const setCachedStrings = (language, version, strings) => write(KEYS.strings + language, { version, strings });

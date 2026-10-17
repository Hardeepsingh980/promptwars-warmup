/** Runtime configuration. Values come from the environment with safe defaults. */
export const config = Object.freeze({
  port: Number(process.env.PORT) || 3000,
  apiKey: process.env.GEMINI_API_KEY ?? "",
  model: process.env.GEMINI_MODEL ?? "gemini-3.8-flash",
  ttsModel: process.env.GEMINI_TTS_MODEL ?? "gemini-3.8-flash-tts",
  ttsVoice: process.env.GEMINI_TTS_VOICE ?? "Kore",
  requestTimeoutMs: 40_000,
  maxTextChars: 2_000,
  maxSpeakChars: 700,
  maxMediaBytes: 8 * 1024 * 1024,
  jsonBodyLimit: "12mb",
  rateLimit: Object.freeze({ windowMs: 60_000, max: 40 }),
});

/** Languages the app offers. Keys are BCP-47 codes. */
export const LANGUAGES = Object.freeze({
  hi: { name: "Hindi", native: "हिन्दी" },
  en: { name: "English", native: "English" },
  ta: { name: "Tamil", native: "தமிழ்" },
  te: { name: "Telugu", native: "తెలుగు" },
  kn: { name: "Kannada", native: "ಕನ್ನಡ" },
  mr: { name: "Marathi", native: "मराठी" },
  bn: { name: "Bengali", native: "বাংলা" },
  pa: { name: "Punjabi", native: "ਪੰਜਾਬੀ" },
  gu: { name: "Gujarati", native: "ગુજરાતી" },
});

export const IMAGE_TYPES = Object.freeze(["image/jpeg", "image/png", "image/webp"]);
export const AUDIO_TYPES = Object.freeze(["audio/wav", "audio/mpeg", "audio/mp3", "audio/ogg", "audio/aac", "audio/flac"]);

export const WORK_TYPES = Object.freeze(["delivery", "driver", "construction", "vendor", "domestic", "other"]);

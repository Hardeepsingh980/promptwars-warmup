/** Runtime configuration. Values come from the environment with safe defaults. */
export const config = Object.freeze({
  port: Number(process.env.PORT) || 3000,
  apiKey: process.env.GEMINI_API_KEY ?? "",
  copilotToolKey: process.env.COPILOT_TOOL_KEY ?? "",
  copilotWebhookToken: process.env.COPILOT_WEBHOOK_TOKEN ?? "",
  sessionSecret: process.env.SESSION_SECRET ?? "",
  dataFile: process.env.DATA_FILE ?? "data/haqdar.json",
  phoneLine: process.env.PHONE_LINE ?? "+918031450668",
  whatsapp: Object.freeze({
    apiKey: process.env.CHEERIO_API_KEY ?? "",
    baseUrl: process.env.CHEERIO_BASE_URL ?? "https://newprod.api.cheerio.in/direct-apis",
    webhookToken: process.env.WHATSAPP_WEBHOOK_TOKEN ?? "",
    number: process.env.WHATSAPP_NUMBER ?? "",
  }),
  liveModel: process.env.GEMINI_LIVE_MODEL ?? "gemini-3.8-live",
  liveVoice: process.env.GEMINI_LIVE_VOICE ?? "Kore",
  demoUser: Object.freeze({ phone: process.env.DEMO_PHONE ?? "9999999999", password: process.env.DEMO_PASSWORD ?? "saathi123", name: "Ravi" }),
  model: process.env.GEMINI_MODEL ?? "gemini-3.8-flash",
  ttsModel: process.env.GEMINI_TTS_MODEL ?? "gemini-3.8-flash-tts",
  ttsVoice: process.env.GEMINI_TTS_VOICE ?? "Kore",
  requestTimeoutMs: 40_000,
  maxTextChars: 2_000,
  maxSpeakChars: 1200,
  maxMediaBytes: 8 * 1024 * 1024,
  jsonBodyLimit: "12mb",
  smallBodyLimit: "64kb",
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

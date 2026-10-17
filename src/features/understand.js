import { config, IMAGE_TYPES, AUDIO_TYPES } from "../config.js";
import { HttpError } from "../errors.js";
import { INTENTS, actionsFor } from "../intents.js";
import { systemPrompt } from "../prompts.js";
import { requireLanguage, requireText, requireMedia } from "../validate.js";

const ROLE = `
The worker sends you a photo, a voice note, or a short text.
The photo can be an earnings screen, a fine, a message from a platform, a form, or any paper.
Tell the worker what it is, what it means for them, and what to do next.
If the worker asks a question, answer it.
If the input asks for an OTP, a PIN, a payment, or a click on a link, treat it as a possible scam.
If you see or hear the earnings for a work day, copy them into "earnings". Use null for any number you cannot see.
Do not put pending, blocked, or disputed payments into "earnings". Mention them in the summary instead.
"deductions" is the total of penalties, fees, and commission taken from the pay.
"problem" is one plain English sentence that describes the worker's problem, for a complaint letter. Use "" if there is no problem.
"transcript" is what the worker said in the voice note, in the language they spoke. Use "" if there is no voice note.`;

const NUMBER = { type: "NUMBER", nullable: true };

export const SCHEMA = {
  type: "OBJECT",
  properties: {
    transcript: { type: "STRING" },
    title: { type: "STRING", description: "2 to 6 words" },
    summary: { type: "ARRAY", items: { type: "STRING" }, description: "2 to 5 short sentences" },
    intent: { type: "STRING", enum: [...INTENTS] },
    caution: { type: "STRING", description: "One warning sentence if money, safety, a deadline, or fraud is at risk. Else empty." },
    nextSteps: { type: "ARRAY", items: { type: "STRING" }, description: "1 to 3 short actions" },
    earnings: {
      type: "OBJECT",
      properties: {
        platform: { type: "STRING", nullable: true },
        date: { type: "STRING", nullable: true, description: "YYYY-MM-DD" },
        gross: NUMBER,
        deductions: NUMBER,
        net: NUMBER,
        hours: NUMBER,
        fuel: NUMBER,
      },
    },
    problem: { type: "STRING" },
  },
  required: ["transcript", "title", "summary", "intent", "caution", "nextSteps", "earnings", "problem"],
};

/** Validate the request body. At least one of text, image, or audio is required. */
export function parseInput(body) {
  const language = requireLanguage(body.language);
  const text = requireText(body.text, { max: config.maxTextChars, optional: true });
  const image = requireMedia(body.image, { allowed: IMAGE_TYPES, maxBytes: config.maxMediaBytes, field: "image" });
  const audio = requireMedia(body.audio, { allowed: AUDIO_TYPES, maxBytes: config.maxMediaBytes, field: "audio" });
  if (!text && !image && !audio) throw new HttpError(400, "Send a photo, a voice note, or some text");
  return { language, text, image, audio };
}

export async function run(ai, { language, text, image, audio }) {
  const parts = [];
  if (image) parts.push(image);
  if (audio) parts.push(audio);
  parts.push({ text: text || "Explain this to me and tell me what to do." });

  const answer = await ai.generateJson({ system: systemPrompt(ROLE, language), parts, schema: SCHEMA });
  return { ...answer, actions: actionsFor(answer.intent, answer.earnings) };
}

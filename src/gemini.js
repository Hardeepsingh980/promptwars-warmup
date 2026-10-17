import { config } from "./config.js";
import { HttpError } from "./errors.js";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Call a Gemini model and return the parsed JSON body.
 * Throws HttpError(502) when Gemini fails or times out.
 */
async function callModel(model, body) {
  if (!config.apiKey) throw new HttpError(500, "GEMINI_API_KEY is not set on the server");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  try {
    const response = await fetch(`${BASE_URL}/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": config.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok) {
      const message = data?.error?.message ?? `Gemini returned HTTP ${response.status}`;
      throw new HttpError(502, message);
    }
    return data;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const reason = error.name === "AbortError" ? "Gemini took too long to answer" : error.message;
    throw new HttpError(502, reason);
  } finally {
    clearTimeout(timer);
  }
}

/** Pull the first candidate's text parts out of a generateContent response. */
function textOf(data) {
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  return parts.filter((part) => typeof part.text === "string").map((part) => part.text).join("");
}

/**
 * Ask the model for JSON that matches `schema`.
 * `parts` is the user content: text, inlineData images, or inlineData audio.
 */
export async function generateJson({ system, parts, schema, maxOutputTokens = 2048, temperature = 0.3 }) {
  const data = await callModel(config.model, {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature,
      maxOutputTokens,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  const text = textOf(data);
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(502, "Gemini returned a reply that is not valid JSON");
  }
}

/** Turn text into speech. Returns { mimeType, data } where data is base64 audio. */
export async function generateSpeech(text) {
  const data = await callModel(config.ttsModel, {
    contents: [{ role: "user", parts: [{ text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: config.ttsVoice } } },
    },
  });
  const audio = data?.candidates?.[0]?.content?.parts?.find((part) => part.inlineData)?.inlineData;
  if (!audio?.data) throw new HttpError(502, "Gemini returned no audio");
  return { mimeType: audio.mimeType ?? "audio/wav", data: audio.data };
}

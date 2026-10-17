/**
 * Saathi on WhatsApp. One incoming message can carry several requests at once:
 * a screenshot with a question, a status update, earnings to log. Gemini reads the
 * text, photo, or voice note, calls every tool it needs, and replies in the rider's language.
 * The reply goes back as text and as a voice note.
 */
import { LANGUAGES } from "../config.js";
import { summarizeLog } from "../../shared/pay.js";
import { TOOL_DECLARATIONS, runTool } from "../copilot/tools.js";
import { wavToMp3 } from "../audio/mp3.js";
import { prepareAudioForGemini } from "../audio/transcode.js";

const MAX_TOOL_ROUNDS = 4;
const MAX_MEDIA_BYTES = 16 * 1024 * 1024;
const SIGNUP_TEXT = "Namaste! Main Saathi hoon, Haqdar app ka co-pilot. Is number se abhi koi account nahi juda hai. Pehle app mein isi mobile number se sign up karein, phir yahan likhein ya bolein.";


/** Tools that make sense in a chat. Opening an app screen does not. */
export const WHATSAPP_TOOLS = TOOL_DECLARATIONS.filter((tool) => tool.name !== "open_screen");

export function buildSystemInstruction({ user, rider, unheard, week }) {
  const language = LANGUAGES[user.language] ?? LANGUAGES.hi;
  return [
    `You are Saathi, a warm and practical WhatsApp assistant for ${user.name}, a ${user.workType} worker in ${user.state || "India"}${user.platform ? ` who works with ${user.platform}` : ""}.`,
    `Reply in ${language.name} (${language.native}) in the script people use for it. If the rider writes or speaks in another language, reply in that one. Keep replies short: 2 to 6 lines, plain words, no headings. Use *bold* only for one key fact.`,
    `Rider status: ${rider.status}. Current order: ${rider.order ? JSON.stringify(rider.order) : "none"}. Unheard call messages: ${unheard.length}${unheard.length ? ` -> ${JSON.stringify(unheard)}` : ""}. Last 7 days: ${JSON.stringify(week)}.`,
    "One message may hold several requests. Handle all of them: answer the question, read any photo (payslip, fine, platform message, form) and explain it in simple words, log earnings you can see or hear, and update the ride status or the current order when the rider tells you where they are going. Call every tool you need before you answer, several at once if needed. Then confirm what you did in one line each.",
    "If a photo or message asks for an OTP, a PIN, a payment, or a link, warn that it looks like a scam. Never share the rider's phone number, location, or earnings with anyone else. Give information, not legal advice.",
    "Do not read numbers back as long lists. Say the one or two that matter.",
  ].join("\n");
}

/** Build the user message parts from the WhatsApp message, downloading media when present. */
async function buildParts(message, client) {
  const parts = [];
  if (message.type === "image" || message.type === "audio") {
    const media = await fetchMedia(message, client);
    if (media.buffer.length > MAX_MEDIA_BYTES) throw new Error("The file is too large");
    if (message.type === "audio") {
      // WhatsApp voice notes are OGG Opus, which Gemini does not read. ffmpeg turns them into WAV.
      const declared = media.mimeType.startsWith("audio/") ? media.mimeType : message.mimeType ?? "audio/ogg";
      const audio = await prepareAudioForGemini({ buffer: media.buffer, mimeType: declared });
      parts.push({ inlineData: { mimeType: audio.mimeType, data: audio.buffer.toString("base64") } });
    } else {
      parts.push({ inlineData: { mimeType: media.mimeType.startsWith("image/") ? media.mimeType : "image/jpeg", data: media.buffer.toString("base64") } });
    }
  }
  const text = [message.text, message.caption].filter(Boolean).join("\n");
  if (text) parts.push({ text });
  else if (message.type === "audio") parts.push({ text: "(voice note from the rider)" });
  else if (message.type === "image") parts.push({ text: "(photo from the rider, no caption: explain it and do what it calls for)" });
  else if (parts.length === 0) parts.push({ text: `(unsupported message type: ${message.type})` });
  return parts;
}

async function fetchMedia(message, client) {
  if (message.mediaId) return client.getMedia(message.mediaId);
  if (message.mediaUrl?.startsWith("https://")) {
    const response = await fetch(message.mediaUrl, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Media download failed with ${response.status}`);
    return { buffer: Buffer.from(await response.arrayBuffer()), mimeType: (response.headers.get("content-type") ?? message.mimeType ?? "application/octet-stream").split(";")[0] };
  }
  throw new Error("The message has no media to download");
}

/**
 * Run the tool loop for one message. Returns { reply, toolsRun }.
 * `deps` holds ai, users, copilot, earnings, and the WhatsApp client.
 */
export async function answerMessage({ message, user, deps }) {
  const { ai, copilot, earnings, client } = deps;
  const rider = copilot.getRider(user.id);
  const unheard = copilot.unheardMessages(user.id).map(({ callerType, purpose, details, urgency }) => ({ callerType, purpose, details, urgency }));
  const week = summarizeLog(earnings.list(user.id));
  const system = buildSystemInstruction({ user, rider, unheard, week });

  const timings = {};
  const timed = async (label, work) => { const start = Date.now(); try { return await work(); } finally { timings[label] = (timings[label] ?? 0) + Date.now() - start; } };

  const contents = [{ role: "user", parts: await timed("media", () => buildParts(message, client)) }];
  const toolsRun = [];
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const parts = await timed("model", () => ai.generateWithTools({ system, contents, tools: WHATSAPP_TOOLS }));
    const calls = parts.filter((part) => part.functionCall);
    if (calls.length === 0) {
      const reply = parts.filter((part) => typeof part.text === "string").map((part) => part.text).join("").trim();
      return { reply: reply || "Theek hai.", toolsRun, timings };
    }
    contents.push({ role: "model", parts });
    const responses = calls.map(({ functionCall }) => {
      const { result } = runTool({ name: functionCall.name, args: functionCall.args ?? {} }, { user, copilot, earnings });
      toolsRun.push(functionCall.name);
      return { functionResponse: { name: functionCall.name, response: result } };
    });
    contents.push({ role: "user", parts: responses });
  }
  return { reply: "Ho gaya.", toolsRun, timings };
}

/** Send the reply as text, then as a voice note when speech works. Returns what was sent. */
export async function deliverReply({ to, reply, user, deps, timings = {} }) {
  const { ai, client, log = console.log } = deps;
  const sent = { text: false, audio: false };
  const timed = async (label, work) => { const start = Date.now(); try { return await work(); } finally { timings[label] = Date.now() - start; } };
  await timed("sendText", () => client.sendText(to, reply));
  sent.text = true;
  try {
    const speech = await timed("tts", () => ai.generateSpeech(reply.replace(/\*/g, "").slice(0, 1200)));
    const mp3 = wavToMp3(Buffer.from(speech.data, "base64"));
    const mediaId = await timed("upload", () => client.uploadMedia({ buffer: mp3, filename: "saathi.mp3", mimeType: "audio/mpeg" }));
    await timed("sendAudio", () => client.sendAudio(to, mediaId));
    sent.audio = true;
  } catch (error) {
    log(`whatsapp voice reply skipped for ${user.name}: ${error.message}`);
  }
  return sent;
}

/** Handle one incoming message end to end. */
export async function handleIncoming(message, deps) {
  const { users, client, log = console.log } = deps;
  const user = users.byPhone(message.from);
  if (!user) {
    log(`whatsapp from unknown number ending ${message.from.slice(-4)}: sending the sign-up note`);
    await client.sendText(message.from, SIGNUP_TEXT).catch((error) => log(`sign-up note failed: ${error.message}`));
    return { handled: false, reason: "unknown number" };
  }
  try {
    const received = Date.now();
    const { reply, toolsRun, timings } = await answerMessage({ message, user, deps });
    const sent = await deliverReply({ to: message.from, reply, user, deps, timings });
    const spent = Object.entries(timings).map(([step, ms]) => `${step}=${(ms / 1000).toFixed(1)}s`).join(" ");
    log(`whatsapp reply to ${user.name} (${message.type}): tools=[${toolsRun.join(",")}] text=${sent.text} audio=${sent.audio} total=${((Date.now() - received) / 1000).toFixed(1)}s ${spent}`);
    return { handled: true, reply, toolsRun, sent };
  } catch (error) {
    log(`whatsapp error for ${user.name}: ${error.message}`);
    await client.sendText(message.from, "Maaf kijiye, abhi samajh nahi paaya. Thodi der baad phir se bhejiye.").catch(() => {});
    return { handled: false, reason: error.message };
  }
}

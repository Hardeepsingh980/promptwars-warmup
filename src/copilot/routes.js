import express from "express";
import { AUDIO_TYPES, config } from "../config.js";
import { HttpError } from "../errors.js";
import { systemPrompt } from "../prompts.js";
import { requireLanguage, requireMedia, requireNumber, requireText } from "../validate.js";
import { requireToolKey } from "./auth.js";
import { findCallerNumber, findTranscript, maskNumber } from "./payload.js";

const STATUSES = ["riding", "stopped", "offline"];
const MAX_PAYLOAD_CHARS = 20_000;

const CALL_ROLE = `
You read the record of a phone call. An AI assistant named Saathi answered it for a delivery rider who was riding.
Find who called, why, and the exact details the rider needs: gate codes, floor, landmark, changed order, deadlines, call-back requests.
"spoken" is what the rider hears at the next stop: one or two short sentences that start with who called.
Mark urgency "urgent" only for an emergency, a family need, or a deadline within the hour.
Set scamSuspected to true if the caller asked for an OTP, a PIN, a bank detail, or money.
If the record has no real conversation, say the caller hung up.`;

const CALL_SCHEMA = {
  type: "OBJECT",
  properties: {
    callerType: { type: "STRING", enum: ["customer", "restaurant", "platform", "family", "other"] },
    callerName: { type: "STRING", description: "The name the caller said, or empty. Never a role like customer." },
    purpose: { type: "STRING", description: "One short sentence" },
    details: { type: "STRING", description: "Exact details to pass on, or empty" },
    urgency: { type: "STRING", enum: ["low", "normal", "urgent"] },
    scamSuspected: { type: "BOOLEAN" },
    callBack: { type: "BOOLEAN", description: "True if the caller wants the rider to call back" },
    spoken: { type: "STRING" },
  },
  required: ["callerType", "callerName", "purpose", "details", "urgency", "scamSuspected", "callBack", "spoken"],
};

const ASK_ROLE = `
You are Saathi, a hands-free co-pilot for a delivery rider. The rider talks to you by voice, often while riding.
You get the rider's status, current order, and the messages from calls you answered.
Answer in one or two short spoken sentences. Keep the rider's eyes on the road: never ask them to read or type.
Pick an action when the rider asks for one:
start_riding (they start a ride), stop_riding (they stopped), set_eta (they give a new ETA in minutes), play_messages (they want their messages), clear_order (order delivered or cancelled), none.
"transcript" is what the rider said, in the language they spoke. Use "" for typed input.`;

const ASK_SCHEMA = {
  type: "OBJECT",
  properties: {
    transcript: { type: "STRING" },
    reply: { type: "STRING" },
    action: { type: "STRING", enum: ["none", "start_riding", "stop_riding", "set_eta", "play_messages", "clear_order"] },
    etaMinutes: { type: "NUMBER", nullable: true },
  },
  required: ["transcript", "reply", "action", "etaMinutes"],
};

/** The status that the phone agent sees. It never includes caller numbers or messages. */
function publicStatus(rider) {
  return {
    rider_name: rider.riderName,
    state: rider.status,
    current_order: rider.order
      ? { platform: rider.order.platform, customer_area: rider.order.customerArea, eta_minutes: rider.order.etaMinutes }
      : null,
  };
}

function parseOrder(order) {
  if (order === null || order === undefined) return null;
  if (typeof order !== "object") throw new HttpError(400, "order must be an object or null");
  const etaMinutes = order.etaMinutes === null || order.etaMinutes === undefined || order.etaMinutes === ""
    ? null
    : requireNumber(order.etaMinutes, { min: 0, max: 240, field: "etaMinutes" });
  return {
    platform: requireText(order.platform, { max: 40, optional: true, field: "platform" }),
    customerArea: requireText(order.customerArea, { max: 80, optional: true, field: "customerArea" }),
    etaMinutes,
  };
}

/** Validate a partial rider update from the rider's screen. */
export function parseRiderUpdate(body) {
  const changes = {};
  if ("riderName" in body) changes.riderName = requireText(body.riderName, { max: 40, field: "riderName" });
  if ("status" in body) {
    if (!STATUSES.includes(body.status)) throw new HttpError(400, `status must be one of: ${STATUSES.join(", ")}`);
    changes.status = body.status;
  }
  if ("language" in body) changes.language = requireLanguage(body.language);
  if ("order" in body) changes.order = parseOrder(body.order);
  return changes;
}

/** Apply the action the model picked to the rider state. Returns the changes made. */
export function applyAction(store, { action, etaMinutes }) {
  const rider = store.getRider();
  const changes = {
    start_riding: { status: "riding" },
    stop_riding: { status: "stopped" },
    clear_order: { order: null },
    set_eta: rider.order && etaMinutes >= 0 ? { order: { ...rider.order, etaMinutes: Math.round(etaMinutes) } } : null,
  }[action];
  if (changes) store.updateRider(changes);
  return changes ?? {};
}

/**
 * Routes for the riding co-pilot.
 * /status and /call-ended are for the phone agent and need the X-Copilot-Key header.
 * /rider, /messages/heard, and /ask are for the rider's own screen.
 */
export function createCopilotRouter({ ai, store, toolKey }) {
  const router = express.Router();
  const toolOnly = requireToolKey(toolKey);

  router.get("/status", toolOnly, (request, response) => {
    response.json(publicStatus(store.getRider()));
  });

  router.post("/call-ended", toolOnly, express.urlencoded({ extended: true, limit: "1mb" }), async (request, response) => {
    const payload = request.body ?? {};
    const rider = store.getRider();
    const callerNumber = findCallerNumber(payload);
    const transcript = findTranscript(payload);
    const record = [
      transcript ? `Transcript:\n${transcript}` : "No transcript field found.",
      `Full webhook data:\n${JSON.stringify(payload).slice(0, MAX_PAYLOAD_CHARS)}`,
    ].join("\n\n");

    const call = await ai.generateJson({
      system: systemPrompt(CALL_ROLE, rider.language),
      parts: [{ text: record }],
      schema: CALL_SCHEMA,
      maxOutputTokens: 1024,
    });
    const message = store.addMessage({ ...call, callerNumber: maskNumber(callerNumber), hasTranscript: Boolean(transcript) });
    response.json({ ok: true, id: message.id });
  });

  router.get("/rider", (request, response) => {
    response.set("Cache-Control", "no-store");
    response.json({ rider: store.getRider(), messages: store.listMessages(), version: store.version() });
  });

  router.put("/rider", (request, response) => {
    response.json({ rider: store.updateRider(parseRiderUpdate(request.body ?? {})) });
  });

  router.post("/messages/heard", (request, response) => {
    const ids = Array.isArray(request.body?.ids) ? request.body.ids.filter((id) => typeof id === "string").slice(0, 50) : [];
    store.markHeard(ids);
    response.json({ ok: true });
  });

  router.post("/ask", async (request, response) => {
    const body = request.body ?? {};
    const language = requireLanguage(body.language);
    const text = requireText(body.text, { max: config.maxTextChars, optional: true });
    const audio = requireMedia(body.audio, { allowed: AUDIO_TYPES, maxBytes: config.maxMediaBytes, field: "audio" });
    if (!text && !audio) throw new HttpError(400, "Send a voice note or some text");

    const rider = store.getRider();
    const unheard = store.listMessages().filter((message) => !message.heard)
      .map(({ callerType, purpose, details, urgency }) => ({ callerType, purpose, details, urgency }));
    const context = { status: rider.status, order: rider.order, unheardMessages: unheard };
    const parts = [{ text: `Rider context: ${JSON.stringify(context)}` }];
    if (audio) parts.push(audio);
    if (text) parts.push({ text: `Rider says: ${text}` });

    const answer = await ai.generateJson({ system: systemPrompt(ASK_ROLE, language), parts, schema: ASK_SCHEMA, maxOutputTokens: 512 });
    const changes = applyAction(store, answer);
    response.json({ ...answer, changes, rider: store.getRider() });
  });

  return router;
}

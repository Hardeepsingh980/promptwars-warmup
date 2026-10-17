/**
 * A WebSocket bridge between the rider's browser and the Gemini Live API.
 * The browser never sees the API key. The server runs Saathi's tools against the rider's data.
 *
 * Browser -> server JSON frames:
 *   { type: "audio", data }   16 kHz mono 16-bit PCM, base64, sent as the mic captures it
 *   { type: "text", text }    a typed message
 *   { type: "end" }           the mic stopped (audio stream end)
 * Server -> browser JSON frames:
 *   { type: "ready" } { type: "audio", data } (24 kHz PCM) { type: "interrupted" } { type: "turnComplete" }
 *   { type: "caption", role, text } { type: "tool", name, result, uiEvent } { type: "error", message } { type: "goAway" }
 */
import { WebSocketServer, WebSocket } from "ws";
import { LANGUAGES } from "../config.js";
import { COOKIE_NAME, parseCookies, readToken } from "../auth/session.js";
import { TOOL_DECLARATIONS, runTool } from "../copilot/tools.js";

const GEMINI_WS = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";
const MAX_FRAME_BYTES = 64 * 1024;

/** Saathi's live persona, built from the rider's own data. */
export function buildSystemInstruction({ user, rider, unheardCount, intro }) {
  const language = LANGUAGES[user.language] ?? LANGUAGES.hi;
  const order = rider.order
    ? `Current order: ${rider.order.platform || "unknown app"}, customer area ${rider.order.customerArea || "unknown"}, ETA ${rider.order.etaMinutes ?? "unknown"} minutes.`
    : "No current order.";
  return [
    `You are Saathi, a warm, lively voice co-pilot for ${user.name}, a ${user.workType} worker in ${user.state || "India"}${user.platform ? ` who works with ${user.platform}` : ""}.`,
    `Speak ${language.name}. Switch if the rider speaks another language. Use short, friendly spoken sentences, one or two at a time. Never read out lists of fields or JSON.`,
    `Rider status: ${rider.status}. ${order} Unheard call messages: ${unheardCount}.`,
    "While the rider rides, you answer their phone calls through a phone agent. At their next stop you tell them what each caller wanted. Use get_messages when they ask what calls came, and when they say they stopped.",
    "Use a tool only when the rider asks for it or states a fact that needs it: starting or stopping a ride, a new ETA, a new order, logging earnings, opening a screen. Never call a tool during a greeting. Confirm in one short sentence after a tool runs.",
    "You can also explain pay, government schemes, rights, and complaints in simple words. For a long task, open the matching screen with open_screen.",
    "Never share the rider's phone number, location, or earnings with anyone but the rider. Give information, not legal advice.",
    intro
      ? `This is the rider's first time. Greet ${user.name} by name, say in two sentences what you do (answer calls while they ride, brief them at stops, help with pay and rights), then ask if they want to try a sample call.`
      : `Greet ${user.name} by name in one short sentence and ask how you can help.`,
  ].join("\n");
}

function toolsFor(deps, user) {
  return (call) => runTool(call, { user, copilot: deps.copilot, earnings: deps.earnings });
}

/** Open one Gemini Live session for a browser socket. */
function bridge(browser, { user, deps, intro, log }) {
  const { config, copilot } = deps;
  const upstream = new WebSocket(`${GEMINI_WS}?key=${config.apiKey}`);
  const send = (frame) => { if (browser.readyState === WebSocket.OPEN) browser.send(JSON.stringify(frame)); };
  const sendUpstream = (frame) => { if (upstream.readyState === WebSocket.OPEN) upstream.send(JSON.stringify(frame)); };
  const tool = toolsFor(deps, user);
  let ready = false;

  upstream.on("open", () => {
    const rider = copilot.getRider(user.id);
    sendUpstream({
      setup: {
        model: `models/${config.liveModel}`,
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: config.liveVoice } } } },
        systemInstruction: { parts: [{ text: buildSystemInstruction({ user, rider, unheardCount: copilot.unheardMessages(user.id).length, intro }) }] },
        tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
        outputAudioTranscription: {},
        inputAudioTranscription: {},
      },
    });
  });

  upstream.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (message.setupComplete) {
      ready = true;
      send({ type: "ready" });
      // Ask Saathi to speak first, so the rider hears a greeting without pressing anything.
      sendUpstream({ clientContent: { turns: [{ role: "user", parts: [{ text: "(The rider just opened the app. Greet them.)" }] }], turnComplete: true } });
      return;
    }
    if (message.toolCall) {
      const responses = [];
      for (const call of message.toolCall.functionCalls ?? []) {
        const { result, uiEvent } = tool(call);
        responses.push({ id: call.id, name: call.name, response: result });
        send({ type: "tool", name: call.name, result, uiEvent });
      }
      sendUpstream({ toolResponse: { functionResponses: responses } });
      return;
    }
    const content = message.serverContent;
    if (!content) {
      if (message.goAway) send({ type: "goAway" });
      return;
    }
    for (const part of content.modelTurn?.parts ?? []) if (part.inlineData?.data) send({ type: "audio", data: part.inlineData.data });
    if (content.inputTranscription?.text) send({ type: "caption", role: "user", text: content.inputTranscription.text });
    if (content.outputTranscription?.text) send({ type: "caption", role: "saathi", text: content.outputTranscription.text });
    if (content.interrupted) send({ type: "interrupted" });
    if (content.turnComplete) send({ type: "turnComplete" });
  });

  upstream.on("error", (error) => { log(`live upstream error: ${error.message}`); send({ type: "error", message: "Saathi lost the voice connection" }); });
  upstream.on("close", (code, reason) => { send({ type: "closed", code, reason: reason.toString().slice(0, 120) }); browser.close(); });

  browser.on("message", (raw) => {
    if (raw.length > MAX_FRAME_BYTES) return;
    let frame;
    try {
      frame = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!ready) return;
    if (frame.type === "audio" && typeof frame.data === "string") {
      sendUpstream({ realtimeInput: { audio: { data: frame.data, mimeType: "audio/pcm;rate=16000" } } });
    } else if (frame.type === "text" && typeof frame.text === "string" && frame.text.trim()) {
      sendUpstream({ clientContent: { turns: [{ role: "user", parts: [{ text: frame.text.slice(0, 2000) }] }], turnComplete: true } });
    } else if (frame.type === "end") {
      sendUpstream({ realtimeInput: { audioStreamEnd: true } });
    }
  });
  browser.on("close", () => upstream.close());
  browser.on("error", () => upstream.close());
}

/**
 * Attach the /api/live WebSocket endpoint to an HTTP server.
 * `deps` holds config, users, copilot, and earnings. Each user gets one session at a time.
 */
export function attachLiveServer(server, deps, { log = console.log } = {}) {
  const wss = new WebSocketServer({ noServer: true });
  const active = new Map();

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname !== "/api/live") return socket.destroy();
    const userId = readToken(parseCookies(request.headers.cookie)[COOKIE_NAME], deps.config.sessionSecret);
    const user = userId ? deps.users.get(userId) : null;
    if (!user || !deps.config.apiKey) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      return socket.destroy();
    }
    wss.handleUpgrade(request, socket, head, (browser) => {
      log(`live session for ${user.name} from ${request.socket.remoteAddress}`);
      active.get(user.id)?.close(4000, "Replaced by a new session");
      active.set(user.id, browser);
      browser.on("close", () => { if (active.get(user.id) === browser) active.delete(user.id); });
      bridge(browser, { user, deps, intro: url.searchParams.get("intro") === "1", log });
    });
  });

  return wss;
}

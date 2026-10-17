import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { extractMessages } from "../src/whatsapp/payload.js";
import { parseWav, wavToMp3 } from "../src/audio/mp3.js";
import { answerMessage, buildSystemInstruction, WHATSAPP_TOOLS } from "../src/whatsapp/agent.js";
import { SECRETS, silentWav, startTestServer } from "./helpers.js";

let server;
let ravi;
const PHONE = "919999900101";

before(async () => {
  server = await startTestServer();
  ravi = server.client();
  await ravi.signup({ name: "Ravi", phone: PHONE.slice(2), password: "ravi1234", language: "hi" });
  await ravi.json("/api/auth/profile", { method: "PUT", body: { state: "Karnataka", workType: "delivery", platform: "Swiggy", setupDone: true } });
});
after(() => server.close());
beforeEach(() => {
  server.ai.calls = [];
  server.ai.toolReplies = [];
  server.whatsapp.sent = [];
});

const cloudApiPayload = (message) => ({
  object: "whatsapp_business_account",
  entry: [{ changes: [{ value: { messaging_product: "whatsapp", contacts: [{ wa_id: PHONE }], messages: [message] } }] }],
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const untilSent = async (count) => { for (let i = 0; i < 50 && server.whatsapp.sent.length < count; i++) await wait(20); };

test("extractMessages reads Cloud API payloads, flat payloads, and skips status updates", () => {
  const cloud = extractMessages(cloudApiPayload({ from: PHONE, id: "wamid.1", type: "image", image: { id: "img-1", mime_type: "image/jpeg", caption: "Is this fair?" } }));
  assert.equal(cloud.length, 1);
  assert.deepEqual({ ...cloud[0], timestamp: undefined }, { id: "wamid.1", from: PHONE, type: "image", text: "", caption: "Is this fair?", mediaId: "img-1", mediaUrl: null, mimeType: "image/jpeg", timestamp: undefined });

  const flat = extractMessages({ from: "+91 99999 00101", type: "text", text: "hello", id: "m2" });
  assert.equal(flat[0].from, PHONE);
  assert.equal(flat[0].text, "hello");

  const voice = extractMessages({ data: { sender: PHONE, voice: { url: "https://m.example/a.ogg", mimetype: "audio/ogg" } } });
  assert.equal(voice[0].type, "audio");
  assert.equal(voice[0].mediaUrl, "https://m.example/a.ogg");

  assert.equal(extractMessages({ entry: [{ changes: [{ value: { statuses: [{ id: "x", status: "delivered", recipient_id: PHONE }] } }] }] }).length, 0);
});

test("wavToMp3 encodes a WAV buffer into MP3 frames", () => {
  const wav = silentWav();
  const parsed = parseWav(wav);
  assert.equal(parsed.sampleRate, 24000);
  assert.equal(parsed.samples.length, 240);
  const mp3 = wavToMp3(wav);
  assert.ok(mp3.length > 0);
  assert.equal(mp3[0], 0xff, "MP3 frame sync");
  assert.throws(() => parseWav(Buffer.from("not a wav file at all, really not")));
});

test("the WhatsApp system instruction carries rider data and the tools leave out open_screen", () => {
  const text = buildSystemInstruction({
    user: { name: "Ravi", language: "hi", workType: "delivery", state: "Karnataka", platform: "Swiggy" },
    rider: { status: "riding", order: { platform: "Swiggy", customerArea: "HSR", etaMinutes: 8 } }, unheard: [], week: { total: 800 },
  });
  assert.match(text, /Ravi/);
  assert.match(text, /Hindi/);
  assert.match(text, /several requests/);
  assert.ok(WHATSAPP_TOOLS.every((tool) => tool.name !== "open_screen"));
  assert.ok(WHATSAPP_TOOLS.some((tool) => tool.name === "log_earnings"));
});

test("answerMessage runs every tool the model asks for, then returns the final text", async () => {
  const { users, copilot, earnings } = server.services;
  const user = users.byPhone(PHONE);
  server.ai.toolReplies = [
    [{ functionCall: { name: "set_order", args: { platform: "Swiggy", customer_area: "Koramangala", eta_minutes: 15 } } }, { functionCall: { name: "log_earnings", args: { earnings: 700, hours: 6, fuel: 100 } } }],
    [{ text: "Order set and earnings logged." }],
  ];
  const message = { id: "m1", from: PHONE, type: "image", mediaId: "img-1", caption: "Log this, and I am going to Koramangala, 15 min", text: "", mimeType: "image/jpeg" };
  const result = await answerMessage({ message, user, deps: { ai: server.ai, copilot, earnings, client: server.whatsapp } });
  assert.equal(result.reply, "Order set and earnings logged.");
  assert.deepEqual(result.toolsRun, ["set_order", "log_earnings"]);
  assert.equal(copilot.getRider(user.id).order.customerArea, "Koramangala");
  assert.equal(earnings.list(user.id)[0].net, 600);
  const firstCall = server.ai.calls[0];
  assert.equal(firstCall.contents[0].parts[0].inlineData.mimeType, "image/jpeg", "the photo went to the model");
  assert.match(firstCall.contents[0].parts[1].text, /Koramangala/);
  const secondCall = server.ai.calls[1];
  assert.equal(secondCall.contents.at(-1).parts.length, 2, "both tool results went back");
});

test("the webhook needs the token, answers fast, and replies with text and a voice note", async () => {
  const c = server.client();
  assert.equal((await c.call("/api/whatsapp/webhook/wrong", { method: "POST", body: {} })).status, 404);
  const verify = await fetch(`${server.baseUrl}/api/whatsapp/webhook/${SECRETS.whatsapp.webhookToken}?hub.challenge=abc123`);
  assert.equal(await verify.text(), "abc123");

  server.ai.toolReplies = [[{ text: "Namaste Ravi! Aaj kya madad karun?" }]];
  const response = await c.json(`/api/whatsapp/webhook/${SECRETS.whatsapp.webhookToken}`, { method: "POST", body: cloudApiPayload({ from: PHONE, id: "wamid.hi", type: "text", text: { body: "Namaste" } }) });
  assert.equal(response.status, 200);
  assert.equal(response.body.received, 1);
  await untilSent(2);
  assert.deepEqual(server.whatsapp.sent.map((item) => item.type), ["text", "audio"]);
  assert.equal(server.whatsapp.sent[0].to, PHONE);
  assert.equal(server.whatsapp.sent[0].text, "Namaste Ravi! Aaj kya madad karun?");
  assert.equal(server.whatsapp.media.get(server.whatsapp.sent[1].mediaId).mimeType, "audio/mpeg");
});

test("the same message id is handled once, and unknown numbers get a sign-up note", async () => {
  const c = server.client();
  await c.json(`/api/whatsapp/webhook?token=${SECRETS.whatsapp.webhookToken}`, { method: "POST", body: cloudApiPayload({ from: PHONE, id: "wamid.hi", type: "text", text: { body: "Namaste again" } }) });
  await wait(100);
  assert.equal(server.whatsapp.sent.length, 0, "a retried webhook does not send twice");

  await c.json(`/api/whatsapp/webhook?token=${SECRETS.whatsapp.webhookToken}`, { method: "POST", body: cloudApiPayload({ from: "919000000000", id: "wamid.new", type: "text", text: { body: "hi" } }) });
  await untilSent(1);
  assert.match(server.whatsapp.sent[0].text, /sign up/i);
  assert.equal(server.ai.calls.length, 0, "no model call for strangers");
});

test("a voice note is sent to the model as audio", async () => {
  const c = server.client();
  server.ai.toolReplies = [[{ text: "Suna." }]];
  await c.json(`/api/whatsapp/webhook/${SECRETS.whatsapp.webhookToken}`, { method: "POST", body: cloudApiPayload({ from: PHONE, id: "wamid.voice", type: "audio", audio: { id: "voice-1", mime_type: "audio/ogg; codecs=opus", voice: true } }) });
  await untilSent(1);
  const parts = server.ai.calls[0].contents[0].parts;
  const { hasFfmpeg } = await import("../src/audio/transcode.js");
  assert.equal(parts[0].inlineData.mimeType, (await hasFfmpeg()) ? "audio/wav" : "audio/ogg");
  assert.match(parts[1].text, /voice note/);
});

test("a duplicate-message rejection from Cheerio is not treated as a failure", async () => {
  const { createWhatsAppClient } = await import("../src/whatsapp/client.js");
  const fetchImpl = async () => new Response(JSON.stringify({ error: "Duplicate message (within TTL)" }), { status: 400, headers: { "content-type": "application/json" } });
  const client = createWhatsAppClient({ apiKey: "k", baseUrl: "https://cheerio.test", fetchImpl });
  const result = await client.sendText("919999900101", "hello");
  assert.equal(result.payload.duplicate, true);
  const failing = createWhatsAppClient({ apiKey: "k", baseUrl: "https://cheerio.test", fetchImpl: async () => new Response("{}", { status: 500, headers: { "content-type": "application/json" } }) });
  await assert.rejects(() => failing.sendText("919999900101", "hello"), /failed with 500/);
});

test("audio Gemini already reads is passed through; other audio converts with ffmpeg when present", async () => {
  const { prepareAudioForGemini, hasFfmpeg, geminiReadsAudio } = await import("../src/audio/transcode.js");
  assert.equal(geminiReadsAudio("audio/wav"), true);
  assert.equal(geminiReadsAudio("audio/ogg"), false);
  const wav = await prepareAudioForGemini({ buffer: silentWav(), mimeType: "audio/wav" });
  assert.equal(wav.mimeType, "audio/wav");
  const mp3 = await prepareAudioForGemini({ buffer: Buffer.from("x"), mimeType: "audio/mpeg; codecs=1" });
  assert.equal(mp3.mimeType, "audio/mp3");
  if (await hasFfmpeg()) {
    const { wavToMp3 } = await import("../src/audio/mp3.js");
    const converted = await prepareAudioForGemini({ buffer: wavToMp3(silentWav()), mimeType: "audio/ogg" });
    assert.equal(converted.mimeType, "audio/wav");
    assert.equal(converted.buffer.toString("ascii", 0, 4), "RIFF");
  } else {
    const passthrough = await prepareAudioForGemini({ buffer: Buffer.from("x"), mimeType: "audio/ogg; codecs=opus" });
    assert.equal(passthrough.converted, false);
  }
});

test("inflight tracks background jobs so shutdown can wait for them", async () => {
  const { track, pending, drain } = await import("../src/inflight.js");
  let release;
  const job = track(() => new Promise((resolve) => { release = resolve; }));
  assert.equal(pending(), 1);
  const drained = drain(5000);
  release();
  await job;
  await drained;
  assert.equal(pending(), 0);
  await track(() => { throw new Error("boom"); }, () => {});
  assert.equal(pending(), 0);
});

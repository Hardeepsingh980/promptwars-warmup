import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { findCallerNumber, findTranscript, maskNumber } from "../src/copilot/payload.js";
import { parseRiderUpdate, tokenMatches } from "../src/copilot/routes.js";
import { runTool, TOOL_DECLARATIONS } from "../src/copilot/tools.js";
import { buildSystemInstruction } from "../src/live/proxy.js";
import { SECRETS, startTestServer } from "./helpers.js";

let server;
let ravi;
before(async () => {
  server = await startTestServer();
  ravi = server.client();
  await ravi.signup({ name: "Ravi", phone: "9999900001", password: "ravi1234", language: "hi" });
});
after(() => server.close());

const callMessage = {
  callerType: "customer", callerName: "", purpose: "Asked for ETA", details: "Gate code 4521",
  urgency: "normal", scamSuspected: false, callBack: false, spoken: "A customer called. Gate code 4521.",
};

test("findTranscript reads a string or a list of turns at any depth", () => {
  assert.equal(findTranscript({ data: { transcript: "hello" } }), "hello");
  const turns = { call: { messages: [{ role: "agent", content: "Namaste" }, { role: "user", text: "Gate code 4521" }] } };
  assert.equal(findTranscript(turns), "agent: Namaste\nuser: Gate code 4521");
  assert.equal(findTranscript({ nothing: 1 }), "");
});

test("findCallerNumber finds digits under common keys and maskNumber hides them", () => {
  assert.equal(findCallerNumber({ call: { from: "+91 98765-43210" } }), "919876543210");
  assert.equal(findCallerNumber({ from: "agent" }), "");
  assert.equal(maskNumber("919876543210"), "••••••••3210");
});

test("parseRiderUpdate and tokenMatches validate input", () => {
  assert.deepEqual(parseRiderUpdate({ status: "stopped" }), { status: "stopped" });
  assert.throws(() => parseRiderUpdate({ status: "flying" }));
  assert.throws(() => parseRiderUpdate({ order: { etaMinutes: 999 } }));
  assert.equal(tokenMatches("abc", "abc"), true);
  assert.equal(tokenMatches("abd", "abc"), false);
  assert.equal(tokenMatches("abc", ""), false, "an empty expected token never matches");
});

test("runTool changes rider data and returns a ui event", () => {
  const { copilot, earnings, users } = server.services;
  const user = users.byPhone("919999900001");
  assert.equal(runTool({ name: "start_riding" }, { user, copilot, earnings }).result.status, "riding");
  assert.equal(copilot.lineOwnerId(), user.id, "starting a ride takes the phone line");
  assert.equal(runTool({ name: "set_eta", args: { minutes: 12.4 } }, { user, copilot, earnings }).result.eta_minutes, 12);
  const summary = runTool({ name: "log_earnings", args: { earnings: 900, hours: 8, fuel: 100 } }, { user, copilot, earnings });
  assert.equal(summary.result.net_rupees, 800);
  assert.equal(runTool({ name: "get_earnings_summary" }, { user, copilot, earnings }).result.total_rupees, 800);
  assert.deepEqual(runTool({ name: "open_screen", args: { screen: "benefits" } }, { user, copilot, earnings }).uiEvent, { type: "navigate", screen: "benefits" });
  assert.match(runTool({ name: "nope" }, { user, copilot, earnings }).result.error, /Unknown tool/);
  assert.ok(TOOL_DECLARATIONS.every((tool) => tool.name && tool.parameters));
});

test("the live system instruction uses the rider's own data and never the phone number", () => {
  const user = { name: "Ravi", language: "hi", workType: "delivery", state: "Karnataka", platform: "Swiggy", phone: "919999900001" };
  const text = buildSystemInstruction({ user, rider: { status: "riding", order: { platform: "Swiggy", customerArea: "HSR", etaMinutes: 8 } }, unheardCount: 2, intro: true });
  assert.match(text, /Ravi/);
  assert.match(text, /Hindi/);
  assert.match(text, /ETA 8 minutes/);
  assert.match(text, /first time/);
  assert.doesNotMatch(text, /919999900001/);
});

test("GET /status needs the tool key and shows the line owner only", async () => {
  const c = server.client();
  assert.equal((await c.call("/api/copilot/status")).status, 401);
  const status = await c.json("/api/copilot/status", { headers: { "X-Copilot-Key": SECRETS.copilotToolKey } });
  assert.equal(status.body.rider_name, "Ravi");
  assert.equal(status.body.state, "riding");
  assert.equal(status.body.current_order.eta_minutes, 12);
  assert.equal(status.body.messages, undefined);
});

test("POST /call-ended/:token needs the URL token, saves a masked message for the line owner", async () => {
  server.ai.reply = () => callMessage;
  const c = server.client();
  assert.equal((await c.call("/api/copilot/call-ended/wrong-token", { method: "POST", body: {} })).status, 404);
  const payload = { call: { from: "+919876543210", transcript: [{ role: "user", content: "Gate code 4521" }] } };
  const ok = await c.json(`/api/copilot/call-ended/${SECRETS.copilotWebhookToken}`, { method: "POST", body: payload });
  assert.equal(ok.status, 200);
  assert.match(server.ai.calls.at(-1).parts[0].text, /user: Gate code 4521/);

  const { body } = await ravi.json("/api/copilot/rider");
  assert.equal(body.onLine, true);
  assert.equal(body.messages[0].details, "Gate code 4521");
  assert.equal(body.messages[0].callerNumber, "••••••••3210");
  assert.equal(body.messages[0].heard, false);
});

test("another user cannot see the first user's messages", async () => {
  const other = server.client();
  await other.signup({ name: "Fatima", phone: "9999900002", password: "fatima12" });
  const { body } = await other.json("/api/copilot/rider");
  assert.equal(body.messages.length, 0);
  assert.equal(body.onLine, false);
});

test("sample call runs the real pipeline and is marked as a sample", async () => {
  server.ai.reply = () => callMessage;
  const { body } = await ravi.json("/api/copilot/sample-call", { method: "POST" });
  assert.equal(body.message.sample, true);
  assert.match(server.ai.calls.at(-1).parts[0].text, /Ravi ki assistant Saathi/);
});

test("POST /ask runs the tool the model picked", async () => {
  server.ai.reply = () => ({ transcript: "", reply: "Stopped.", tool: "stop_riding", minutes: null, screen: null });
  const { body } = await ravi.json("/api/copilot/ask", { method: "POST", body: { text: "I have stopped" } });
  assert.equal(body.rider.status, "stopped");
  assert.deepEqual(body.uiEvent, { type: "rider" });
  assert.equal((await ravi.json("/api/copilot/ask", { method: "POST", body: {} })).status, 400);
});

test("earnings routes are per user", async () => {
  const added = await ravi.json("/api/earnings", { method: "POST", body: { earnings: 1000, hours: 10, fuel: 150, date: "2026-10-17" } });
  assert.equal(added.status, 201);
  assert.equal(added.body.entry.net, 850);
  const list = await ravi.json("/api/earnings");
  assert.ok(list.body.entries.length >= 2);
  const other = server.client();
  await other.signup({ name: "Sunil", phone: "9999900003", password: "sunil123" });
  assert.equal((await other.json("/api/earnings")).body.entries.length, 0);
  await ravi.json(`/api/earnings/${added.body.entry.id}`, { method: "DELETE" });
  assert.ok(!(await ravi.json("/api/earnings")).body.entries.some((entry) => entry.id === added.body.entry.id));
});

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { createCopilotStore } from "../src/copilot/store.js";
import { findCallerNumber, findTranscript, maskNumber } from "../src/copilot/payload.js";
import { applyAction, parseRiderUpdate } from "../src/copilot/routes.js";

const KEY = "test-key";
const fakeAi = {
  reply: () => ({}),
  calls: [],
  async generateJson(request) {
    this.calls.push(request);
    return this.reply(request);
  },
};

let server;
let baseUrl;
let store;

before(async () => {
  store = createCopilotStore();
  const app = createApp({ ai: fakeAi, copilotStore: store, copilotToolKey: KEY, rateLimit: { windowMs: 60_000, max: 1000 } });
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/copilot`;
});
after(() => server.close());

const send = (path, { method = "GET", body, key } = {}) =>
  fetch(baseUrl + path, {
    method,
    headers: { "Content-Type": "application/json", ...(key ? { "X-Copilot-Key": key } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

test("findTranscript reads a string or a list of turns at any depth", () => {
  assert.equal(findTranscript({ data: { transcript: "hello" } }), "hello");
  const turns = { call: { messages: [{ role: "agent", content: "Namaste" }, { role: "user", text: "Gate code 4521" }] } };
  assert.equal(findTranscript(turns), "agent: Namaste\nuser: Gate code 4521");
  assert.equal(findTranscript({ nothing: 1 }), "");
});

test("findCallerNumber finds digits under common keys and maskNumber hides them", () => {
  assert.equal(findCallerNumber({ call: { from: "+91 98765-43210" } }), "919876543210");
  assert.equal(findCallerNumber({ caller_number: 9876543210 }), "9876543210");
  assert.equal(findCallerNumber({ from: "agent" }), "");
  assert.equal(maskNumber("919876543210"), "••••••••3210");
});

test("parseRiderUpdate accepts known fields and rejects bad ones", () => {
  assert.deepEqual(parseRiderUpdate({ status: "stopped" }), { status: "stopped" });
  assert.deepEqual(parseRiderUpdate({ order: { platform: "Swiggy", customerArea: "HSR", etaMinutes: "8" } }),
    { order: { platform: "Swiggy", customerArea: "HSR", etaMinutes: 8 } });
  assert.throws(() => parseRiderUpdate({ status: "flying" }));
  assert.throws(() => parseRiderUpdate({ order: { etaMinutes: 999 } }));
});

test("applyAction changes status and ETA only when it makes sense", () => {
  const local = createCopilotStore();
  applyAction(local, { action: "stop_riding" });
  assert.equal(local.getRider().status, "stopped");
  assert.deepEqual(applyAction(local, { action: "set_eta", etaMinutes: 5 }), {}, "no order means no ETA change");
  local.updateRider({ order: { platform: "Zomato", customerArea: "Indiranagar", etaMinutes: 10 } });
  applyAction(local, { action: "set_eta", etaMinutes: 4.6 });
  assert.equal(local.getRider().order.etaMinutes, 5);
  applyAction(local, { action: "clear_order" });
  assert.equal(local.getRider().order, null);
});

test("GET /status needs the tool key and hides messages", async () => {
  assert.equal((await send("/status")).status, 401);
  assert.equal((await send("/status", { key: "wrong" })).status, 401);
  store.updateRider({ riderName: "Ravi", status: "riding", order: { platform: "Swiggy", customerArea: "HSR Layout", etaMinutes: 8 } });
  const status = await (await send("/status", { key: KEY })).json();
  assert.deepEqual(status, {
    rider_name: "Ravi", state: "riding",
    current_order: { platform: "Swiggy", customer_area: "HSR Layout", eta_minutes: 8 },
  });
});

test("POST /call-ended needs the key, asks Gemini, and saves a masked message", async () => {
  fakeAi.calls = [];
  fakeAi.reply = () => ({
    callerType: "customer", callerName: "", purpose: "Asked for ETA", details: "Gate code 4521",
    urgency: "normal", scamSuspected: false, callBack: false, spoken: "A customer called. Gate code 4521.",
  });
  assert.equal((await send("/call-ended", { method: "POST", body: {} })).status, 401);

  const payload = { call: { from: "+919876543210", transcript: [{ role: "user", content: "Gate code 4521" }] } };
  const response = await send("/call-ended", { method: "POST", body: payload, key: KEY });
  assert.equal(response.status, 200);
  assert.match(fakeAi.calls[0].parts[0].text, /user: Gate code 4521/);

  const { messages } = await (await send("/rider")).json();
  assert.equal(messages[0].details, "Gate code 4521");
  assert.equal(messages[0].callerNumber, "••••••••3210");
  assert.equal(messages[0].heard, false);

  await send("/messages/heard", { method: "POST", body: { ids: [messages[0].id] } });
  const after = await (await send("/rider")).json();
  assert.equal(after.messages[0].heard, true);
});

test("PUT /rider validates the update", async () => {
  assert.equal((await send("/rider", { method: "PUT", body: { status: "stopped" } })).status, 200);
  assert.equal(store.getRider().status, "stopped");
  assert.equal((await send("/rider", { method: "PUT", body: { language: "xx" } })).status, 400);
});

test("POST /ask applies the action the model picked", async () => {
  store.updateRider({ status: "stopped" });
  fakeAi.reply = () => ({ transcript: "", reply: "Ride started.", action: "start_riding", etaMinutes: null });
  const answer = await (await send("/ask", { method: "POST", body: { language: "en", text: "I am starting my ride" } })).json();
  assert.equal(answer.reply, "Ride started.");
  assert.equal(answer.rider.status, "riding");
  assert.equal((await send("/ask", { method: "POST", body: { language: "en" } })).status, 400);
});

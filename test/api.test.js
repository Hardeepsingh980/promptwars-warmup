import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { clearCache } from "../src/features/fairpay.js";

/**
 * A fake model client. Each test sets `reply` to the JSON the model returns.
 * `calls` records every request so tests can check what the server sent.
 */
const fakeAi = {
  reply: () => ({}),
  calls: [],
  async generateJson(request) {
    this.calls.push(request);
    return this.reply(request);
  },
  async generateSpeech(text) {
    this.calls.push({ text });
    return { mimeType: "audio/wav", data: "UklGRg==" };
  },
};

let server;
let baseUrl;

before(async () => {
  const app = createApp({ ai: fakeAi, rateLimit: { windowMs: 60_000, max: 1000 } });
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());
beforeEach(() => {
  fakeAi.calls = [];
  clearCache();
});

const post = (path, body) =>
  fetch(baseUrl + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("GET /api/meta lists languages, states, and helplines", async () => {
  const response = await fetch(baseUrl + "/api/meta");
  assert.equal(response.status, 200);
  const meta = await response.json();
  assert.ok("hi" in meta.languages);
  assert.ok(meta.states.includes("Karnataka"));
  assert.ok(meta.helplines.some((line) => line.number === "1930"));
});

test("responses carry security headers", async () => {
  const response = await fetch(baseUrl + "/healthz");
  assert.match(response.headers.get("content-security-policy"), /default-src 'self'/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-powered-by"), null);
});

test("POST /api/understand needs some input", async () => {
  const response = await post("/api/understand", { language: "hi" });
  assert.equal(response.status, 400);
  assert.equal(fakeAi.calls.length, 0);
});

test("POST /api/understand adds action buttons from the intent", async () => {
  fakeAi.reply = () => ({
    transcript: "", title: "Earnings", summary: ["You earned 850."], intent: "earnings", caution: "",
    nextSteps: [], earnings: { gross: 850, net: 650, hours: 9, fuel: 200 }, problem: "",
  });
  const response = await post("/api/understand", { language: "hi", text: "850 today" });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.actions, ["log_earnings"]);
  assert.match(fakeAi.calls[0].system, /Hindi/);
});

test("POST /api/understand rejects a file type we do not accept", async () => {
  const response = await post("/api/understand", { language: "en", image: { mimeType: "image/svg+xml", data: "AAAA" } });
  assert.equal(response.status, 400);
});

test("POST /api/fairpay uses the wage the worker typed and does not ask the model for it", async () => {
  fakeAi.reply = () => ({ headline: "Fair day", lines: ["ok"], tips: ["tip"] });
  const response = await post("/api/fairpay", { language: "en", state: "Delhi", earnings: 1000, hours: 8, fuel: 100, minimumWageDaily: 700 });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.pay.net, 900);
  assert.equal(body.minimumWage.source, "user");
  assert.equal(body.verdict, "fair");
  assert.equal(fakeAi.calls.length, 1);
});

test("POST /api/fairpay estimates the wage once per state and caches it", async () => {
  fakeAi.reply = (request) =>
    request.schema.properties.daily ? { daily: 500, note: "estimate" } : { headline: "h", lines: [], tips: [] };
  const first = await (await post("/api/fairpay", { language: "hi", state: "Goa", earnings: 400, hours: 10 })).json();
  assert.equal(first.minimumWage.source, "ai_estimate");
  assert.equal(first.verdict, "very_low");
  await post("/api/fairpay", { language: "hi", state: "Goa", earnings: 400, hours: 10 });
  const estimateCalls = fakeAi.calls.filter((call) => call.schema.properties.daily);
  assert.equal(estimateCalls.length, 1);
});

test("POST /api/fairpay rejects an unknown state", async () => {
  const response = await post("/api/fairpay", { language: "hi", state: "Atlantis", earnings: 1, hours: 1 });
  assert.equal(response.status, 400);
});

test("POST /api/schemes keeps official links and drops invented schemes", async () => {
  fakeAi.reply = () => ({
    intro: "Hello",
    schemes: [
      { id: "eshram", whyItFits: "fits", benefit: "card", steps: ["a"], link: "https://evil.example" },
      { id: "made-up", whyItFits: "x", benefit: "x", steps: [] },
    ],
    laws: [{ id: "karnataka-gig-act", explain: "explained" }],
  });
  const response = await post("/api/schemes", { language: "kn", state: "Karnataka", age: 28, monthlyIncome: 14000, workType: "delivery" });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body.schemes.map((scheme) => scheme.id), ["eshram"]);
  assert.equal(body.schemes[0].link, "https://eshram.gov.in");
  assert.equal(body.laws[0].id, "karnataka-gig-act");
});

test("POST /api/complaint adds the send-to label and the escalation ladder", async () => {
  fakeAi.reply = () => ({ subject: "S", body: "B", summary: ["s"], evidence: ["e"], sendTo: "platform_support" });
  const response = await post("/api/complaint", { language: "hi", problem: "Account blocked", platform: "Zomato" });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.match(body.sendTo.label, /grievance officer/);
  assert.equal(body.escalation.length, 3);
});

test("POST /api/speak returns audio", async () => {
  const response = await post("/api/speak", { language: "hi", text: "नमस्ते" });
  const body = await response.json();
  assert.equal(body.mimeType, "audio/wav");
});

test("bad JSON returns 400 and unknown API paths return 404", async () => {
  const bad = await fetch(baseUrl + "/api/understand", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{oops" });
  assert.equal(bad.status, 400);
  const missing = await fetch(baseUrl + "/api/nope");
  assert.equal(missing.status, 404);
});

test("the API returns 429 when a client sends too many requests", async () => {
  const app = createApp({ ai: fakeAi, rateLimit: { windowMs: 60_000, max: 1 } });
  const limited = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const url = `http://127.0.0.1:${limited.address().port}/api/meta`;
  assert.equal((await fetch(url)).status, 200);
  assert.equal((await fetch(url)).status, 429);
  limited.close();
});

test("GET /api/strings returns English with no model call and validates the language", async () => {
  const english = await (await fetch(baseUrl + "/api/strings?language=en")).json();
  assert.equal(english.strings.nav_ask, "Ask");
  assert.equal(fakeAi.calls.length, 0);
  assert.equal((await fetch(baseUrl + "/api/strings?language=zz")).status, 400);
});

test("GET /api/strings shares one model call between requests for the same language", async () => {
  fakeAi.reply = (request) => Object.fromEntries(Object.keys(request.schema.properties).map((key) => [key, `ta:${key}`]));
  const [first, second] = await Promise.all([
    fetch(baseUrl + "/api/strings?language=ta").then((response) => response.json()),
    fetch(baseUrl + "/api/strings?language=ta").then((response) => response.json()),
  ]);
  assert.equal(first.strings.nav_ask, "ta:nav_ask");
  assert.deepEqual(first, second);
  assert.equal(fakeAi.calls.length, 1);
});

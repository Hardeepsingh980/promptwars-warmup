import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { clearCache } from "../src/features/fairpay.js";
import { startTestServer } from "./helpers.js";

let server;
let fakeAi;
let user;
let baseUrl;

before(async () => {
  server = await startTestServer();
  fakeAi = server.ai;
  baseUrl = server.baseUrl;
  user = server.client();
  await user.signup({ name: "Tester", phone: "9000000001", password: "tester123" });
});
after(() => server.close());
beforeEach(() => {
  fakeAi.calls = [];
  clearCache();
});

const post = (path, body) => user.call(path, { method: "POST", body });

test("GET /api/meta lists languages, states, and helplines", async () => {
  const response = await fetch(baseUrl + "/api/meta");
  assert.equal(response.status, 200);
  const meta = await response.json();
  assert.ok("hi" in meta.languages);
  assert.ok(meta.states.includes("Karnataka"));
  assert.ok(meta.helplines.some((line) => line.number === "1930"));
});

test("responses carry security headers", async () => {
  const response = await fetch(baseUrl + "/health");
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
  const missing = await user.call("/api/nope");
  assert.equal(missing.status, 404);
  assert.equal((await fetch(baseUrl + "/api/nope")).status, 401, "unknown paths need a login too, so they reveal nothing");
});

test("the API returns 429 when a client sends too many requests", async () => {
  const limited = await startTestServer({ rateLimit: { windowMs: 60_000, max: 1 } });
  const url = `${limited.baseUrl}/api/meta`;
  assert.equal((await fetch(url)).status, 200);
  assert.equal((await fetch(url)).status, 429);
  limited.close();
});

test("GET /api/strings returns English with no model call and validates the language", async () => {
  const english = await (await fetch(baseUrl + "/api/strings?language=en")).json();
  assert.equal(english.strings.nav_home, "Home", "strings are public, the login screen needs them");
  assert.equal(fakeAi.calls.length, 0);
  assert.equal((await fetch(baseUrl + "/api/strings?language=zz")).status, 400);
});

test("GET /api/strings shares one model call between requests for the same language", async () => {
  fakeAi.reply = (request) => Object.fromEntries(Object.keys(request.schema.properties).map((key) => [key, `ta:${key}`]));
  const [first, second] = await Promise.all([
    fetch(baseUrl + "/api/strings?language=ta").then((response) => response.json()),
    fetch(baseUrl + "/api/strings?language=ta").then((response) => response.json()),
  ]);
  assert.equal(first.strings.nav_home, "ta:nav_home");
  assert.deepEqual(first, second);
  assert.equal(fakeAi.calls.length, 1);
});

test("translations are saved in the db, so a second server start needs no model call", async () => {
  const { run } = await import("../src/features/translate.js");
  const { openDb } = await import("../src/db.js");
  const { createFakeAi } = await import("./helpers.js");
  const db = await openDb(null);
  const ai = createFakeAi();
  ai.reply = (request) => Object.fromEntries(Object.keys(request.schema.properties).map((key) => [key, `kn:${key}`]));
  const first = await run(ai, { language: "kn" }, db);
  assert.equal(first.strings.nav_home, "kn:nav_home");
  assert.equal(ai.calls.length, 1);
  assert.equal(db.get("translations", "kn").strings.nav_home, "kn:nav_home");
});

test("responses are compressed when the client accepts it", async () => {
  const response = await fetch(baseUrl + "/css/app.css", { headers: { "Accept-Encoding": "gzip" } });
  assert.equal(response.headers.get("content-encoding"), "gzip");
});

test("HSTS is sent only on https requests", async () => {
  const plain = await fetch(baseUrl + "/health");
  assert.equal(plain.headers.get("strict-transport-security"), null);
  const forwarded = await fetch(baseUrl + "/health", { headers: { "X-Forwarded-Proto": "https" } });
  assert.match(forwarded.headers.get("strict-transport-security"), /max-age/);
});

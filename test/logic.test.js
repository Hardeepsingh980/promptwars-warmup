import { test } from "node:test";
import assert from "node:assert/strict";
import { computePay, payVerdict, summarizeLog } from "../shared/pay.js";
import { filterSchemes, lawsFor } from "../src/eligibility.js";
import { actionsFor } from "../src/intents.js";
import { createRateLimiter } from "../src/rateLimit.js";
import { requireText, requireNumber, requireMedia, requireLanguage, base64Bytes } from "../src/validate.js";
import { mergeById } from "../src/features/schemes.js";
import { HttpError } from "../src/errors.js";

test("computePay subtracts costs and rounds to whole rupees", () => {
  const pay = computePay({ earnings: 850, hours: 9, fuel: 200 });
  assert.equal(pay.net, 650);
  assert.equal(pay.perHour, 72);
  assert.equal(pay.dailyEquivalent, 578);
  assert.equal(pay.costShare, 0.24);
});

test("computePay returns null rates when hours is zero", () => {
  const pay = computePay({ earnings: 500, hours: 0 });
  assert.equal(pay.perHour, null);
  assert.equal(pay.dailyEquivalent, null);
});

test("payVerdict uses 110% and 80% of the minimum wage as limits", () => {
  assert.equal(payVerdict(550, 500), "fair");
  assert.equal(payVerdict(549, 500), "low");
  assert.equal(payVerdict(400, 500), "low");
  assert.equal(payVerdict(399, 500), "very_low");
  assert.equal(payVerdict(null, 500), "unknown");
  assert.equal(payVerdict(500, 0), "unknown");
});

test("summarizeLog counts only the last 7 days and finds the best day", () => {
  const today = new Date("2026-10-17T12:00:00");
  const entries = [
    { date: "2026-10-17", net: 600, hours: 8 },
    { date: "2026-10-11", net: 900, hours: 10 },
    { date: "2026-10-10", net: 5000, hours: 10 },
  ];
  const summary = summarizeLog(entries, { today });
  assert.equal(summary.count, 2);
  assert.equal(summary.total, 1500);
  assert.equal(summary.perHour, 83);
  assert.equal(summary.best.date, "2026-10-11");
});

test("filterSchemes applies age, income, and work type rules", () => {
  const ids = (profile) => filterSchemes(profile).map((scheme) => scheme.id);
  const young = ids({ age: 28, monthlyIncome: 14000, workType: "delivery" });
  assert.ok(young.includes("pmsym"));
  assert.ok(young.includes("eshram"));
  assert.ok(!young.includes("svanidhi"));
  assert.ok(!young.includes("bocw"));

  const older = ids({ age: 45, monthlyIncome: 30000, workType: "construction" });
  assert.ok(!older.includes("pmsym"), "PM-SYM stops at age 40");
  assert.ok(!older.includes("pmjay"), "income is above the PM-JAY limit");
  assert.ok(older.includes("bocw"));

  assert.ok(ids({ age: 30, monthlyIncome: 9000, workType: "vendor" }).includes("svanidhi"));
});

test("lawsFor puts national laws first and adds state laws", () => {
  assert.deepEqual(lawsFor("Karnataka").map((law) => law.id), ["code-social-security", "karnataka-gig-act"]);
  assert.deepEqual(lawsFor("Goa").map((law) => law.id), ["code-social-security"]);
});

test("actionsFor maps intents and adds log_earnings only for a work day", () => {
  assert.deepEqual(actionsFor("account_blocked", {}), ["complaint", "call_legal_aid"]);
  assert.deepEqual(actionsFor("general_question", { net: 650, hours: 9 }), ["log_earnings"]);
  assert.deepEqual(actionsFor("earnings", { net: 650 }), ["log_earnings"]);
  assert.deepEqual(actionsFor("payment_delay", { net: 2400, hours: null }), ["complaint"], "a stuck payment is not a work day");
  assert.deepEqual(actionsFor("unknown_intent", null), []);
});

test("mergeById keeps our records and drops ids the model invented", () => {
  const records = [{ id: "a", link: "https://a" }, { id: "b", link: "https://b" }];
  const explained = [{ id: "b", benefit: "B" }, { id: "x", benefit: "made up", link: "https://evil" }];
  assert.deepEqual(mergeById(records, explained, ["benefit"]), [{ id: "b", link: "https://b", benefit: "B" }]);
});

test("mergeById never lets the model replace our link or name", () => {
  const records = [{ id: "a", name: "Real", link: "https://a" }];
  const merged = mergeById(records, [{ id: "a", name: "Fake", link: "https://evil", benefit: "ok" }], ["benefit"]);
  assert.deepEqual(merged, [{ id: "a", name: "Real", link: "https://a", benefit: "ok" }]);
});

test("rate limiter blocks after max requests in the window and sweeps stale keys", () => {
  let clock = 0;
  const limiter = createRateLimiter({ windowMs: 1000, max: 2, now: () => clock, sweepEvery: 5000 });
  assert.equal(limiter.isAllowed("ip"), true);
  assert.equal(limiter.isAllowed("ip"), true);
  assert.equal(limiter.isAllowed("ip"), false);
  assert.equal(limiter.isAllowed("other"), true);
  clock = 1001;
  assert.equal(limiter.isAllowed("ip"), true);
  assert.equal(limiter.size(), 2);
  clock = 6000;
  limiter.isAllowed("third");
  assert.equal(limiter.size(), 1, "old keys are swept once the sweep interval passes");
});

test("validators reject bad input with HTTP 400", () => {
  const is400 = (fn) => assert.throws(fn, (error) => error instanceof HttpError && error.status === 400);
  is400(() => requireLanguage("xx"));
  is400(() => requireText("a".repeat(11), { max: 10 }));
  is400(() => requireText("", { max: 10 }));
  is400(() => requireNumber("abc"));
  is400(() => requireNumber(-1, { min: 0 }));
  is400(() => requireMedia({ mimeType: "text/html", data: "AAAA" }, { allowed: ["image/png"], maxBytes: 10 }));
  is400(() => requireMedia({ mimeType: "image/png", data: "<script>" }, { allowed: ["image/png"], maxBytes: 10 }));
  is400(() => requireMedia({ mimeType: "image/png", data: "A".repeat(100) }, { allowed: ["image/png"], maxBytes: 10 }));
  assert.equal(requireText("  hi  ", { max: 10 }), "hi");
  assert.equal(requireNumber("12.5"), 12.5);
  assert.equal(base64Bytes("AAAA"), 3);
  assert.equal(base64Bytes("AA=="), 1);
});

test("sanitizeTranslation falls back to English for bad or missing values", async () => {
  const { sanitizeTranslation } = await import("../src/features/translate.js");
  const source = { a: "Hello", b: "Wait {n} days", c: "Bye" };
  const result = sanitizeTranslation({ a: "नमस्ते", b: "इंतज़ार करें", c: "  " }, source);
  assert.deepEqual(result, { a: "नमस्ते", b: "Wait {n} days", c: "Bye" });
});

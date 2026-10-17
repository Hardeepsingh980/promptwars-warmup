import { WORK_TYPES } from "../config.js";
import { HttpError } from "../errors.js";
import { STATES } from "../data/states.js";
import { computePay, payVerdict } from "../../shared/pay.js";
import { systemPrompt } from "../prompts.js";
import { requireLanguage, requireNumber, requireText, pickOne } from "../validate.js";

const ESTIMATE_TTL_MS = 6 * 60 * 60 * 1000;
const estimateCache = new Map();

const ESTIMATE_SCHEMA = {
  type: "OBJECT",
  properties: {
    daily: { type: "NUMBER", description: "Rupees per day" },
    note: { type: "STRING", description: "Short English note: skill level, zone, and when it was set" },
  },
  required: ["daily", "note"],
};

const EXPLAIN_ROLE = `
The app already calculated the worker's pay for one day. You get the numbers and a verdict.
The verdict compares an 8-hour day at the worker's real hourly rate with the minimum wage.
Write a one-line headline, 2 to 4 short sentences that explain the numbers, and 2 or 3 practical tips.
The tips help the worker keep more money or protect their earnings. Name the biggest cost if costs are high.
Do not change or recalculate the numbers.`;

const EXPLAIN_SCHEMA = {
  type: "OBJECT",
  properties: {
    headline: { type: "STRING" },
    lines: { type: "ARRAY", items: { type: "STRING" } },
    tips: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["headline", "lines", "tips"],
};

export function parseInput(body) {
  const state = requireText(body.state, { max: 60, field: "state" });
  if (!STATES.includes(state)) throw new HttpError(400, "state must be an Indian state or union territory");
  const minimumWageDaily = body.minimumWageDaily === undefined || body.minimumWageDaily === null || body.minimumWageDaily === ""
    ? null
    : requireNumber(body.minimumWageDaily, { min: 1, max: 10_000, field: "minimumWageDaily" });
  return {
    language: requireLanguage(body.language),
    state,
    workType: pickOne(body.workType, WORK_TYPES, "other"),
    earnings: requireNumber(body.earnings, { min: 0, max: 1_000_000, field: "earnings" }),
    hours: requireNumber(body.hours, { min: 0.25, max: 24, field: "hours" }),
    fuel: requireNumber(body.fuel ?? 0, { min: 0, max: 1_000_000, field: "fuel" }),
    other: requireNumber(body.other ?? 0, { min: 0, max: 1_000_000, field: "other" }),
    minimumWageDaily,
  };
}

/** Ask the model for an approximate minimum wage. Results are cached per state. */
async function estimateMinimumWage(ai, state) {
  const cached = estimateCache.get(state);
  if (cached && Date.now() - cached.at < ESTIMATE_TTL_MS) return cached.value;

  const value = await ai.generateJson({
    system: "You know Indian labour law. Give your best estimate. Answer with JSON only.",
    parts: [{ text: `What is the current statutory minimum daily wage, in rupees, for an unskilled worker in ${state}, India? Use the most common zone.` }],
    schema: ESTIMATE_SCHEMA,
    maxOutputTokens: 256,
    temperature: 0,
  });
  if (!(value.daily > 0)) throw new HttpError(502, "Could not estimate the minimum wage. Please type it in.");
  estimateCache.set(state, { at: Date.now(), value });
  return value;
}

export async function run(ai, input) {
  const pay = computePay(input);
  const minimumWage = input.minimumWageDaily
    ? { daily: input.minimumWageDaily, source: "user", note: "Typed by you" }
    : { ...(await estimateMinimumWage(ai, input.state)), source: "ai_estimate" };
  const verdict = payVerdict(pay.dailyEquivalent, minimumWage.daily);

  const facts = {
    state: input.state,
    workType: input.workType,
    earningsRupees: pay.earnings,
    hoursWorked: pay.hours,
    fuelRupees: pay.fuel,
    otherCostsRupees: pay.other,
    netRupees: pay.net,
    netPerHourRupees: pay.perHour,
    eightHourDayRupees: pay.dailyEquivalent,
    costSharePercent: Math.round(pay.costShare * 100),
    minimumWagePerDayRupees: minimumWage.daily,
    verdict,
  };
  const message = await ai.generateJson({
    system: systemPrompt(EXPLAIN_ROLE, input.language),
    parts: [{ text: JSON.stringify(facts) }],
    schema: EXPLAIN_SCHEMA,
    maxOutputTokens: 1024,
  });
  return { pay, minimumWage, verdict, message };
}

/** For tests: clear the minimum wage cache. */
export function clearCache() {
  estimateCache.clear();
}

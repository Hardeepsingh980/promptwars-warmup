import { WORK_TYPES } from "../config.js";
import { HttpError } from "../errors.js";
import { STATES } from "../data/states.js";
import { filterSchemes, lawsFor } from "../eligibility.js";
import { systemPrompt } from "../prompts.js";
import { requireLanguage, requireNumber, requireText, pickOne } from "../validate.js";

const ROLE = `
You get a worker profile, a list of government schemes the worker can use, and the laws that apply in their state.
For each scheme, write why it fits this worker in one sentence, the benefit in simple words, 2 to 4 steps to apply, and the list of documents in the worker's language.
For each law, explain in 1 or 2 sentences what it means for this worker.
Write a one or two sentence intro. Use only the scheme and law ids you are given.`;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    intro: { type: "STRING" },
    schemes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING" },
          whyItFits: { type: "STRING" },
          benefit: { type: "STRING" },
          steps: { type: "ARRAY", items: { type: "STRING" } },
          documents: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["id", "whyItFits", "benefit", "steps", "documents"],
      },
    },
    laws: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { id: { type: "STRING" }, explain: { type: "STRING" } },
        required: ["id", "explain"],
      },
    },
  },
  required: ["intro", "schemes", "laws"],
};

export function parseInput(body) {
  const state = requireText(body.state, { max: 60, field: "state" });
  if (!STATES.includes(state)) throw new HttpError(400, "state must be an Indian state or union territory");
  return {
    language: requireLanguage(body.language),
    state,
    age: requireNumber(body.age, { min: 14, max: 100, field: "age" }),
    monthlyIncome: requireNumber(body.monthlyIncome, { min: 0, max: 10_000_000, field: "monthlyIncome" }),
    workType: pickOne(body.workType, WORK_TYPES, "other"),
  };
}

/**
 * Join model text to our own records by id.
 * Only the named `fields` come from the model, so it cannot change ids, names, or links.
 * Records the model did not explain, and ids it invented, are dropped.
 */
export function mergeById(records, explained, fields) {
  const byId = new Map(explained.map((item) => [item.id, item]));
  return records
    .filter((record) => byId.has(record.id))
    .map((record) => {
      const item = byId.get(record.id);
      const text = Object.fromEntries(fields.filter((field) => field in item).map((field) => [field, item[field]]));
      return { ...record, ...text };
    });
}

export async function run(ai, profile) {
  const schemes = filterSchemes(profile);
  const laws = lawsFor(profile.state);
  const facts = {
    worker: { state: profile.state, age: profile.age, monthlyIncomeRupees: profile.monthlyIncome, workType: profile.workType },
    schemes: schemes.map(({ id, name, benefit, documents }) => ({ id, name, benefit, documents })),
    laws: laws.map(({ id, name, summary }) => ({ id, name, summary })),
  };
  const answer = await ai.generateJson({
    system: systemPrompt(ROLE, profile.language),
    parts: [{ text: JSON.stringify(facts) }],
    schema: SCHEMA,
    maxOutputTokens: 4096,
  });

  return {
    intro: answer.intro,
    schemes: mergeById(schemes, answer.schemes, ["whyItFits", "benefit", "steps", "documents"]).map(({ rules, ...scheme }) => scheme),
    laws: mergeById(laws, answer.laws, ["explain"]).map(({ states, ...law }) => law),
  };
}

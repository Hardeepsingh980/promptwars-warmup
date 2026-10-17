import { config, IMAGE_TYPES } from "../config.js";
import { HttpError } from "../errors.js";
import { COMPLAINT_TARGETS, ESCALATION_LADDER } from "../data/schemes.js";
import { systemPrompt } from "../prompts.js";
import { requireLanguage, requireText, requireMedia } from "../validate.js";

const ROLE = `
The worker has a problem with a platform, an employer, or an official. Help them complain.
Write a formal, polite, firm complaint letter in English: a subject line and a body of 120 to 220 words.
In the body, state the facts, the date if known, what the worker wants, and a deadline of 7 days to reply.
Use placeholders in square brackets for facts you do not know, for example [Your name], [Your partner ID], [Date].
Do not invent facts. If a photo is attached, use only what it shows.
"summary" explains the letter to the worker in 2 or 3 short sentences, in the worker's language.
"evidence" lists 2 to 4 things the worker must keep or attach, in the worker's language.
"sendTo" is who should get this letter first.`;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    subject: { type: "STRING" },
    body: { type: "STRING" },
    summary: { type: "ARRAY", items: { type: "STRING" } },
    evidence: { type: "ARRAY", items: { type: "STRING" } },
    sendTo: { type: "STRING", enum: Object.keys(COMPLAINT_TARGETS) },
  },
  required: ["subject", "body", "summary", "evidence", "sendTo"],
};

export function parseInput(body) {
  const language = requireLanguage(body.language);
  const problem = requireText(body.problem, { max: config.maxTextChars, optional: true, field: "problem" });
  const image = requireMedia(body.image, { allowed: IMAGE_TYPES, maxBytes: config.maxMediaBytes, field: "image" });
  if (!problem && !image) throw new HttpError(400, "Tell us the problem, or add a photo of it");
  return {
    language,
    problem,
    image,
    platform: requireText(body.platform, { max: 60, optional: true, field: "platform" }),
    city: requireText(body.city, { max: 60, optional: true, field: "city" }),
  };
}

export async function run(ai, { language, problem, image, platform, city }) {
  const details = [
    problem && `Problem: ${problem}`,
    platform && `Platform or employer: ${platform}`,
    city && `City: ${city}`,
  ].filter(Boolean).join("\n");
  const parts = image ? [image] : [];
  parts.push({ text: details || "Read the photo and write the complaint." });

  const answer = await ai.generateJson({ system: systemPrompt(ROLE, language), parts, schema: SCHEMA, maxOutputTokens: 2048 });
  return {
    ...answer,
    sendTo: { key: answer.sendTo, label: COMPLAINT_TARGETS[answer.sendTo] ?? COMPLAINT_TARGETS.platform_support },
    escalation: ESCALATION_LADDER,
  };
}

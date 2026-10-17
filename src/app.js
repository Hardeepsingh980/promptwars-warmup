import express from "express";
import { fileURLToPath } from "node:url";
import { config, LANGUAGES, WORK_TYPES } from "./config.js";
import { HttpError } from "./errors.js";
import { createRateLimiter } from "./rateLimit.js";
import { STATES } from "./data/states.js";
import { HELPLINES } from "./data/schemes.js";
import * as understand from "./features/understand.js";
import * as fairpay from "./features/fairpay.js";
import * as schemes from "./features/schemes.js";
import * as complaint from "./features/complaint.js";
import * as speak from "./features/speak.js";
import * as translate from "./features/translate.js";
import { createCopilotRouter } from "./copilot/routes.js";
import { createCopilotStore } from "./copilot/store.js";

const PUBLIC_DIR = fileURLToPath(new URL("../public", import.meta.url));
const SHARED_DIR = fileURLToPath(new URL("../shared", import.meta.url));

const SECURITY_HEADERS = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "media-src 'self' blob: data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "),
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(self), microphone=(self), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};

/** Wrap a feature module ({ parseInput, run }) as an Express handler. */
function featureRoute(feature, ai) {
  return async (request, response) => {
    const input = feature.parseInput(request.body ?? {});
    response.json(await feature.run(ai, input));
  };
}

/**
 * Build the Express app. `ai` is the model client, injected so tests can use a fake.
 * It must have generateJson() and generateSpeech().
 */
export function createApp({ ai, rateLimit = config.rateLimit, copilotStore = createCopilotStore(), copilotToolKey = config.copilotToolKey } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use((request, response, next) => {
    response.set(SECURITY_HEADERS);
    next();
  });
  // Static files revalidate with ETags, so a new deploy reaches the browser at once.
  app.use(express.static(PUBLIC_DIR, { index: "index.html" }));
  // Pure modules that both the server and the browser use.
  app.use("/shared", express.static(SHARED_DIR));

  app.get("/healthz", (request, response) => response.json({ ok: true }));

  const api = express.Router();
  api.use(createRateLimiter(rateLimit).middleware);
  api.use(express.json({ limit: config.jsonBodyLimit }));

  api.get("/meta", (request, response) => {
    response.set("Cache-Control", "public, max-age=3600");
    response.json({ languages: LANGUAGES, states: STATES, workTypes: WORK_TYPES, helplines: HELPLINES });
  });
  api.get("/strings", async (request, response) => {
    const result = await translate.run(ai, translate.parseInput(request.query));
    response.set("Cache-Control", "public, max-age=3600");
    response.json(result);
  });
  api.post("/understand", featureRoute(understand, ai));
  api.post("/fairpay", featureRoute(fairpay, ai));
  api.post("/schemes", featureRoute(schemes, ai));
  api.post("/complaint", featureRoute(complaint, ai));
  api.post("/speak", featureRoute(speak, ai));
  api.use("/copilot", createCopilotRouter({ ai, store: copilotStore, toolKey: copilotToolKey }));
  api.use((request, response) => response.status(404).json({ error: "Not found" }));

  app.use("/api", api);

  // Express calls this for thrown errors, rejected promises, and bad JSON bodies.
  app.use((error, request, response, next) => {
    if (response.headersSent) return next(error);
    if (error instanceof HttpError) return response.status(error.status).json({ error: error.message });
    if (error.type === "entity.too.large") return response.status(413).json({ error: "The file is too large" });
    if (error.type === "entity.parse.failed") return response.status(400).json({ error: "The request body is not valid JSON" });
    console.error(error);
    response.status(500).json({ error: "Something went wrong. Please try again." });
  });

  return app;
}

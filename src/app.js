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
import { createEarningsRouter, createEarningsService } from "./features/earnings.js";
import { createAuthRouter, requireUser, sessionMiddleware } from "./auth/routes.js";
import { createUserService } from "./auth/users.js";
import { createCopilotRouter } from "./copilot/routes.js";
import { createCopilotStore } from "./copilot/store.js";
import { createWhatsAppClient } from "./whatsapp/client.js";
import { createWhatsAppRouter } from "./whatsapp/routes.js";

const PUBLIC_DIR = fileURLToPath(new URL("../public", import.meta.url));
const SHARED_DIR = fileURLToPath(new URL("../shared", import.meta.url));

function securityHeaders(request, response, next) {
  const host = request.get("host") ?? "";
  response.set({
    "Content-Security-Policy": [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' https://fonts.googleapis.com",
      "font-src https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "media-src 'self' blob: data:",
      `connect-src 'self' wss://${host} ws://${host}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(self), microphone=(self), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin",
  });
  next();
}

/** Wrap a feature module ({ parseInput, run }) as an Express handler. */
function featureRoute(feature, ai) {
  return async (request, response) => {
    const input = feature.parseInput(request.body ?? {});
    response.json(await feature.run(ai, input));
  };
}

/**
 * Build the Express app and the services the live voice bridge shares with it.
 * `ai` is the model client and `db` the document store, both injected so tests can use fakes.
 */
export function createApp({ ai, db, rateLimit = config.rateLimit, secrets = config, whatsappClient } = {}) {
  const users = createUserService(db);
  const copilot = createCopilotStore(db);
  const earnings = createEarningsService(db);
  const whatsapp = secrets.whatsapp ?? config.whatsapp;
  const client = whatsappClient ?? createWhatsAppClient({ apiKey: whatsapp.apiKey, baseUrl: whatsapp.baseUrl });

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(securityHeaders);
  app.use(express.static(PUBLIC_DIR, { index: "index.html" }));
  app.use("/shared", express.static(SHARED_DIR));
  app.get("/health", (request, response) => response.json({ ok: true }));

  const api = express.Router();
  api.use(createRateLimiter(rateLimit).middleware);
  api.use(express.json({ limit: config.jsonBodyLimit }));
  api.use(sessionMiddleware({ users, secret: secrets.sessionSecret }));

  api.get("/meta", (request, response) => {
    response.set("Cache-Control", "public, max-age=3600");
    response.json({ languages: LANGUAGES, states: STATES, workTypes: WORK_TYPES, helplines: HELPLINES, phoneLine: config.phoneLine, whatsappNumber: config.whatsapp.number });
  });
  api.get("/strings", async (request, response) => {
    const result = await translate.run(ai, translate.parseInput(request.query));
    response.set("Cache-Control", "public, max-age=3600");
    response.json(result);
  });
  api.use("/auth", createAuthRouter({ users, secret: secrets.sessionSecret }));
  api.use("/copilot", createCopilotRouter({ ai, users, copilot, earnings, toolKey: secrets.copilotToolKey, webhookToken: secrets.copilotWebhookToken }));
  api.use("/whatsapp", createWhatsAppRouter({ deps: { ai, users, copilot, earnings, client }, token: whatsapp.webhookToken }));

  api.use(requireUser);
  api.use("/earnings", createEarningsRouter(earnings));
  api.post("/understand", featureRoute(understand, ai));
  api.post("/fairpay", featureRoute(fairpay, ai));
  api.post("/schemes", featureRoute(schemes, ai));
  api.post("/complaint", featureRoute(complaint, ai));
  api.post("/speak", featureRoute(speak, ai));
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

  return { app, services: { users, copilot, earnings, config: { ...config, ...secrets } } };
}

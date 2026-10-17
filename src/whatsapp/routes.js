import express from "express";
import { tokenMatches } from "../copilot/routes.js";
import { describeKeys } from "../copilot/payload.js";
import { extractMessages } from "./payload.js";
import { handleIncoming } from "./agent.js";
import { track } from "../inflight.js";

const MAX_SEEN = 2000;

/**
 * The WhatsApp webhook. The provider cannot set headers, so a secret token travels in the URL.
 * The route answers at once and handles messages in the background, because providers
 * retry slow webhooks and would deliver the same message twice.
 */
export function createWhatsAppRouter({ deps, token, log = console.log }) {
  const router = express.Router();
  const seen = new Set();

  const authorized = (request) => tokenMatches(request.params.token ?? request.query.token, token);

  // Some providers verify a webhook with a GET and expect the challenge echoed back.
  router.get(["/webhook/:token", "/webhook"], (request, response) => {
    if (!authorized(request)) return response.status(404).json({ error: "Not found" });
    const challenge = request.query["hub.challenge"] ?? request.query.challenge;
    if (challenge) return response.type("text/plain").send(String(challenge));
    response.json({ ok: true });
  });

  router.post(["/webhook/:token", "/webhook"], express.urlencoded({ extended: true, limit: "2mb" }), (request, response) => {
    if (!authorized(request)) return response.status(404).json({ error: "Not found" });
    const payload = request.body ?? {};
    const messages = extractMessages(payload);
    log(`whatsapp webhook: ${messages.length} message(s); fields: ${describeKeys(payload, "", 0, 6).slice(0, 900)}`);
    for (const message of messages) {
      const { from, text, caption, ...rest } = message;
      log(`whatsapp message from ...${from.slice(-4)}: ${JSON.stringify({ ...rest, text: text ? `${text.length} chars` : "", caption: caption ? `${caption.length} chars` : "" })}`);
    }
    response.json({ ok: true, received: messages.length });

    for (const message of messages) {
      if (seen.has(message.id)) continue;
      seen.add(message.id);
      if (seen.size > MAX_SEEN) seen.delete(seen.values().next().value);
      track(() => handleIncoming(message, { ...deps, log }), (error) => log(`whatsapp handler crashed: ${error.message}`));
    }
  });

  return router;
}

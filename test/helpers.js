import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";

export const SECRETS = { sessionSecret: "test-session-secret", copilotToolKey: "test-tool-key", copilotWebhookToken: "test-webhook-token" };

/** A fake model client. Set `reply` per test. `calls` records every request. */
export function createFakeAi() {
  return {
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
}

/** Start the app on a free port with an in-memory db. Returns helpers for HTTP calls. */
export async function startTestServer({ rateLimit = { windowMs: 60_000, max: 10_000 } } = {}) {
  const ai = createFakeAi();
  const db = await openDb(null);
  const { app, services } = createApp({ ai, db, rateLimit, secrets: SECRETS });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  /** A client that keeps its own session cookie, like a browser. */
  function client() {
    let cookie = "";
    const call = async (path, { method = "GET", body, headers = {} } = {}) => {
      const response = await fetch(baseUrl + path, {
        method,
        headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";")[0];
      return response;
    };
    const json = async (path, options) => {
      const response = await call(path, options);
      return { status: response.status, body: await response.json().catch(() => ({})) };
    };
    return { call, json, signup: (user) => json("/api/auth/signup", { method: "POST", body: user }) };
  }

  return { ai, db, services, baseUrl, client, close: () => server.close() };
}

/** Calls to the Haqdar server. Every call throws an Error with a readable message on failure. */

const TIMEOUT_MS = 60_000;

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(path, { ...options, signal: controller.signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

const post = (path, body) =>
  request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const api = {
  meta: () => request("/api/meta"),
  // The version in the URL makes the browser drop cached text when the strings change.
  strings: (language, version) => request(`/api/strings?language=${encodeURIComponent(language)}&v=${version}`),
  understand: (body) => post("/api/understand", body),
  fairPay: (body) => post("/api/fairpay", body),
  schemes: (body) => post("/api/schemes", body),
  complaint: (body) => post("/api/complaint", body),
  speak: (body) => post("/api/speak", body),
  copilot: {
    get: () => request("/api/copilot/rider", { cache: "no-store" }),
    update: (changes) =>
      request("/api/copilot/rider", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) }),
    heard: (ids) => post("/api/copilot/messages/heard", { ids }),
    ask: (body) => post("/api/copilot/ask", body),
  },
};

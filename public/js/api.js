/** Calls to the Haqdar server. Every call throws an Error with a readable message on failure. */

const TIMEOUT_MS = 60_000;

/** Thrown when the server answers 401. The router sends the user to the login screen. */
export class AuthError extends Error {}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(path, { credentials: "same-origin", ...options, signal: controller.signal });
    const body = await response.json().catch(() => ({}));
    if (response.status === 401 && !path.startsWith("/api/auth/")) throw new AuthError(body.error || "Please log in");
    if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

const json = (method) => (path, body) =>
  request(path, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const post = json("POST");
const put = json("PUT");

export const api = {
  meta: () => request("/api/meta"),
  // The version in the URL makes the browser drop cached text when the strings change.
  strings: (language, version) => request(`/api/strings?language=${encodeURIComponent(language)}&v=${version}`),
  auth: {
    me: () => request("/api/auth/me", { cache: "no-store" }),
    signup: (body) => post("/api/auth/signup", body),
    login: (body) => post("/api/auth/login", body),
    logout: () => post("/api/auth/logout"),
    profile: (changes) => put("/api/auth/profile", changes),
  },
  understand: (body) => post("/api/understand", body),
  fairPay: (body) => post("/api/fairpay", body),
  schemes: (body) => post("/api/schemes", body),
  complaint: (body) => post("/api/complaint", body),
  speak: (body) => post("/api/speak", body),
  earnings: {
    list: () => request("/api/earnings", { cache: "no-store" }),
    add: (entry) => post("/api/earnings", entry),
    remove: (id) => request(`/api/earnings/${encodeURIComponent(id)}`, { method: "DELETE" }),
  },
  copilot: {
    get: () => request("/api/copilot/rider", { cache: "no-store" }),
    update: (changes) => put("/api/copilot/rider", changes),
    heard: (ids) => post("/api/copilot/messages/heard", { ids }),
    ask: (body) => post("/api/copilot/ask", body),
    sampleCall: () => post("/api/copilot/sample-call"),
  },
};

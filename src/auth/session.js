import { createHmac, timingSafeEqual } from "node:crypto";

export const COOKIE_NAME = "haqdar_session";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const sign = (payload, secret) => createHmac("sha256", secret).update(payload).digest("base64url");

/** Make a signed session token for a user. The token carries the user id and an expiry. */
export function createToken(userId, secret, now = Date.now()) {
  const payload = `${userId}.${now + MAX_AGE_SECONDS * 1000}`;
  return `${payload}.${sign(payload, secret)}`;
}

/** Return the user id from a valid token, or null. */
export function readToken(token, secret, now = Date.now()) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expires, signature] = parts;
  const expected = sign(`${userId}.${expires}`, secret);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  if (Number(expires) < now) return null;
  return userId;
}

/** Parse the Cookie header into an object. */
export function parseCookies(header = "") {
  return Object.fromEntries(
    header.split(";").map((part) => part.trim().split("=")).filter(([name, value]) => name && value !== undefined)
      .map(([name, ...value]) => [name, decodeURIComponent(value.join("="))]),
  );
}

/** Build the Set-Cookie value for a session. `secure` adds the Secure flag for HTTPS. */
export function sessionCookie(token, { secure }) {
  const flags = [`${COOKIE_NAME}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${token ? MAX_AGE_SECONDS : 0}`];
  if (secure) flags.push("Secure");
  return flags.join("; ");
}

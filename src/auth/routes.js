import express from "express";
import { HttpError } from "../errors.js";
import { COOKIE_NAME, createToken, parseCookies, readToken, sessionCookie } from "./session.js";
import { publicUser } from "./users.js";

/** Express middleware: load the signed-in user from the session cookie onto request.user. */
export function sessionMiddleware({ users, secret }) {
  return (request, response, next) => {
    const token = parseCookies(request.get("cookie"))[COOKIE_NAME];
    const userId = readToken(token, secret);
    request.user = userId ? users.get(userId) : null;
    next();
  };
}

/** Express middleware: reject requests that have no signed-in user. */
export function requireUser(request, response, next) {
  if (!request.user) return response.status(401).json({ error: "Please log in" });
  next();
}

export function createAuthRouter({ users, secret }) {
  const router = express.Router();
  const setSession = (request, response, user) => {
    const secure = request.secure || request.get("x-forwarded-proto") === "https";
    response.set("Set-Cookie", sessionCookie(user ? createToken(user.id, secret) : "", { secure }));
  };

  router.post("/signup", async (request, response) => {
    const user = await users.signup(request.body ?? {});
    setSession(request, response, user);
    response.status(201).json({ user: publicUser(user) });
  });

  router.post("/login", async (request, response) => {
    const user = await users.login(request.body ?? {});
    setSession(request, response, user);
    response.json({ user: publicUser(user) });
  });

  router.post("/logout", (request, response) => {
    setSession(request, response, null);
    response.json({ ok: true });
  });

  router.get("/me", (request, response) => {
    response.set("Cache-Control", "no-store");
    response.json({ user: request.user ? publicUser(request.user) : null });
  });

  router.put("/profile", requireUser, (request, response) => {
    if (typeof request.body !== "object" || request.body === null) throw new HttpError(400, "Send a JSON object");
    response.json({ user: publicUser(users.updateProfile(request.user.id, request.body)) });
  });

  return router;
}

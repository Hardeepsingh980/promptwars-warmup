import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createToken, readToken, parseCookies } from "../src/auth/session.js";
import { hashPassword, verifyPassword } from "../src/auth/password.js";
import { normalizePhone } from "../src/auth/users.js";
import { openDb } from "../src/db.js";
import { startTestServer } from "./helpers.js";

let server;
before(async () => { server = await startTestServer(); });
after(() => server.close());

test("passwords hash with a salt and verify in constant time", async () => {
  const stored = await hashPassword("saathi123");
  assert.notEqual(stored, await hashPassword("saathi123"), "a new salt each time");
  assert.equal(await verifyPassword("saathi123", stored), true);
  assert.equal(await verifyPassword("wrong", stored), false);
  assert.equal(await verifyPassword("x", "garbage"), false);
});

test("session tokens round-trip, expire, and reject tampering", () => {
  const token = createToken("user-1", "secret", 1000);
  assert.equal(readToken(token, "secret", 2000), "user-1");
  assert.equal(readToken(token, "other-secret", 2000), null);
  assert.equal(readToken(token.replace("user-1", "user-2"), "secret", 2000), null);
  assert.equal(readToken(token, "secret", 1000 + 31 * 24 * 3600 * 1000), null, "expired");
  assert.deepEqual(parseCookies("a=1; haqdar_session=x.y.z"), { a: "1", haqdar_session: "x.y.z" });
});

test("normalizePhone accepts Indian numbers in common forms", () => {
  assert.equal(normalizePhone("98765 43210"), "919876543210");
  assert.equal(normalizePhone("+91 9876543210"), "919876543210");
  assert.throws(() => normalizePhone("12345"));
});

test("the json db stores, finds, updates, and persists documents", async () => {
  const db = await openDb(null);
  db.put("users", "a", { name: "A" });
  db.put("users", "b", { name: "B" });
  assert.deepEqual(db.get("users", "a"), { id: "a", name: "A" });
  assert.equal(db.find("users", (user) => user.name === "B").length, 1);
  db.update("users", "a", { name: "A2" });
  assert.equal(db.get("users", "a").name, "A2");
  db.remove("users", "b");
  assert.equal(db.list("users").length, 1);
  assert.equal(db.get("users", "zzz"), null);
});

test("the json db keeps a secondary index for per-user lookups", async () => {
  const db = await openDb(null);
  db.put("earnings", "e1", { userId: "u1", net: 1 });
  db.put("earnings", "e2", { userId: "u2", net: 2 });
  db.put("earnings", "e3", { userId: "u1", net: 3 });
  assert.deepEqual(db.where("earnings", "userId", "u1").map((doc) => doc.id).sort(), ["e1", "e3"]);
  db.update("earnings", "e3", { userId: "u2" });
  assert.deepEqual(db.where("earnings", "userId", "u1").map((doc) => doc.id), ["e1"]);
  db.remove("earnings", "e1");
  assert.deepEqual(db.where("earnings", "userId", "u1"), []);
  assert.equal(db.where("earnings", "userId", "nobody").length, 0);
  assert.throws(() => db.where("earnings", "net", 2), /not an indexed field/);
});

test("signup sets a session cookie and /me returns the user without the hash", async () => {
  const c = server.client();
  const { status, body } = await c.signup({ name: "Fatima", phone: "9876500001", password: "secret1", language: "te" });
  assert.equal(status, 201);
  assert.equal(body.user.name, "Fatima");
  assert.equal(body.user.passwordHash, undefined);
  const me = await c.json("/api/auth/me");
  assert.equal(me.body.user.phone, "919876500001");
  assert.equal(me.body.user.setupDone, false);
});

test("signup rejects a short password and a repeated number", async () => {
  const c = server.client();
  assert.equal((await c.signup({ name: "X", phone: "9876500002", password: "123" })).status, 400);
  assert.equal((await c.signup({ name: "X", phone: "9876500002", password: "123456" })).status, 201);
  assert.equal((await server.client().signup({ name: "Y", phone: "9876500002", password: "123456" })).status, 409);
});

test("login works with the right password only, and logout clears the session", async () => {
  await server.client().signup({ name: "Sunil", phone: "9876500003", password: "mypass1" });
  const c = server.client();
  assert.equal((await c.json("/api/auth/login", { method: "POST", body: { phone: "9876500003", password: "nope" } })).status, 401);
  assert.equal((await c.json("/api/auth/login", { method: "POST", body: { phone: "9876500003", password: "mypass1" } })).status, 200);
  assert.equal((await c.json("/api/auth/me")).body.user.name, "Sunil");
  await c.json("/api/auth/logout", { method: "POST" });
  assert.equal((await c.json("/api/auth/me")).body.user, null);
});

test("profile setup saves state and work type and validates them", async () => {
  const c = server.client();
  await c.signup({ name: "Ravi", phone: "9876500004", password: "ravi1234" });
  const ok = await c.json("/api/auth/profile", { method: "PUT", body: { state: "Karnataka", workType: "delivery", platform: "Swiggy", setupDone: true } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.state, "Karnataka");
  assert.equal(ok.body.user.setupDone, true);
  assert.equal((await c.json("/api/auth/profile", { method: "PUT", body: { state: "Narnia" } })).status, 400);
});

test("feature routes need a signed-in user", async () => {
  const anonymous = server.client();
  assert.equal((await anonymous.json("/api/understand", { method: "POST", body: { language: "hi", text: "hi" } })).status, 401);
  assert.equal((await anonymous.json("/api/earnings")).status, 401);
});

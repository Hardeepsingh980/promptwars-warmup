import { randomUUID } from "node:crypto";
import { LANGUAGES, WORK_TYPES } from "../config.js";
import { HttpError } from "../errors.js";
import { STATES } from "../data/states.js";
import { requireText } from "../validate.js";
import { hashPassword, verifyPassword } from "./password.js";

const USERS = "users";
const MIN_PASSWORD = 6;

/** Turn an Indian phone number into digits with the 91 country code. */
export function normalizePhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  throw new HttpError(400, "Enter a 10-digit Indian mobile number");
}

/** The fields that are safe to send to the browser. */
export function publicUser(user) {
  const { passwordHash, ...safe } = user;
  return safe;
}

export function createUserService(db) {
  const byPhone = (phone) => db.find(USERS, (user) => user.phone === phone)[0] ?? null;

  return {
    get: (id) => db.get(USERS, id),
    byPhone,

    async signup({ name, phone, password, language }) {
      const cleanName = requireText(name, { max: 40, field: "name" });
      const cleanPhone = normalizePhone(phone);
      if (typeof password !== "string" || password.length < MIN_PASSWORD) throw new HttpError(400, `Password must be at least ${MIN_PASSWORD} characters`);
      if (byPhone(cleanPhone)) throw new HttpError(409, "This number already has an account. Please log in.");
      const user = {
        name: cleanName,
        phone: cleanPhone,
        passwordHash: await hashPassword(password),
        language: language in LANGUAGES ? language : "hi",
        state: "",
        workType: "delivery",
        platform: "",
        setupDone: false,
        onboarded: false,
        createdAt: new Date().toISOString(),
      };
      return db.put(USERS, randomUUID(), user);
    },

    async login({ phone, password }) {
      const user = byPhone(normalizePhone(phone));
      const ok = user && typeof password === "string" && (await verifyPassword(password, user.passwordHash));
      if (!ok) throw new HttpError(401, "Wrong number or password");
      return user;
    },

    /** Save profile fields from the setup screen or the menu. */
    updateProfile(id, body) {
      const changes = {};
      if ("name" in body) changes.name = requireText(body.name, { max: 40, field: "name" });
      if ("language" in body) {
        if (!(body.language in LANGUAGES)) throw new HttpError(400, "Unknown language");
        changes.language = body.language;
      }
      if ("state" in body) {
        if (body.state !== "" && !STATES.includes(body.state)) throw new HttpError(400, "state must be an Indian state or union territory");
        changes.state = body.state;
      }
      if ("workType" in body) changes.workType = WORK_TYPES.includes(body.workType) ? body.workType : "other";
      if ("platform" in body) changes.platform = requireText(body.platform, { max: 40, optional: true, field: "platform" });
      if ("setupDone" in body) changes.setupDone = Boolean(body.setupDone);
      if ("onboarded" in body) changes.onboarded = Boolean(body.onboarded);
      const user = db.update(USERS, id, changes);
      if (!user) throw new HttpError(404, "User not found");
      return user;
    },

    /** Create the demo account that evaluators use, unless it exists. */
    async ensureDemoUser({ phone, password, name }) {
      const cleanPhone = normalizePhone(phone);
      if (byPhone(cleanPhone)) return;
      await this.signup({ name, phone: cleanPhone, password, language: "hi" });
    },
  };
}

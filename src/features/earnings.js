import { randomUUID } from "node:crypto";
import express from "express";
import { computePay } from "../../shared/pay.js";
import { HttpError } from "../errors.js";
import { requireNumber, requireText } from "../validate.js";

const COLLECTION = "earnings";
const MAX_ENTRIES = 366;

/** The rider's earnings log, per user. */
export function createEarningsService(db) {
  return {
    list(userId) {
      return db.where(COLLECTION, "userId", userId).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    },
    add(userId, { date, platform = "", earnings, hours, fuel = 0, other = 0 }) {
      const day = /^\d{4}-\d{2}-\d{2}$/.test(date ?? "") ? date : new Date().toISOString().slice(0, 10);
      const { net } = computePay({ earnings, hours, fuel, other });
      const entry = { userId, date: day, platform, earnings, hours, fuel, other, net, createdAt: new Date().toISOString() };
      for (const old of this.list(userId).slice(MAX_ENTRIES - 1)) db.remove(COLLECTION, old.id);
      return db.put(COLLECTION, randomUUID(), entry);
    },
    remove(userId, id) {
      const entry = db.get(COLLECTION, id);
      if (entry?.userId === userId) db.remove(COLLECTION, id);
    },
  };
}

export function createEarningsRouter(earnings) {
  const router = express.Router();

  router.get("/", (request, response) => {
    response.set("Cache-Control", "no-store");
    response.json({ entries: earnings.list(request.user.id) });
  });

  router.post("/", (request, response) => {
    const body = request.body ?? {};
    const entry = earnings.add(request.user.id, {
      date: body.date,
      platform: requireText(body.platform, { max: 40, optional: true, field: "platform" }),
      earnings: requireNumber(body.earnings, { min: 0, max: 1_000_000, field: "earnings" }),
      hours: requireNumber(body.hours, { min: 0.25, max: 24, field: "hours" }),
      fuel: requireNumber(body.fuel ?? 0, { min: 0, max: 1_000_000, field: "fuel" }),
      other: requireNumber(body.other ?? 0, { min: 0, max: 1_000_000, field: "other" }),
    });
    response.status(201).json({ entry });
  });

  router.delete("/:id", (request, response) => {
    if (typeof request.params.id !== "string") throw new HttpError(400, "id is required");
    earnings.remove(request.user.id, request.params.id);
    response.json({ ok: true });
  });

  return router;
}

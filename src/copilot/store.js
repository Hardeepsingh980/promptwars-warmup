import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

const RIDERS = "riders";
const MESSAGES = "messages";
const SETTINGS = "settings";
const LINE = "line";
const MAX_MESSAGES = 50;

const defaultRider = (userId) => ({ userId, status: "offline", order: null, updatedAt: new Date().toISOString() });

/**
 * Riding state and call messages, per user, on top of the JSON db.
 * Every change bumps a per-user version and emits an event, so the browser can be
 * pushed an update instead of polling. One phone line is shared in the demo, so
 * `lineOwner` is the user the phone agent speaks for: the last user who started riding.
 */
export function createCopilotStore(db) {
  const changes = new EventEmitter();
  changes.setMaxListeners(0);
  const versions = new Map();

  const bump = (userId) => {
    const next = (versions.get(userId) ?? 0) + 1;
    versions.set(userId, next);
    changes.emit(userId, next);
    return next;
  };

  return {
    getRider(userId) {
      return db.get(RIDERS, userId) ?? defaultRider(userId);
    },

    updateRider(userId, patch) {
      const rider = { ...this.getRider(userId), ...patch, updatedAt: new Date().toISOString() };
      if (patch.status === "riding") db.put(SETTINGS, LINE, { userId });
      const saved = db.put(RIDERS, userId, rider);
      bump(userId);
      return saved;
    },

    /** The user the phone agent currently speaks for, or null. */
    lineOwnerId: () => db.get(SETTINGS, LINE)?.userId ?? null,

    addMessage(userId, message) {
      const saved = { userId, receivedAt: new Date().toISOString(), heard: false, ...message };
      const existing = this.listMessages(userId);
      for (const old of existing.slice(MAX_MESSAGES - 1)) db.remove(MESSAGES, old.id);
      const result = db.put(MESSAGES, randomUUID(), saved);
      bump(userId);
      return result;
    },

    /** Newest first. The index keeps insertion order, so a reverse is enough. */
    listMessages(userId) {
      return db.where(MESSAGES, "userId", userId).reverse();
    },

    unheardMessages(userId) {
      return this.listMessages(userId).filter((message) => !message.heard);
    },

    removeMessage(userId, id) {
      const message = db.get(MESSAGES, id);
      if (message?.userId !== userId) return;
      db.remove(MESSAGES, id);
      bump(userId);
    },

    markHeard(userId, ids) {
      const wanted = new Set(ids);
      let changed = false;
      for (const message of this.listMessages(userId)) {
        if (wanted.has(message.id) && !message.heard) {
          db.update(MESSAGES, message.id, { heard: true });
          changed = true;
        }
      }
      if (changed) bump(userId);
    },

    /** A number that grows with every change for this user. Cheap to compare. */
    version: (userId) => versions.get(userId) ?? 0,

    /** Call `listener(version)` after each change for this user. Returns an unsubscribe function. */
    subscribe(userId, listener) {
      changes.on(userId, listener);
      return () => changes.off(userId, listener);
    },
  };
}

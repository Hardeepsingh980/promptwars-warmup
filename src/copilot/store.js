import { randomUUID } from "node:crypto";

const RIDERS = "riders";
const MESSAGES = "messages";
const SETTINGS = "settings";
const LINE = "line";
const MAX_MESSAGES = 50;

const defaultRider = (userId) => ({ userId, status: "offline", order: null, updatedAt: new Date().toISOString() });

/**
 * Riding state and call messages, per user, on top of the JSON db.
 * One phone line is shared in the demo, so `lineOwner` is the user the phone agent speaks for:
 * the last user who started riding.
 */
export function createCopilotStore(db) {
  return {
    getRider(userId) {
      return db.get(RIDERS, userId) ?? defaultRider(userId);
    },

    updateRider(userId, changes) {
      const rider = { ...this.getRider(userId), ...changes, updatedAt: new Date().toISOString() };
      if (changes.status === "riding") db.put(SETTINGS, LINE, { userId });
      return db.put(RIDERS, userId, rider);
    },

    /** The user the phone agent currently speaks for, or null. */
    lineOwnerId: () => db.get(SETTINGS, LINE)?.userId ?? null,

    addMessage(userId, message) {
      const saved = { userId, receivedAt: new Date().toISOString(), heard: false, ...message };
      const id = randomUUID();
      const stale = this.listMessages(userId).slice(MAX_MESSAGES - 1);
      for (const old of stale) db.remove(MESSAGES, old.id);
      return db.put(MESSAGES, id, saved);
    },

    /** Newest first. */
    listMessages(userId) {
      return db.find(MESSAGES, (message) => message.userId === userId)
        .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
    },

    unheardMessages: function (userId) {
      return this.listMessages(userId).filter((message) => !message.heard);
    },

    removeMessage(userId, id) {
      const message = db.get(MESSAGES, id);
      if (message?.userId === userId) db.remove(MESSAGES, id);
    },

    markHeard(userId, ids) {
      const wanted = new Set(ids);
      for (const message of this.listMessages(userId)) {
        if (wanted.has(message.id) && !message.heard) db.update(MESSAGES, message.id, { heard: true });
      }
    },
  };
}

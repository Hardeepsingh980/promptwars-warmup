import { randomUUID } from "node:crypto";

const MAX_MESSAGES = 50;

/**
 * In-memory state for one rider: profile, riding status, current order, and call messages.
 * One instance serves the demo. Swap for Firestore to support many riders.
 */
export function createCopilotStore() {
  let rider = {
    riderName: "Ravi",
    status: "riding",
    language: "hi",
    order: null,
    updatedAt: new Date().toISOString(),
  };
  let messages = [];
  let version = 0;

  const touch = () => { version += 1; };

  return {
    getRider: () => ({ ...rider }),

    updateRider(changes) {
      rider = { ...rider, ...changes, updatedAt: new Date().toISOString() };
      touch();
      return { ...rider };
    },

    addMessage(message) {
      const saved = { id: randomUUID(), receivedAt: new Date().toISOString(), heard: false, ...message };
      messages = [saved, ...messages].slice(0, MAX_MESSAGES);
      touch();
      return saved;
    },

    listMessages: () => messages.map((message) => ({ ...message })),

    markHeard(ids) {
      const wanted = new Set(ids);
      messages = messages.map((message) => (wanted.has(message.id) ? { ...message, heard: true } : message));
      touch();
    },

    version: () => version,
  };
}

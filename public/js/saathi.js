/**
 * One Saathi for the whole app: the character, and at most one live voice session.
 * Screens mount the character into their own stage and subscribe to captions and tool events.
 */
import { createAvatar } from "./avatar.js";
import { startLiveSession } from "./live.js";

let avatar = null;
let stage = null;
let session = null;
let connecting = false;
const listeners = new Set();

const emit = (event) => { for (const listener of listeners) listener(event); };

/** Put the character in `container`. Moving it ends any live session. */
export function mount(container) {
  if (stage === container) return avatar;
  stop();
  avatar?.destroy();
  stage = container;
  avatar = createAvatar(container);
  return avatar;
}

/** Subscribe to { type: "caption" | "tool" | "state" | "end" | "error" | "mic" }. Returns an unsubscribe function. */
export function listen(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const isLive = () => Boolean(session?.isOpen());
export const isConnecting = () => connecting;

export async function start({ intro = false } = {}) {
  if (!avatar || connecting) return;
  stop();
  connecting = true;
  avatar.setState("thinking");
  emit({ type: "state", state: "connecting" });
  try {
    session = await startLiveSession({
      avatar,
      intro,
      handlers: {
        onReady: () => { connecting = false; emit({ type: "state", state: "live" }); },
        onMicError: () => emit({ type: "mic" }),
        onCaption: (caption) => emit({ type: "caption", ...caption }),
        onTool: (tool) => emit({ type: "tool", ...tool }),
        onTurnComplete: () => emit({ type: "turn" }),
        onError: (message) => emit({ type: "error", message }),
        onEnd: (reason) => { connecting = false; session = null; avatar.rest(); emit({ type: "end", reason }); },
      },
    });
  } catch (error) {
    connecting = false;
    avatar.rest();
    emit({ type: "error", message: error.message });
  }
}

export function stop() {
  session?.stop();
  session = null;
  connecting = false;
  avatar?.rest();
}

export function sendText(text) {
  session?.sendText(text);
}

export function setResting(state) {
  avatar?.setResting(state);
}

export function setState(state) {
  avatar?.setState(state);
}

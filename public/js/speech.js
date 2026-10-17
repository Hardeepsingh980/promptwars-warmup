/**
 * "Read aloud" buttons. Speech comes from Gemini text to speech.
 * If that fails, the browser's own voice reads the text.
 */
import { api } from "./api.js";
import { h, icon } from "./dom.js";
import { t } from "./i18n.js";

let player = null;
let activeButton = null;

function setPlaying(button, playing) {
  button.setAttribute("aria-pressed", String(playing));
  button.replaceChildren(icon(playing ? "stop_circle" : "volume_up"), h("span", { text: playing ? t("stop_reading") : t("read_aloud") }));
}

function stop() {
  player?.pause();
  player = null;
  window.speechSynthesis?.cancel();
  if (activeButton) setPlaying(activeButton, false);
  activeButton = null;
}

function browserSpeak(text, language, button) {
  if (!window.speechSynthesis) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = `${language}-IN`;
  utterance.onend = () => button === activeButton && stop();
  window.speechSynthesis.speak(utterance);
}

/** Create a button that reads `getText()` aloud in `getLanguage()`. */
export function speakButton(getText, getLanguage) {
  const button = h("button", { class: "btn btn--tonal btn--sm", type: "button", "aria-pressed": "false" });
  setPlaying(button, false);

  button.addEventListener("click", async () => {
    const wasActive = activeButton === button;
    stop();
    if (wasActive) return;

    activeButton = button;
    setPlaying(button, true);
    const text = getText().slice(0, 700);
    const language = getLanguage();
    try {
      const audio = await api.speak({ text, language });
      if (activeButton !== button) return;
      player = new Audio(`data:${audio.mimeType};base64,${audio.data}`);
      player.onended = () => button === activeButton && stop();
      await player.play();
    } catch {
      if (activeButton === button) browserSpeak(text, language, button);
    }
  });
  return button;
}

/** Onboarding: meet Saathi, hear a sample call, and turn on call answering. */
import { api } from "../api.js";
import { $, h, icon, snackbar } from "../dom.js";
import { t } from "../i18n.js";
import * as saathi from "../saathi.js";
import { renderCaptions } from "./captions.js";

let app;
let unsubscribe = null;
let captions;
let known = null;
let poll = null;

export function init(context) {
  app = context;
  $("#welcome-meet").addEventListener("click", meet);
  $("#welcome-start").addEventListener("click", startRideForTest);
  $("#welcome-finish").addEventListener("click", () => finish(true));
  $("#welcome-skip").addEventListener("click", () => finish(false));
  captions = renderCaptions($("#welcome-captions"));
}

export function enter() {
  saathi.mount($("#welcome-stage"));
  saathi.setResting("happy");
  $("#welcome-step-2").hidden = true;
  $("#welcome-step-3").hidden = true;
  $("#welcome-call-done").hidden = true;
  $("#welcome-call-link").replaceChildren(icon("call"), app.meta.phoneLine);
  $("#welcome-call-link").href = `tel:${app.meta.phoneLine}`;
  known = null;
  clearInterval(poll);
  $("#welcome-forwarding").replaceChildren(forwardingCard());
  captions.clear();
  unsubscribe?.();
  unsubscribe = saathi.listen(onSaathi);
}

export function leave() {
  unsubscribe?.();
  unsubscribe = null;
  clearInterval(poll);
  saathi.stop();
}

function onSaathi(event) {
  if (event.type === "caption") captions.add(event.role, event.text);
  if (event.type === "turn") captions.endTurn();
  if (event.type === "state" && event.state === "live") {
    $("#welcome-meet").hidden = true;
    $("#welcome-step-2").hidden = false;
  }
  if (event.type === "mic") snackbar(t("mic_blocked"));
  if (event.type === "error") snackbar(event.message || t("error_generic"));
  if (event.type === "end") $("#welcome-meet").hidden = false;
}

async function meet() {
  await saathi.start({ intro: true });
}

/** Put the rider on the line, then watch for the message from their test call. */
async function startRideForTest() {
  const button = $("#welcome-start");
  button.disabled = true;
  try {
    await api.copilot.update({ status: "riding" });
    const { messages } = await api.copilot.get();
    known = new Set(messages.map((message) => message.id));
    $("#welcome-step-3").hidden = false;
    clearInterval(poll);
    poll = setInterval(checkForCall, 4000);
    if (saathi.isLive()) saathi.sendText("(I am going to call your number from my phone now, as a test. Tell me in one sentence to go ahead.)");
  } catch (error) {
    snackbar(error.message || t("error_generic"));
  } finally {
    button.disabled = false;
  }
}

async function checkForCall() {
  try {
    const { messages } = await api.copilot.get();
    const fresh = messages.filter((message) => !known.has(message.id));
    if (fresh.length === 0) return;
    clearInterval(poll);
    $("#welcome-call-done").hidden = false;
    if (saathi.isLive()) saathi.sendText("(My test call just ended. Tell me what the caller said, using get_messages.)");
  } catch {
    // Try again on the next tick.
  }
}

async function finish(completed) {
  try {
    const { user } = await api.auth.profile({ onboarded: true });
    app.setUser(user);
    if (!completed) snackbar(t("menu_intro"));
    app.navigate("home");
  } catch (error) {
    snackbar(error.message || t("error_generic"));
  }
}

export function forwardingCard() {
  const line = app.meta.phoneLine;
  return h("div", { class: "stack stack--tight" },
    h("p", { class: "card__hint", text: t("cp_setup_hint") }),
    h("div", { class: "chips", lang: "en" },
      h("a", { class: "chip", href: `tel:**61*${line}%23` }, icon("dialpad"), `**61*${line}#`),
      h("a", { class: "chip", href: `tel:**67*${line}%23` }, icon("dialpad"), `**67*${line}#`)),
    h("p", { class: "field__help", text: t("cp_setup_off") }),
    h("p", { text: t("cp_setup_test") }),
    h("a", { class: "btn btn--outlined", href: `tel:${line}` }, icon("call"), line),
  );
}

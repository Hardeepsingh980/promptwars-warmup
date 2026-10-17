/** Onboarding: meet Saathi, hear a sample call, and turn on call answering. */
import { api } from "../api.js";
import { $, h, icon, snackbar } from "../dom.js";
import { t } from "../i18n.js";
import * as saathi from "../saathi.js";
import { renderCaptions } from "./captions.js";

let app;
let unsubscribe = null;
let captions;

export function init(context) {
  app = context;
  $("#welcome-meet").addEventListener("click", meet);
  $("#welcome-sample").addEventListener("click", sampleCall);
  $("#welcome-finish").addEventListener("click", () => finish(true));
  $("#welcome-skip").addEventListener("click", () => finish(false));
  captions = renderCaptions($("#welcome-captions"));
}

export function enter() {
  saathi.mount($("#welcome-stage"));
  saathi.setResting("happy");
  $("#welcome-step-2").hidden = true;
  $("#welcome-step-3").hidden = true;
  $("#welcome-sample-done").hidden = true;
  $("#welcome-forwarding").replaceChildren(forwardingCard());
  captions.clear();
  unsubscribe?.();
  unsubscribe = saathi.listen(onSaathi);
}

export function leave() {
  unsubscribe?.();
  unsubscribe = null;
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

async function sampleCall() {
  const button = $("#welcome-sample");
  button.disabled = true;
  try {
    await api.copilot.sampleCall();
    $("#welcome-sample-done").hidden = false;
    $("#welcome-step-3").hidden = false;
    if (saathi.isLive()) saathi.sendText("(A sample call just came in while I was riding. Tell me what the caller wanted, using get_messages.)");
  } catch (error) {
    snackbar(error.message || t("error_generic"));
  } finally {
    button.disabled = false;
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

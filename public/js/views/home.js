/** Home: Saathi live, the ride switch, calls Saathi answered, and the current order. */
import { api } from "../api.js";
import { $, h, icon, snackbar } from "../dom.js";
import { t } from "../i18n.js";
import * as saathi from "../saathi.js";
import { speechUrl } from "../speech.js";
import { renderCaptions } from "./captions.js";

/** Updates arrive by server push. A slow poll is only a safety net if the stream drops. */
const FALLBACK_POLL_MS = 60_000;
const CALLER_ICONS = { customer: "person", restaurant: "restaurant", platform: "two_wheeler", family: "family_restroom", other: "call" };

let app;
let rider = null;
let messages = [];
let seenIds = null;
let unsubscribe = null;
let captions;
let orderFormFilled = false;
let pollTimer = null;
let stream = null;
let version = -1;

export function init(context) {
  app = context;
  captions = renderCaptions($("#home-captions"));
  $("#home-live").addEventListener("click", toggleLive);
  $("#home-ride").addEventListener("click", toggleRiding);
  $("#home-play").addEventListener("click", playBriefing);
  $("#home-type-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const text = $("#home-type").value.trim();
    if (!text) return;
    $("#home-type").value = "";
    captions.endTurn();
    captions.add("user", text);
    captions.endTurn();
    if (saathi.isLive()) saathi.sendText(text);
    else askByText(text);
  });
  $("#order-form").addEventListener("submit", saveOrder);
  $("#order-delivered").addEventListener("click", () => update({ order: null }).then(() => fillOrderForm(true)));
}

export function enter() {
  saathi.mount($("#home-stage"));
  unsubscribe?.();
  unsubscribe = saathi.listen(onSaathi);
  setLiveButton(saathi.isLive() ? "live" : "idle");
  refresh();
  listenForChanges();
}

/** Open the change stream. Each event names a version; a new version means one fetch. */
function listenForChanges() {
  stream?.close();
  stream = api.copilot.events();
  stream.addEventListener("version", (event) => { if (Number(event.data) !== version) refresh(); });
  stream.onerror = () => schedulePoll();
  schedulePoll();
}

function schedulePoll() {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(async () => {
    if (!document.hidden) await refresh();
    schedulePoll();
  }, FALLBACK_POLL_MS);
}

export function leave() {
  clearTimeout(pollTimer);
  stream?.close();
  stream = null;
  unsubscribe?.();
  unsubscribe = null;
}

function onSaathi(event) {
  switch (event.type) {
    case "state": setLiveButton(event.state === "live" ? "live" : "connecting"); break;
    case "caption": captions.add(event.role, event.text); break;
    case "turn": captions.endTurn(); break;
    case "tool": onTool(event); break;
    case "mic": snackbar(t("mic_blocked")); break;
    case "error": snackbar(event.message || t("error_generic")); setLiveButton("idle"); break;
    case "end": setLiveButton("idle"); if (event.reason !== "closed") snackbar(t("live_ended")); break;
    default: break;
  }
}

function onTool({ uiEvent }) {
  if (!uiEvent) return;
  if (uiEvent.type === "navigate") app.navigate(uiEvent.screen);
  else refresh(true);
}

function setLiveButton(mode) {
  const button = $("#home-live");
  const live = mode === "live";
  button.classList.toggle("btn--live", live);
  button.setAttribute("aria-pressed", String(live));
  button.disabled = mode === "connecting";
  button.replaceChildren(icon(live ? "stop_circle" : mode === "connecting" ? "progress_activity" : "mic"),
    h("span", { text: live ? t("home_end") : mode === "connecting" ? t("home_connecting") : t("home_live") }));
  $("#home-live-hint").hidden = !live;
}

async function toggleLive() {
  if (saathi.isLive()) {
    saathi.stop();
    setLiveButton("idle");
    return;
  }
  captions.clear();
  await saathi.start({ intro: false });
}

async function update(changes) {
  try {
    ({ rider } = await api.copilot.update(changes));
    render();
  } catch (error) {
    snackbar(error.message || t("error_generic"));
  }
}

async function refresh(force = false) {
  try {
    const data = await api.copilot.get();
    const changed = force || data.version !== version;
    version = data.version;
    rider = data.rider;
    messages = data.messages;
    if (changed) {
      announceNewMessages();
      render();
      fillOrderForm(false);
    }
  } catch {
    // The next poll will try again.
  }
}

/** Urgent calls are spoken at once. Others wait for the next stop, unless the rider has stopped. */
function announceNewMessages() {
  const fresh = messages.filter((message) => !message.heard && !seenIds?.has(message.id));
  const firstLoad = seenIds === null;
  seenIds = new Set(messages.map((message) => message.id));
  if (firstLoad || fresh.length === 0) return;
  const now = fresh.filter((message) => message.urgency === "urgent" || message.scamSuspected || rider.status !== "riding");
  if (now.length === 0) return;
  if (saathi.isLive()) saathi.sendText(`(New call messages arrived. Tell me about them now, using get_messages.${now.some((m) => m.urgency === "urgent") ? " One is urgent." : ""})`);
  else speakOffline(now.map((message) => message.spoken).join(" "), now.map((message) => message.id), "alert");
}

function render() {
  if (!rider) return;
  const riding = rider.status === "riding";
  saathi.setResting(riding ? "riding" : "idle");
  $("#home-status").textContent = t(`cp_state_${rider.status}`);
  const ride = $("#home-ride");
  ride.replaceChildren(icon(riding ? "pan_tool" : "two_wheeler"), h("span", { text: riding ? t("cp_stop") : t("cp_start") }));
  ride.setAttribute("aria-pressed", String(riding));
  ride.classList.toggle("btn--filled", !riding);
  ride.classList.toggle("btn--tonal", riding);

  const unheard = messages.filter((message) => !message.heard).length;
  const badge = $("#home-new");
  badge.hidden = unheard === 0;
  badge.textContent = t("cp_new", { n: unheard });
  $("#home-list").replaceChildren(...(messages.length
    ? messages.slice(0, 20).map(renderMessage)
    : [h("p", { class: "card__hint", text: t("cp_calls_empty") })]));
}

function renderMessage(message) {
  const time = new Date(message.receivedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const who = [t(`caller_${message.callerType}`), message.callerName, message.callerNumber]
    .filter((part, index, parts) => part && parts.indexOf(part) === index).join(" · ");
  return h("li", { class: `call-item${message.heard ? "" : " call-item--new"}` },
    h("span", { class: "call-item__icon" }, icon(CALLER_ICONS[message.callerType] ?? "call")),
    h("div", { class: "call-item__main" },
      h("p", { class: "call-item__who", text: who }),
      h("p", { text: message.purpose }),
      message.details && h("p", { class: "call-item__details", text: message.details }),
      message.hasRecording && h("audio", { class: "call-item__audio", controls: true, preload: "none", src: api.copilot.recordingUrl(message.id), "aria-label": t("recording") }),
      h("div", { class: "chips" },
        h("span", { class: "chip chip--static", text: time }),
        message.urgency === "urgent" && h("span", { class: "verdict verdict--very_low" }, icon("priority_high"), t("cp_urgent")),
        message.scamSuspected && h("span", { class: "verdict verdict--very_low" }, icon("gpp_maybe"), t("cp_scam")),
        message.callBack && h("span", { class: "verdict verdict--low" }, icon("phone_callback"), t("cp_call_back")))),
    h("button", { class: "btn btn--text btn--icon", type: "button", "aria-label": `${t("delete_message")} ${who}`,
      onclick: async () => { await api.copilot.remove(message.id).catch(() => {}); refresh(true); } }, icon("delete")));
}

async function toggleRiding() {
  const nextStatus = rider?.status === "riding" ? "stopped" : "riding";
  await update({ status: nextStatus });
  if (nextStatus === "stopped") playBriefing();
  else if (saathi.isLive()) saathi.sendText("(I started riding. Say one short sentence to wish me a safe ride.)");
}

/** Read every new message aloud: through the live session if it is on, else with text to speech. */
async function playBriefing() {
  const unheard = messages.filter((message) => !message.heard).reverse();
  if (saathi.isLive()) {
    saathi.sendText(unheard.length ? "(I stopped. Read me my new call messages with get_messages.)" : "(I stopped. I have no new messages. Say so in one sentence.)");
    return;
  }
  if (unheard.length === 0) return speakOffline(t("cp_no_new"), []);
  await speakOffline([t("cp_briefing", { n: unheard.length }), ...unheard.map((message) => message.spoken)].join(" "), unheard.map((message) => message.id));
}

/** Without a live session, speak with Gemini text to speech and mark the messages heard. */
async function speakOffline(text, heardIds, mood = "speaking") {
  captions.endTurn();
  captions.add("saathi", text);
  captions.endTurn();
  saathi.setState(mood === "alert" ? "alert" : "thinking");
  try {
    const audio = new Audio(await speechUrl(text, app.language()));
    saathi.setState("speaking");
    await new Promise((resolve) => { audio.onended = resolve; audio.onerror = resolve; audio.play().catch(resolve); });
  } catch {
    // Captions already show the text.
  }
  saathi.setState("idle");
  if (heardIds.length > 0) {
    await api.copilot.heard(heardIds).catch(() => {});
    refresh(true);
  }
}

/** Typed input when the live session is off: one Gemini call that may also run a tool. */
async function askByText(text) {
  saathi.setState("thinking");
  try {
    const answer = await api.copilot.ask({ text });
    captions.add("saathi", answer.reply);
    captions.endTurn();
    if (answer.uiEvent?.type === "navigate") app.navigate(answer.uiEvent.screen);
    else refresh(true);
    await speakOffline(answer.reply, []);
  } catch (error) {
    saathi.setState("idle");
    snackbar(error.message || t("error_generic"));
  }
}

function fillOrderForm(force) {
  if (!rider || (orderFormFilled && !force)) return;
  const form = $("#order-form");
  form.platform.value = rider.order?.platform ?? app.user().platform ?? "";
  form.customerArea.value = rider.order?.customerArea ?? "";
  form.etaMinutes.value = rider.order?.etaMinutes ?? "";
  orderFormFilled = true;
}

async function saveOrder(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const hasOrder = form.platform.value.trim() || form.customerArea.value.trim() || form.etaMinutes.value;
  await update({
    order: hasOrder
      ? { platform: form.platform.value.trim(), customerArea: form.customerArea.value.trim(), etaMinutes: form.etaMinutes.value === "" ? null : Number(form.etaMinutes.value) }
      : null,
  });
  snackbar(t("cp_saved"));
}

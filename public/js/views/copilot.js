/**
 * Co-pilot: Saathi answers calls while the rider rides, then briefs them at the next stop.
 * The phone agent writes messages through the server webhook. This screen polls for them.
 */
import { api } from "../api.js";
import { createAvatar } from "../avatar.js";
import { $, h, icon, snackbar } from "../dom.js";
import { t } from "../i18n.js";
import { startRecording } from "../media.js";
import { speechUrl, stopReading } from "../speech.js";

const POLL_MS = 5000;
const MAX_RECORDING_MS = 30_000;
const CALLER_ICONS = { customer: "person", restaurant: "restaurant", platform: "two_wheeler", family: "family_restroom", other: "call" };

let app;
let avatar;
let rider = null;
let messages = [];
let version = -1;
let seenIds = null;
let recording = null;
let recordingTimer = null;
let orderFormFilled = false;

export function init(context) {
  app = context;
  avatar = createAvatar($("#cp-avatar"));
  $("#cp-toggle").addEventListener("click", toggleRiding);
  $("#cp-talk").addEventListener("click", toggleTalk);
  $("#cp-play").addEventListener("click", playBriefing);
  $("#cp-ask-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const text = $("#cp-ask-text").value.trim();
    if (text) ask({ text });
    $("#cp-ask-text").value = "";
  });
  $("#cp-order-form").addEventListener("submit", saveOrder);
  $("#cp-delivered").addEventListener("click", () => update({ order: null }).then(() => fillOrderForm(true)));
  document.addEventListener("haqdar:language", (event) => update({ language: event.detail }));

  refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS);
}

export function enter() {
  refresh();
}

async function update(changes) {
  try {
    ({ rider } = await api.copilot.update(changes));
    render();
  } catch (error) {
    snackbar(error.message || t("error_generic"));
  }
}

async function refresh() {
  try {
    const data = await api.copilot.get();
    if (data.version === version) return;
    version = data.version;
    rider = data.rider;
    messages = data.messages;
    if (rider.language !== app.language()) update({ language: app.language() });
    announceNewMessages();
    render();
    fillOrderForm(false);
  } catch {
    // The next poll will try again.
  }
}

/** Speak urgent messages at once. Others wait for the next stop, unless the rider has stopped. */
function announceNewMessages() {
  const fresh = messages.filter((message) => !message.heard && !seenIds?.has(message.id));
  const firstLoad = seenIds === null;
  seenIds = new Set(messages.map((message) => message.id));
  if (firstLoad || fresh.length === 0 || avatar.isSpeaking()) return;
  const now = fresh.filter((message) => message.urgency === "urgent" || message.scamSuspected || rider.status !== "riding");
  if (now.length > 0) speak(now.map((message) => message.spoken).join(" "), now.map((message) => message.id), "alert");
}

function render() {
  if (!rider) return;
  const riding = rider.status === "riding";
  avatar.setResting(riding ? "riding" : "idle");
  $("#cp-status").textContent = t(`cp_state_${rider.status}`);
  const toggle = $("#cp-toggle");
  toggle.replaceChildren(icon(riding ? "pan_tool" : "two_wheeler"), h("span", { text: riding ? t("cp_stop") : t("cp_start") }));
  toggle.setAttribute("aria-pressed", String(riding));

  const unheard = messages.filter((message) => !message.heard).length;
  const badge = $("#cp-new");
  badge.hidden = unheard === 0;
  badge.textContent = t("cp_new", { n: unheard });
  $("#cp-list").replaceChildren(...(messages.length
    ? messages.slice(0, 20).map(renderMessage)
    : [h("p", { class: "card__hint", text: t("cp_calls_empty") })]));
}

function renderMessage(message) {
  const time = new Date(message.receivedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return h("li", { class: `call-item${message.heard ? "" : " call-item--new"}` },
    h("span", { class: "call-item__icon" }, icon(CALLER_ICONS[message.callerType] ?? "call")),
    h("div", { class: "call-item__main" },
      h("p", { class: "call-item__who" },
        [t(`caller_${message.callerType}`), message.callerName, message.callerNumber]
          .filter((part, index, parts) => part && parts.indexOf(part) === index).join(" · ")),
      h("p", { text: message.purpose }),
      message.details && h("p", { class: "call-item__details", text: message.details }),
      h("div", { class: "chips" },
        h("span", { class: "chip chip--static", text: time }),
        message.urgency === "urgent" && h("span", { class: "verdict verdict--very_low" }, icon("priority_high"), t("cp_urgent")),
        message.scamSuspected && h("span", { class: "verdict verdict--very_low" }, icon("gpp_maybe"), t("cp_scam")),
        message.callBack && h("span", { class: "verdict verdict--low" }, icon("phone_callback"), t("cp_call_back")),
      ),
    ),
  );
}

async function toggleRiding() {
  const nextStatus = rider?.status === "riding" ? "stopped" : "riding";
  await update({ status: nextStatus });
  if (nextStatus === "stopped") playBriefing();
}

/** Read every new message aloud, then mark them heard. */
async function playBriefing() {
  const unheard = messages.filter((message) => !message.heard).reverse();
  if (unheard.length === 0) return speak(t("cp_no_new"), []);
  const text = [t("cp_briefing", { n: unheard.length }), ...unheard.map((message) => message.spoken)].join(" ");
  await speak(text, unheard.map((message) => message.id));
}

async function speak(text, heardIds, mood = "speaking") {
  stopReading();
  avatar.setState(mood === "alert" ? "alert" : "thinking");
  showReply(text);
  try {
    await avatar.playAudio(await speechUrl(text, app.language()));
  } catch {
    await avatar.speakWithBrowser(text, app.language());
  }
  if (heardIds.length > 0) {
    await api.copilot.heard(heardIds).catch(() => {});
    version = -1;
    refresh();
  }
}

function showReply(text) {
  const reply = $("#cp-reply");
  reply.hidden = false;
  reply.textContent = text;
}

async function toggleTalk() {
  if (recording) return finishTalk();
  try {
    recording = await startRecording();
  } catch {
    recording = null;
    snackbar(t("error_mic"));
    return;
  }
  setTalkState(true);
  avatar.setState("listening");
  recordingTimer = setTimeout(finishTalk, MAX_RECORDING_MS);
}

async function finishTalk() {
  clearTimeout(recordingTimer);
  const current = recording;
  recording = null;
  setTalkState(false);
  if (!current) return;
  const audio = await current.stop();
  if (audio.seconds < 0.5) return render();
  ask({ audio: { mimeType: audio.mimeType, data: audio.data } });
}

function setTalkState(active) {
  const button = $("#cp-talk");
  button.classList.toggle("btn--recording", active);
  button.setAttribute("aria-pressed", String(active));
  button.querySelector(".icon").textContent = active ? "stop" : "mic";
  $("#cp-talk-label").textContent = active ? t("cp_stop_talk") : t("cp_talk");
  $("#cp-listening").hidden = !active;
}

/** Send speech or text to Saathi. The server may change the rider status from the answer. */
async function ask(input) {
  avatar.setState("thinking");
  showReply(t("cp_thinking"));
  try {
    const answer = await api.copilot.ask({ language: app.language(), ...input });
    rider = answer.rider;
    render();
    const said = answer.transcript ? `“${answer.transcript}” ` : "";
    showReply(`${said}${answer.reply}`);
    await speak(answer.reply, []);
    showReply(`${said}${answer.reply}`);
    if (answer.action === "play_messages" || answer.action === "stop_riding") await playBriefing();
  } catch (error) {
    render();
    showReply(error.message || t("error_generic"));
  }
}

function fillOrderForm(force) {
  if (!rider || (orderFormFilled && !force)) return;
  const form = $("#cp-order-form");
  form.riderName.value = rider.riderName ?? "";
  form.platform.value = rider.order?.platform ?? "";
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
    riderName: form.riderName.value.trim() || "Rider",
    order: hasOrder
      ? { platform: form.platform.value.trim(), customerArea: form.customerArea.value.trim(), etaMinutes: form.etaMinutes.value === "" ? null : Number(form.etaMinutes.value) }
      : null,
  });
  snackbar(t("cp_saved"));
}

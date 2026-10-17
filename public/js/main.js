/** App start: load reference data, set the language, and route between the four screens. */
import { api } from "./api.js";
import { $, $$, h, snackbar } from "./dom.js";
import { applyStrings, loadStrings, t } from "./i18n.js";
import * as store from "./store.js";
import * as ask from "./views/ask.js";
import * as earnings from "./views/earnings.js";
import * as benefits from "./views/benefits.js";
import * as complaint from "./views/complaint.js";
import * as copilot from "./views/copilot.js";

const VIEWS = { copilot, ask, earnings, benefits, complaint };
const DEFAULT_VIEW = "copilot";

let meta;
let language = store.getLanguage() ?? "en";

const context = {
  get meta() { return meta; },
  language: () => language,
  navigate,
};

/** Show a screen. `payload` passes data from one screen to the next, for example earnings to log. */
function navigate(name, payload) {
  const view = name in VIEWS ? name : DEFAULT_VIEW;
  for (const section of $$("[data-view]")) section.hidden = section.dataset.view !== view;
  for (const link of $$("[data-nav]")) {
    if (link.dataset.nav === view) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  if (location.hash.slice(1) !== view) history.pushState(null, "", `#${view}`);
  window.scrollTo({ top: 0 });
  $("#main").focus({ preventScroll: true });
  VIEWS[view].enter(payload);
}

function fillSelects() {
  for (const select of $$("[data-states]")) {
    const chosen = select.value;
    select.replaceChildren(h("option", { value: "", text: t("choose_state") }), ...meta.states.map((state) => h("option", { value: state, text: state })));
    select.value = chosen;
  }
  for (const select of $$("[data-work-types]")) {
    const chosen = select.value || "delivery";
    select.replaceChildren(...meta.workTypes.map((type) => h("option", { value: type, text: t(`work_${type}`) })));
    select.value = chosen;
  }
}

async function setLanguage(code) {
  language = code;
  store.setLanguage(code);
  document.documentElement.lang = code;
  $("#lang-current").textContent = meta.languages[code].native;
  for (const option of $$("[data-lang]")) option.setAttribute("aria-checked", String(option.dataset.lang === code));
  const button = $("#lang-button");
  button.setAttribute("aria-busy", "true");
  button.querySelector(".icon").textContent = "progress_activity";
  try {
    await loadStrings(code);
  } finally {
    button.removeAttribute("aria-busy");
    button.querySelector(".icon").textContent = "translate";
  }
  applyStrings();
  fillSelects();
  document.dispatchEvent(new CustomEvent("haqdar:language", { detail: code }));
}

function buildLanguageDialog() {
  const dialog = $("#lang-dialog");
  $("#lang-options").replaceChildren(...Object.entries(meta.languages).map(([code, { name, native }]) =>
    h("button", {
      class: "chip lang-option", type: "button", role: "radio", "data-lang": code, lang: code, "aria-checked": String(code === language),
      onclick: async () => {
        dialog.close();
        if (code !== language) snackbar(t("lang_loading"));
        await setLanguage(code);
      },
    }, h("span", { class: "lang-option__native", text: native }), h("span", { class: "lang-option__name", text: name, lang: "en" }))));
  $("#lang-button").addEventListener("click", () => dialog.showModal());
  $("#lang-close").addEventListener("click", () => dialog.close());
}

async function start() {
  const firstVisit = store.getLanguage() === null;
  applyStrings();
  try {
    meta = await api.meta();
  } catch {
    snackbar(t("error_generic"));
    return;
  }
  buildLanguageDialog();
  fillSelects();
  for (const view of Object.values(VIEWS)) view.init(context);
  window.addEventListener("hashchange", () => navigate(location.hash.slice(1)));
  navigate(location.hash.slice(1) || DEFAULT_VIEW);
  if (firstVisit) $("#lang-dialog").showModal();
  // Draw the screens first, then switch the text when the translation arrives.
  await setLanguage(language);
}

start();

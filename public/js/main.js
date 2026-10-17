/** App start: sign-in state, language, and routing between screens with simple guards. */
import { api, AuthError } from "./api.js";
import { $, $$, h, snackbar } from "./dom.js";
import { applyStrings, loadStrings, t } from "./i18n.js";
import * as store from "./store.js";
import * as saathi from "./saathi.js";
import { login, signup, setup } from "./views/auth.js";
import * as welcome from "./views/welcome.js";
import * as home from "./views/home.js";
import * as help from "./views/help.js";
import * as earnings from "./views/earnings.js";
import * as ask from "./views/ask.js";
import * as benefits from "./views/benefits.js";
import * as complaint from "./views/complaint.js";

const VIEWS = { login, signup, setup, welcome, home, money: earnings, help, ask, benefits, complaint };
const PUBLIC_VIEWS = new Set(["login", "signup"]);
const NAV_FOR = { home: "home", money: "money", help: "help", ask: "help", benefits: "help", complaint: "help" };

let meta;
let user = null;
let language = store.getLanguage() ?? "hi";
let current = null;

const context = {
  get meta() { return meta; },
  user: () => user,
  language: () => language,
  navigate,
  setLanguage,
  /** Called after login, signup, or a profile change. Routes to the next step unless `silent`. */
  setUser(next, { silent = false } = {}) {
    user = next;
    renderAccount();
    if (user && user.language !== language) setLanguage(user.language);
    if (!silent) navigate(nextStep());
  },
};

/** The screen a user must see next: setup, then the intro, then home. */
function nextStep() {
  if (!user) return "login";
  if (!user.setupDone) return "setup";
  if (!user.onboarded) return "welcome";
  return "home";
}

function allowed(view) {
  if (!user) return PUBLIC_VIEWS.has(view) ? view : "login";
  if (PUBLIC_VIEWS.has(view) || !(view in VIEWS)) return nextStep();
  if (!user.setupDone && view !== "setup") return "setup";
  return view;
}

/** Show a screen. `payload` passes data from one screen to the next, for example earnings to log. */
function navigate(name, payload) {
  const view = allowed(name);
  if (current && current !== view) VIEWS[current].leave?.();
  current = view;
  for (const section of $$("[data-view]")) section.hidden = section.dataset.view !== view;
  const signedIn = Boolean(user) && !PUBLIC_VIEWS.has(view);
  $("#nav").hidden = !signedIn || view === "welcome" || view === "setup";
  $("#account").hidden = !signedIn;
  for (const link of $$("[data-nav]")) {
    if (link.dataset.nav === NAV_FOR[view]) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  if (location.hash.slice(1) !== view) history.replaceState(null, "", `#${view}`);
  window.scrollTo({ top: 0 });
  $("#main").focus({ preventScroll: true });
  VIEWS[view].enter?.(payload);
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

let languageRequest = 0;

/** Switch the interface language. A newer call wins if two overlap, so labels and text never mismatch. */
async function setLanguage(code) {
  if (!(code in meta.languages)) return;
  const request = ++languageRequest;
  language = code;
  store.setLanguage(code);
  const button = $("#lang-button");
  button.setAttribute("aria-busy", "true");
  try {
    await loadStrings(code);
  } finally {
    if (request === languageRequest) button.removeAttribute("aria-busy");
  }
  if (request !== languageRequest) return;
  document.documentElement.lang = code;
  $("#lang-current").textContent = meta.languages[code].native;
  for (const option of $$("#lang-options [data-lang]")) option.setAttribute("aria-checked", String(option.dataset.lang === code));
  applyStrings();
  fillSelects();
  if (user && user.language !== code) {
    api.auth.profile({ language: code }).then(({ user: updated }) => { if (updated) user = { ...user, ...updated }; }).catch(() => {});
  }
}

function renderAccount() {
  if (!user) return;
  $("#account-initial").textContent = user.name.trim().charAt(0).toUpperCase() || "?";
  $("#menu-name").textContent = user.name;
}

function buildDialogs() {
  const langDialog = $("#lang-dialog");
  $("#lang-options").replaceChildren(...Object.entries(meta.languages).map(([code, { name, native }]) =>
    h("button", {
      class: "chip lang-option", type: "button", role: "radio", "data-lang": code, lang: code, "aria-checked": String(code === language),
      onclick: async () => { langDialog.close(); if (code !== language) snackbar(t("lang_loading")); await setLanguage(code); },
    }, h("span", { class: "lang-option__native", text: native }), h("span", { class: "lang-option__name", text: name, lang: "en" }))));
  $("#lang-button").addEventListener("click", () => langDialog.showModal());
  $("#lang-close").addEventListener("click", () => langDialog.close());

  const menu = $("#menu-dialog");
  $("#account").addEventListener("click", () => { $("#menu-forwarding").replaceChildren(welcome.forwardingCard()); menu.showModal(); });
  const whatsapp = $("#menu-whatsapp");
  if (meta.whatsappNumber) whatsapp.href = `https://wa.me/${meta.whatsappNumber.replace(/\D/g, "")}?text=${encodeURIComponent("Namaste Saathi")}`;
  else whatsapp.closest("section").hidden = true;
  $("#menu-close").addEventListener("click", () => menu.close());
  $("#menu-intro").addEventListener("click", () => { menu.close(); navigate("welcome"); });
  $("#menu-logout").addEventListener("click", async () => {
    menu.close();
    saathi.stop();
    await api.auth.logout().catch(() => {});
    user = null;
    navigate("login");
  });
}

async function start() {
  applyStrings();
  try {
    meta = await api.meta();
  } catch {
    snackbar(t("error_generic"));
    return;
  }
  buildDialogs();
  fillSelects();
  for (const view of Object.values(VIEWS)) view.init(context);

  try {
    ({ user } = await api.auth.me());
  } catch {
    user = null;
  }
  if (user?.language) language = user.language;
  renderAccount();
  window.addEventListener("hashchange", () => navigate(location.hash.slice(1)));
  window.addEventListener("unhandledrejection", (event) => {
    if (event.reason instanceof AuthError) { event.preventDefault(); user = null; navigate("login"); }
  });
  navigate(location.hash.slice(1) || nextStep());
  await setLanguage(language);
}

start();

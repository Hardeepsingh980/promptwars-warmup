/** Login, signup, and the one-time setup screen. */
import { api } from "../api.js";
import { $, $$, h, snackbar } from "../dom.js";
import { t } from "../i18n.js";

let app;

function showError(form, message) {
  const box = form.querySelector(".form-error");
  box.hidden = !message;
  box.textContent = message ?? "";
}

async function submit(form, action) {
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  showError(form, null);
  try {
    await action();
  } catch (error) {
    showError(form, error.message || t("error_generic"));
  } finally {
    button.disabled = false;
  }
}

export const login = {
  init(context) {
    app = context;
    $("#login-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      submit(form, async () => {
        const { user } = await api.auth.login({ phone: form.phone.value, password: form.password.value });
        app.setUser(user);
      });
    });
  },
  enter() { $("#login-form").phone.focus(); },
};

export const signup = {
  init(context) {
    app = context;
    const form = $("#signup-form");
    const chips = $("#signup-languages");
    chips.replaceChildren(...Object.entries(context.meta.languages).map(([code, { native }]) =>
      h("button", { class: "chip", type: "button", role: "radio", lang: code, "data-lang": code, "aria-checked": String(code === app.language()), text: native,
        onclick: () => { for (const chip of $$("[data-lang]", chips)) chip.setAttribute("aria-checked", String(chip.dataset.lang === code)); app.setLanguage(code); } })));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submit(form, async () => {
        const { user } = await api.auth.signup({ name: form.name.value, phone: form.phone.value, password: form.password.value, language: app.language() });
        app.setUser(user);
      });
    });
  },
  enter() {
    for (const chip of $$("#signup-languages [data-lang]")) chip.setAttribute("aria-checked", String(chip.dataset.lang === app.language()));
    $("#signup-form").name.focus();
  },
};

export const setup = {
  init(context) {
    app = context;
    const form = $("#setup-form");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      submit(form, async () => {
        const { user } = await api.auth.profile({ state: form.state.value, workType: form.workType.value, platform: form.platform.value.trim(), setupDone: true });
        app.setUser(user);
        snackbar(t("cp_saved"));
      });
    });
  },
  enter() {
    const form = $("#setup-form");
    const user = app.user();
    form.state.value = user.state ?? "";
    form.workType.value = user.workType ?? "delivery";
    form.platform.value = user.platform ?? "";
  },
};

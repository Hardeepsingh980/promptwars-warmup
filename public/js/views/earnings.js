/** Earnings: log a day, check if the pay is fair, and see the last 7 days. */
import { computePay, summarizeLog } from "/shared/pay.js";
import { api } from "../api.js";
import { $, h, icon, rupees, showLoading, showResult, snackbar, todayIso } from "../dom.js";
import { t } from "../i18n.js";
import { speakButton } from "../speech.js";
import * as store from "../store.js";

let app;

export function init(context) {
  app = context;
  const form = $("#earn-form");
  form.date.value = todayIso();
  form.date.max = todayIso();
  form.addEventListener("submit", onSubmit);
  renderWeek();
}

/** Called when the view opens. `prefill` comes from an earnings screenshot or voice note. */
export function enter({ prefill } = {}) {
  const form = $("#earn-form");
  const profile = store.getProfile();
  if (profile.state) form.state.value = profile.state;
  if (profile.workType) form.workType.value = profile.workType;
  if (!prefill) return;
  const set = (name, value) => { if (value !== null && value !== undefined) form[name].value = value; };
  set("earnings", prefill.gross ?? prefill.net);
  set("hours", prefill.hours);
  set("fuel", prefill.fuel);
  set("other", prefill.deductions);
  set("platform", prefill.platform);
  if (/^\d{4}-\d{2}-\d{2}$/.test(prefill.date ?? "") && prefill.date <= todayIso()) set("date", prefill.date);
  form.earnings.focus();
}

function readForm(form) {
  const number = (name) => Number(form[name].value || 0);
  return {
    date: form.date.value,
    platform: form.platform.value.trim(),
    state: form.state.value,
    workType: form.workType.value,
    earnings: number("earnings"),
    hours: number("hours"),
    fuel: number("fuel"),
    other: number("other"),
  };
}

function onSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const day = readForm(form);
  const { net } = computePay(day);
  store.addLogEntry({ date: day.date, platform: day.platform, earnings: day.earnings, hours: day.hours, net });
  store.updateProfile({ state: day.state, workType: day.workType });
  renderWeek();
  snackbar(t("saved"));
  checkPay(day);
}

async function checkPay(day, minimumWageDaily) {
  const result = $("#earn-result");
  showLoading(result, t("loading"));
  try {
    const answer = await api.fairPay({ language: app.language(), ...day, minimumWageDaily });
    showResult(result, renderPay(answer, day));
  } catch (error) {
    result.replaceChildren(h("p", { class: "banner", role: "alert" }, icon("error"), h("span", { text: error.message || t("error_generic") })));
  }
}

function renderPay({ pay, minimumWage, verdict, message }, day) {
  const wageInput = h("input", {
    id: "min-wage", class: "field__control", type: "number", inputmode: "numeric", min: "1", max: "10000",
    value: Math.round(minimumWage.daily), "aria-describedby": "min-wage-help",
  });
  const recheck = () => {
    const value = Number(wageInput.value);
    if (value > 0) checkPay(day, value);
  };
  const spoken = () => [message.headline, ...message.lines, ...message.tips].join(". ");
  const lowPay = verdict === "low" || verdict === "very_low";

  return h("article", { class: "card stack", "aria-labelledby": "pay-headline" },
    h("div", { class: "card__head" },
      h("span", { class: `verdict verdict--${verdict}` }, icon(verdict === "fair" ? "check_circle" : "info"), t(`verdict_${verdict}`)),
      speakButton(spoken, app.language),
    ),
    h("p", { class: "big-number" }, rupees(pay.perHour), " ", h("small", { text: t("pay_per_hour") })),
    h("div", { class: "stats" },
      stat(t("pay_kept"), rupees(pay.net)),
      stat(t("pay_costs"), rupees(pay.costs)),
      stat(t("pay_8h"), rupees(pay.dailyEquivalent)),
    ),
    h("h2", { id: "pay-headline", text: message.headline }),
    h("div", { class: "result__lines" }, message.lines.map((line) => h("p", { text: line }))),
    message.tips.length > 0 && h("div", { class: "stack stack--tight" },
      h("h3", { class: "card__section-title", text: t("tips") }),
      h("ul", {}, message.tips.map((tip) => h("li", { text: tip }))),
    ),
    h("div", { class: "card card--plain stack" },
      h("div", { class: "compose" },
        h("div", { class: "field" }, h("label", { for: "min-wage", text: t("f_min_wage") }), wageInput),
        h("button", { class: "btn btn--tonal", type: "button", onclick: recheck }, icon("refresh"), h("span", { text: t("recheck") })),
      ),
      h("p", { id: "min-wage-help", class: "field__help" },
        minimumWage.source === "ai_estimate" ? `${t("min_wage_ai")} (${minimumWage.note})` : t("min_wage_user"),
        " ", t("min_wage_note"),
      ),
    ),
    lowPay && h("button", { class: "btn btn--filled", type: "button", onclick: () => app.navigate("benefits") },
      icon("volunteer_activism"), h("span", { text: t("act_benefits") })),
  );
}

function stat(label, value) {
  return h("div", { class: "stat" }, h("p", { class: "stat__label", text: label }), h("p", { class: "stat__value", text: value }));
}

/** Show totals for the last 7 days and the list of logged days. */
export function renderWeek() {
  const container = $("#week-summary");
  const log = store.getLog();
  const summary = summarizeLog(log);
  if (summary.count === 0) {
    container.replaceChildren(h("p", { class: "card__hint", text: t("week_empty") }));
    return;
  }
  const recent = log.slice(0, 7);
  container.replaceChildren(
    h("div", { class: "stack" },
      h("div", { class: "stats" },
        stat(t("week_total"), rupees(summary.total)),
        stat(t("week_hours"), String(Math.round(summary.hours * 10) / 10)),
        stat(t("week_rate"), rupees(summary.perHour)),
      ),
      h("ul", { class: "log-list" }, recent.map((entry) =>
        h("li", { class: "log-item" },
          h("div", { class: "log-item__main" },
            h("p", { text: `${rupees(entry.net)} · ${entry.hours} h` }),
            h("p", { class: "log-item__meta", text: [entry.date, entry.platform].filter(Boolean).join(" · ") }),
          ),
          h("button", {
            class: "btn btn--text btn--icon", type: "button", "aria-label": `${t("delete_day")} ${entry.date}`,
            onclick: () => { store.removeLogEntry(entry.id); renderWeek(); },
          }, icon("delete")),
        ),
      )),
    ),
  );
}

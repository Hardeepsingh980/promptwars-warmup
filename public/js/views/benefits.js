/** Benefits: government schemes and laws that fit the worker, with steps to apply. */
import { summarizeLog } from "/shared/pay.js";
import { api } from "../api.js";
import { $, h, icon, showLoading, showResult } from "../dom.js";
import { t } from "../i18n.js";
import { speakButton } from "../speech.js";
import * as store from "../store.js";

const DAYS_PER_MONTH = 30;
let app;

export function init(context) {
  app = context;
  $("#ben-form").addEventListener("submit", onSubmit);
  $("#helplines").replaceChildren(...context.meta.helplines.map((line) =>
    h("a", { class: "chip", href: `tel:${line.number}` }, icon("call"), `${line.label}: ${line.number}`)));
}

/** Fill the form from the saved profile. Estimate monthly income from the log if it is empty. */
export async function enter() {
  const form = $("#ben-form");
  const user = app.user();
  const profile = store.getProfile();
  form.state.value = user.state || profile.state || "";
  form.workType.value = user.workType || profile.workType || "delivery";
  if (profile.age) form.age.value = profile.age;

  const help = $("#ben-income-help");
  help.hidden = true;
  if (profile.monthlyIncome !== undefined) {
    form.monthlyIncome.value = profile.monthlyIncome;
    return;
  }
  try {
    const { entries } = await api.earnings.list();
    const week = summarizeLog(entries);
    if (week.count > 0) {
      form.monthlyIncome.value = Math.round((week.total / week.days) * DAYS_PER_MONTH);
      help.hidden = false;
    }
  } catch {
    // The rider can type the income.
  }
}

async function onSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const profile = {
    state: form.state.value,
    workType: form.workType.value,
    age: Number(form.age.value),
    monthlyIncome: Number(form.monthlyIncome.value),
  };
  store.updateProfile(profile);

  const result = $("#ben-result");
  showLoading(result, t("loading"));
  try {
    const answer = await api.schemes({ language: app.language(), ...profile });
    showResult(result, ...renderBenefits(answer));
  } catch (error) {
    result.replaceChildren(h("p", { class: "banner", role: "alert" }, icon("error"), h("span", { text: error.message || t("error_generic") })));
  }
}

function renderBenefits({ intro, schemes, laws }) {
  const spoken = () => [intro, ...schemes.map((scheme) => `${scheme.name}. ${scheme.benefit}`)].join(". ");
  const nodes = [
    h("div", { class: "card card--primary stack" },
      h("div", { class: "card__head" }, h("p", { class: "result__lines", text: intro }), speakButton(spoken, app.language)),
    ),
  ];
  if (schemes.length === 0) nodes.push(h("p", { class: "banner banner--info", text: t("ben_none") }));

  for (const scheme of schemes) {
    nodes.push(h("article", { class: "card card--interactive stack", "aria-labelledby": `scheme-${scheme.id}` },
      h("h2", { id: `scheme-${scheme.id}`, text: scheme.name }),
      h("p", { class: "result__lines", text: scheme.benefit }),
      h("p", { class: "banner banner--info" }, icon("person_check"), h("span", {}, h("strong", { text: `${t("ben_why")}: ` }), scheme.whyItFits)),
      h("div", { class: "stack stack--tight" },
        h("h3", { class: "card__section-title", text: t("ben_how") }),
        h("ol", { class: "steps" }, scheme.steps.map((step) => h("li", {}, h("span", { text: step })))),
      ),
      h("div", { class: "stack stack--tight" },
        h("h3", { class: "card__section-title", text: t("ben_docs") }),
        h("div", { class: "chips" }, scheme.documents.map((doc) => h("span", { class: "chip chip--static" }, icon("description"), doc))),
      ),
      h("a", { class: "btn btn--outlined", href: scheme.link, target: "_blank", rel: "noopener noreferrer" },
        icon("open_in_new"), h("span", { text: t("ben_open") }), h("span", { class: "visually-hidden", text: scheme.name })),
    ));
  }

  if (laws.length > 0) {
    nodes.push(h("section", { class: "card stack", "aria-labelledby": "laws-title" },
      h("h2", { id: "laws-title", text: t("ben_laws") }),
      laws.map((law) => h("div", { class: "stack stack--tight" },
        h("h3", { text: law.name }),
        h("p", { text: law.explain }),
        h("a", { href: law.link, target: "_blank", rel: "noopener noreferrer", text: law.link.replace(/^https:\/\//, "") }),
      )),
    ));
  }
  return nodes;
}

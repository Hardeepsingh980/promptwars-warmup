/** Ask: the home screen. A photo, a voice note, or text goes in. An explanation and next steps come out. */
import { api } from "../api.js";
import { $, h, icon, showLoading, showResult, snackbar } from "../dom.js";
import { t } from "../i18n.js";
import { shrinkImage } from "../media.js";
import { speakButton } from "../speech.js";

const CALLS = { call_emergency: "112", call_cyber: "1930", call_legal_aid: "15100" };

let app;

export function init(context) {
  app = context;
  $("#ask-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const text = $("#ask-text").value.trim();
    if (text) ask({ text });
  });
  $("#ask-photo-input").addEventListener("change", onPhoto);
  for (const chip of document.querySelectorAll("[data-example]")) {
    chip.addEventListener("click", () => {
      $("#ask-text").value = t(chip.dataset.example);
      ask({ text: $("#ask-text").value });
    });
  }
}

export function enter() {}

async function onPhoto(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    const { previewUrl, ...image } = await shrinkImage(file);
    URL.revokeObjectURL(previewUrl);
    ask({ image, text: $("#ask-text").value.trim() });
  } catch {
    snackbar(t("error_photo"));
  }
}

async function ask(input) {
  const result = $("#ask-result");
  showLoading(result, t("loading"));
  try {
    const answer = await api.understand({ language: app.language(), ...input });
    showResult(result, renderAnswer(answer));
  } catch (error) {
    result.replaceChildren(h("p", { class: "banner", role: "alert" }, icon("error"), h("span", { text: error.message || t("error_generic") })));
  }
}

function renderAnswer(answer) {
  const spoken = () => [answer.title, ...answer.summary, answer.caution].filter(Boolean).join(". ");
  return h("article", { class: "card stack", "aria-labelledby": "answer-title" },
    h("div", { class: "card__head" },
      h("h2", { id: "answer-title", text: answer.title }),
      speakButton(spoken, app.language),
    ),
    answer.transcript && h("p", { class: "result__transcript" }, h("strong", { text: `${t("you_said")}: ` }), answer.transcript),
    answer.caution && h("p", { class: "banner", role: "alert" }, icon("warning"), h("span", { text: answer.caution })),
    h("div", { class: "result__lines" }, answer.summary.map((line) => h("p", { text: line }))),
    answer.nextSteps.length > 0 && h("div", { class: "stack stack--tight" },
      h("h3", { class: "card__section-title", text: t("next_steps") }),
      h("ol", { class: "steps" }, answer.nextSteps.map((step) => h("li", {}, h("span", { text: step })))),
    ),
    answer.actions.length > 0 && h("div", { class: "row" }, answer.actions.map((action) => actionButton(action, answer))),
  );
}

function actionButton(action, answer) {
  if (action in CALLS) {
    return h("a", { class: "btn btn--outlined", href: `tel:${CALLS[action]}` }, icon("call"), h("span", { text: t(`act_${action}`) }));
  }
  const handlers = {
    log_earnings: () => app.navigate("money", { prefill: answer.earnings }),
    complaint: () => app.navigate("complaint", { problem: answer.problem || answer.summary.join(" "), platform: answer.earnings?.platform }),
    benefits: () => app.navigate("benefits"),
  };
  const icons = { log_earnings: "add_card", complaint: "edit_document", benefits: "volunteer_activism" };
  return h("button", { class: "btn btn--filled", type: "button", onclick: handlers[action] }, icon(icons[action]), h("span", { text: t(`act_${action}`) }));
}

/** Complaint: turn a description or a screenshot into a formal letter, with who to send it to. */
import { api } from "../api.js";
import { $, h, icon, showLoading, showResult, snackbar } from "../dom.js";
import { t } from "../i18n.js";
import { shrinkImage } from "../media.js";
import { speakButton } from "../speech.js";

let app;
let photo = null;

export function init(context) {
  app = context;
  $("#cmp-form").addEventListener("submit", onSubmit);
  $("#cmp-photo-input").addEventListener("change", onPhoto);
}

/** `problem` and `platform` come from the Ask screen. */
export function enter({ problem, platform } = {}) {
  const form = $("#cmp-form");
  if (problem) form.problem.value = problem;
  if (platform) form.platform.value = platform;
  if (problem) form.problem.focus();
}

async function onPhoto(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    const { previewUrl, ...image } = await shrinkImage(file);
    photo = image;
    const preview = $("#cmp-photo-preview");
    preview.hidden = false;
    preview.replaceChildren(
      h("img", { src: previewUrl, alt: "" }),
      h("button", { class: "btn btn--text btn--sm", type: "button", onclick: clearPhoto }, icon("close"), h("span", { text: t("remove_photo") })),
    );
  } catch {
    snackbar(t("error_photo"));
  }
}

function clearPhoto() {
  photo = null;
  const preview = $("#cmp-photo-preview");
  preview.querySelector("img")?.src && URL.revokeObjectURL(preview.querySelector("img").src);
  preview.replaceChildren();
  preview.hidden = true;
}

async function onSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const problem = form.problem.value.trim();
  if (!problem && !photo) {
    form.problem.focus();
    snackbar(t("f_problem"));
    return;
  }
  const result = $("#cmp-result");
  showLoading(result, t("loading"));
  try {
    const answer = await api.complaint({
      language: app.language(), problem, platform: form.platform.value.trim(), city: form.city.value.trim(), image: photo ?? undefined,
    });
    showResult(result, ...renderComplaint(answer));
  } catch (error) {
    result.replaceChildren(h("p", { class: "banner", role: "alert" }, icon("error"), h("span", { text: error.message || t("error_generic") })));
  }
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    snackbar(t("copied"));
  } catch {
    snackbar(t("error_generic"));
  }
}

function renderComplaint({ subject, body, summary, evidence, sendTo, escalation }) {
  const letter = `Subject: ${subject}\n\n${body}`;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(letter)}`;
  const email = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return [
    h("article", { class: "card card--primary stack", "aria-labelledby": "cmp-says" },
      h("div", { class: "card__head" }, h("h2", { id: "cmp-says", text: t("cmp_says") }), speakButton(() => summary.join(" "), app.language)),
      h("div", { class: "result__lines" }, summary.map((line) => h("p", { text: line }))),
      h("p", { class: "banner banner--info" }, icon("send"), h("span", {}, h("strong", { text: `${t("cmp_send_to")}: ` }), t(`to_${sendTo.key}`))),
    ),
    h("article", { class: "card stack", "aria-labelledby": "cmp-letter" },
      h("h2", { id: "cmp-letter", text: t("cmp_letter") }),
      h("p", { class: "card__hint", text: t("cmp_fill") }),
      h("div", { class: "letter", tabindex: "0", lang: "en", "aria-label": t("cmp_letter") }, h("strong", { text: subject }), "\n\n", body),
      h("div", { class: "row" },
        h("button", { class: "btn btn--filled", type: "button", onclick: () => copy(letter) }, icon("content_copy"), h("span", { text: t("copy") })),
        h("a", { class: "btn btn--tonal", href: whatsapp, target: "_blank", rel: "noopener noreferrer" }, icon("chat"), h("span", { text: t("share_whatsapp") })),
        h("a", { class: "btn btn--outlined", href: email }, icon("mail"), h("span", { text: t("share_email") })),
      ),
    ),
    h("section", { class: "card stack", "aria-labelledby": "cmp-evidence" },
      h("h2", { id: "cmp-evidence", text: t("cmp_evidence") }),
      h("ul", {}, evidence.map((item) => h("li", { text: item }))),
    ),
    h("section", { class: "card stack", "aria-labelledby": "cmp-ladder" },
      h("h2", { id: "cmp-ladder", text: t("cmp_ladder") }),
      h("ol", { class: "steps" }, escalation.map((step) => h("li", {},
        h("div", {},
          h("p", {}, h("strong", { text: t(`ladder_${step.id}_who`) })),
          h("p", { class: "card__hint", text: t(`ladder_${step.id}_how`) }),
          step.waitDays && h("p", { class: "field__help", text: t("wait_days", { n: step.waitDays }) }),
        )))),
    ),
  ];
}

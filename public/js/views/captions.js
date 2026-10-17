/** A small transcript of the live conversation, built from streamed captions. */
import { h } from "../dom.js";
import { t } from "../i18n.js";

const MAX_LINES = 6;

export function renderCaptions(container) {
  let current = { role: null, node: null };

  return {
    add(role, text) {
      if (current.role !== role || !current.node) {
        const line = h("p", { class: `caption caption--${role}` },
          h("span", { class: "caption__who", text: role === "user" ? t("captions_you") : t("captions_saathi") }),
          h("span", { class: "caption__text" }));
        container.append(line);
        current = { role, node: line.querySelector(".caption__text") };
        while (container.children.length > MAX_LINES) container.firstChild.remove();
      }
      current.node.textContent += text;
      container.scrollTop = container.scrollHeight;
    },
    endTurn() { current = { role: null, node: null }; },
    clear() { container.replaceChildren(); current = { role: null, node: null }; },
  };
}

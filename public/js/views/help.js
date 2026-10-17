/** Help: a hub with three tools. Each tool is its own screen with a back button. */
import { $ } from "../dom.js";

export function init(context) {
  for (const card of document.querySelectorAll("[data-open]")) {
    card.addEventListener("click", () => context.navigate(card.dataset.open));
  }
  for (const back of document.querySelectorAll("[data-back]")) {
    back.addEventListener("click", () => context.navigate("help"));
  }
}

export function enter() {
  $("#help-hub").querySelector("[data-open]").focus({ preventScroll: true });
}

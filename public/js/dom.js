/**
 * Small DOM helpers. All text goes in through textContent, never innerHTML,
 * so model output cannot inject markup.
 */

/** Create an element. `props` sets attributes; `class`, `text`, and `on*` handlers are special. */
export function h(tag, props = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") element.className = value;
    else if (key === "text") element.textContent = value;
    else if (key.startsWith("on")) element.addEventListener(key.slice(2), value);
    else element.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return element;
}

/** A Material Symbols icon, hidden from screen readers. */
export const icon = (name) => h("span", { class: "icon", "aria-hidden": "true", text: name });

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/** Format whole rupees with Indian digit grouping. */
export const rupees = (value) =>
  typeof value === "number" && Number.isFinite(value) ? `₹${Math.round(value).toLocaleString("en-IN")}` : "–";

/** Today's date as YYYY-MM-DD in local time. */
export function todayIso() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/** Show the loading skeleton in a result area. */
export function showLoading(container, label) {
  container.replaceChildren(
    h("div", { class: "card stack", "aria-busy": "true" },
      h("p", { class: "card__hint", text: label }),
      h("div", { class: "skeleton", "aria-hidden": "true" }, h("span"), h("span"), h("span"), h("span")),
    ),
  );
}

/** Replace a result area and move focus to it so screen readers read it. */
export function showResult(container, ...nodes) {
  container.replaceChildren(...nodes);
  container.focus({ preventScroll: true });
  container.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
}

let snackbarTimer;
/** Show a short message at the bottom of the screen. */
export function snackbar(message) {
  const bar = $("#snackbar");
  bar.textContent = message;
  bar.classList.add("snackbar--show");
  clearTimeout(snackbarTimer);
  snackbarTimer = setTimeout(() => bar.classList.remove("snackbar--show"), 3500);
}

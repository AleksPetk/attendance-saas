import {
  DOCS_UI,
  SUPPORTED_LOCALES,
  docsPathFor,
  saveDocsLocalePreference,
} from "./locale.js";
import { slugFromPath } from "./docs-view.js";

function GlobeIcon() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
    <path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"/>
    <path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M3.6 9h16.8M3.6 15h16.8M12 3c2.2 2.6 3.4 5.8 3.4 9s-1.2 6.4-3.4 9c-2.2-2.6-3.4-5.8-3.4-9s1.2-6.4 3.4-9Z"/>
  </svg>`;
}

export function mountDocsLanguageMenu(root, { locale, onNavigate }) {
  if (!root) return null;
  const ui = DOCS_UI[locale] || DOCS_UI.en;
  const menuId = "docs-language-dropdown";
  let open = false;

  function currentSlug() {
    return slugFromPath(window.location.pathname);
  }

  function render() {
    const items = SUPPORTED_LOCALES.map((code) => {
      const active = code === locale;
      const href = docsPathFor(currentSlug(), code);
      const label = (ui.localeLabels && ui.localeLabels[code]) || code;
      const activeMark = active
        ? `<span class="docs-language-active-mark" aria-label="${ui.languageActiveLabel}">✓</span>`
        : "";
      return `<li role="none">
        <button
          type="button"
          role="menuitemradio"
          class="docs-language-option${active ? " is-active" : ""}"
          aria-checked="${active ? "true" : "false"}"
          data-locale="${code}"
          data-href="${href}"
        >
          <span>${label}</span>
          ${activeMark}
        </button>
      </li>`;
    }).join("");

    root.innerHTML = `<button
      type="button"
      class="docs-language-trigger"
      aria-label="${ui.languageMenuAria}"
      aria-expanded="${open ? "true" : "false"}"
      aria-haspopup="menu"
      aria-controls="${menuId}"
      id="docs-language-trigger"
    >${GlobeIcon()}</button>
    <ul class="docs-language-menu${open ? "" : " hidden"}" id="${menuId}" role="menu" aria-label="${ui.languageMenuAria}">
      ${items}
    </ul>`;
  }

  function setOpen(next) {
    open = Boolean(next);
    const trigger = root.querySelector("#docs-language-trigger");
    const menu = root.querySelector(`#${menuId}`);
    if (trigger) trigger.setAttribute("aria-expanded", open ? "true" : "false");
    if (menu) menu.classList.toggle("hidden", !open);
  }

  function onPointerDown(event) {
    if (!root.contains(event.target)) setOpen(false);
  }

  function onKeyDown(event) {
    if (event.key === "Escape") setOpen(false);
  }

  function onClick(event) {
    const trigger = event.target.closest("#docs-language-trigger");
    if (trigger && root.contains(trigger)) {
      setOpen(!open);
      return;
    }
    const option = event.target.closest("[data-locale]");
    if (!option || !root.contains(option)) return;
    const nextLocale = option.getAttribute("data-locale");
    const href = option.getAttribute("data-href");
    if (!nextLocale || !href) return;
    saveDocsLocalePreference(nextLocale);
    setOpen(false);
    if (typeof onNavigate === "function") {
      onNavigate(href, nextLocale);
    } else {
      window.location.assign(href);
    }
  }

  render();
  root.addEventListener("click", onClick);
  window.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("keydown", onKeyDown);

  return {
    update(nextLocale) {
      locale = nextLocale;
      setOpen(false);
      render();
    },
    destroy() {
      root.removeEventListener("click", onClick);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      root.innerHTML = "";
    },
  };
}

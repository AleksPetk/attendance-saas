import {
  STATUS_UI,
  SUPPORTED_LOCALES,
  saveStatusLocalePreference,
  statusPathFor,
} from "./locale.js";

function GlobeIcon() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
    <path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"/>
    <path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M3.6 9h16.8M3.6 15h16.8M12 3c2.2 2.6 3.4 5.8 3.4 9s-1.2 6.4-3.4 9c-2.2-2.6-3.4-5.8-3.4-9s1.2-6.4 3.4-9Z"/>
  </svg>`;
}

export function mountStatusLanguageMenu(root, { locale, onNavigate }) {
  if (!root) return null;
  let currentLocale = locale;
  const menuId = "status-language-dropdown";
  let open = false;

  function ui() {
    return STATUS_UI[currentLocale] || STATUS_UI.en;
  }

  function render() {
    const strings = ui();
    const items = SUPPORTED_LOCALES.map((code) => {
      const active = code === currentLocale;
      const href = statusPathFor(code);
      const label = (strings.localeLabels && strings.localeLabels[code]) || code;
      const activeMark = active
        ? `<span class="status-language-active-mark" aria-label="${strings.languageActiveLabel}">✓</span>`
        : "";
      return `<li role="none">
        <button
          type="button"
          role="menuitemradio"
          class="status-language-option${active ? " is-active" : ""}"
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
      class="status-language-trigger"
      aria-label="${strings.languageMenuAria}"
      aria-expanded="${open ? "true" : "false"}"
      aria-haspopup="menu"
      aria-controls="${menuId}"
      id="status-language-trigger"
    >${GlobeIcon()}</button>
    <ul class="status-language-menu${open ? "" : " hidden"}" id="${menuId}" role="menu" aria-label="${strings.languageMenuAria}">
      ${items}
    </ul>`;
  }

  function setOpen(next) {
    open = Boolean(next);
    const trigger = root.querySelector("#status-language-trigger");
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
    const trigger = event.target.closest("#status-language-trigger");
    if (trigger && root.contains(trigger)) {
      setOpen(!open);
      return;
    }
    const option = event.target.closest("[data-locale]");
    if (!option || !root.contains(option)) return;
    const nextLocale = option.getAttribute("data-locale");
    const href = option.getAttribute("data-href");
    if (!nextLocale || !href) return;
    saveStatusLocalePreference(nextLocale);
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
      currentLocale = nextLocale;
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

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useLanguage } from "./LanguageProvider.jsx";

export function useLanguageSelection() {
  const { locale, supportedLocales, localeLabels, setLanguage } = useLanguage();

  const selectLanguage = useCallback(
    (nextLocale, { persistBackend = true } = {}) => {
      return setLanguage(nextLocale, { explicit: true, persistBackend });
    },
    [setLanguage],
  );

  return { locale, supportedLocales, localeLabels, selectLanguage, setLanguage };
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.6 9h16.8M3.6 15h16.8M12 3c2.2 2.6 3.4 5.8 3.4 9s-1.2 6.4-3.4 9c-2.2-2.6-3.4-5.8-3.4-9s1.2-6.4 3.4-9Z"
      />
    </svg>
  );
}

/** Compact select control — used on auth screens. */
export function LanguageSwitcher({ id = "language-switcher", className = "", label }) {
  const { t } = useTranslation("common");
  const { locale, supportedLocales, localeLabels, selectLanguage } = useLanguageSelection();
  const resolvedLabel = label ?? t("language");

  return (
    <div className={`language-switcher ${className}`.trim()}>
      {label !== null ? (
        <label className="language-switcher-label" htmlFor={id}>
          {resolvedLabel}
        </label>
      ) : null}
      <select
        id={id}
        className="language-switcher-select"
        value={locale}
        aria-label={resolvedLabel}
        onChange={(event) => {
          void selectLanguage(event.target.value);
        }}
      >
        {supportedLocales.map((code) => (
          <option key={code} value={code}>
            {localeLabels[code] || code}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Header globe button + dropdown — authenticated workspace top bar. */
export function WorkspaceLanguageMenu() {
  const { t } = useTranslation("common");
  const { locale, supportedLocales, localeLabels, selectLanguage } = useLanguageSelection();
  const menuId = useId();
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function toggleOpen() {
    setOpen((current) => !current);
  }

  async function handleSelect(code) {
    await selectLanguage(code);
    setOpen(false);
  }

  return (
    <div className="workspace-language-root" ref={rootRef} data-tutorial-target="workspace-language">
      <button
        type="button"
        className="workspace-language-trigger"
        aria-label={t("languageMenu.aria")}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={toggleOpen}
      >
        <GlobeIcon />
      </button>

      {open ? (
        <ul className="workspace-language-menu" id={menuId} role="menu" aria-label={t("languageMenu.aria")}>
          {supportedLocales.map((code) => {
            const active = locale === code;
            return (
              <li key={code} role="none">
                <button
                  type="button"
                  role="menuitemradio"
                  className={active ? "workspace-language-option is-active" : "workspace-language-option"}
                  aria-checked={active}
                  onClick={() => {
                    void handleSelect(code);
                  }}
                >
                  <span>{localeLabels[code] || code}</span>
                  {active ? (
                    <span className="workspace-language-active-mark" aria-label={t("languageMenu.activeLabel")}>
                      ✓
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

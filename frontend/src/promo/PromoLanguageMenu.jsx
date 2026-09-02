import { useEffect, useRef, useState } from "react";
import { usePromoLocale } from "./PromoLocaleContext.jsx";
import { SUPPORTED_PROMO_LOCALES } from "./locale.js";

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

const LOCALE_LABELS = {
  en: "English",
  ja: "日本語",
};

export default function PromoLanguageMenu() {
  const { locale, setPromoLocale, t } = usePromoLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="promo-language-root" ref={rootRef}>
      <button
        type="button"
        className="promo-language-trigger"
        aria-label={t("shell.languageMenuAria") || "Language"}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <GlobeIcon />
      </button>
      <ul
        className={`promo-language-menu${open ? "" : " hidden"}`}
        role="menu"
        aria-label={t("shell.languageMenuAria") || "Language"}
      >
        {SUPPORTED_PROMO_LOCALES.map((code) => {
          const active = code === locale;
          return (
            <li key={code} role="none">
              <button
                type="button"
                role="menuitemradio"
                className={`promo-language-option${active ? " is-active" : ""}`}
                aria-checked={active}
                onClick={() => {
                  setOpen(false);
                  setPromoLocale(code);
                }}
              >
                <span>{LOCALE_LABELS[code] || code}</span>
                {active ? (
                  <span className="promo-language-active-mark" aria-hidden="true">
                    ✓
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

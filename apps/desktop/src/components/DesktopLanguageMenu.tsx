import { useEffect, useId, useRef, useState } from "react";

export function DesktopLanguageMenu({
  label,
  locale,
  onSelect,
}: {
  label: string;
  locale: "en" | "ja";
  onSelect: (locale: "en" | "ja") => void;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="desktop-language-root" ref={rootRef}>
      <button
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        className="desktop-language-trigger"
        onClick={() => setOpen((current) => !current)}
        title={label}
        type="button"
      >
        <GlobeIcon />
      </button>
      {open ? (
        <div aria-label={label} className="desktop-language-menu" id={menuId} role="menu">
          {(
            [
              ["en", "English"],
              ["ja", "日本語"],
            ] as const
          ).map(([code, optionLabel]) => {
            const active = locale === code;
            return (
              <button
                aria-checked={active}
                className={`desktop-language-option${active ? " is-active" : ""}`}
                key={code}
                onClick={() => {
                  onSelect(code);
                  setOpen(false);
                }}
                role="menuitemradio"
                type="button"
              >
                <span>{optionLabel}</span>
                {active ? (
                  <span aria-hidden="true" className="desktop-language-check">
                    ✓
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function GlobeIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="24" viewBox="0 0 24 24" width="24">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
    </svg>
  );
}

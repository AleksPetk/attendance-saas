/**
 * Decorative pre-identification visual for photo-oriented Input templates.
 *
 * Never loads a participant photo. Hidden for non-photo Input families via CSS.
 */
export function KioskIdentifyGenericVisual() {
  return (
    <div className="kiosk-identify-generic" aria-hidden="true">
      <svg
        className="kiosk-identify-generic-svg kiosk-identify-generic-svg--polaroid"
        viewBox="0 0 120 90"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x="4" y="4" width="112" height="82" rx="4" fill="currentColor" opacity="0.08" />
        <circle cx="60" cy="34" r="14" fill="currentColor" opacity="0.28" />
        <path
          d="M32 72c4.5-14 16-22 28-22s23.5 8 28 22"
          fill="currentColor"
          opacity="0.28"
        />
        <rect x="78" y="14" width="26" height="18" rx="3" fill="currentColor" opacity="0.22" />
        <circle cx="91" cy="23" r="5" stroke="currentColor" strokeWidth="2" opacity="0.55" />
      </svg>
      <svg
        className="kiosk-identify-generic-svg kiosk-identify-generic-svg--id_badge"
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="32" cy="32" r="30" fill="currentColor" opacity="0.1" />
        <circle cx="32" cy="24" r="10" fill="currentColor" opacity="0.38" />
        <path
          d="M12 54c4-12 12-18 20-18s16 6 20 18"
          fill="currentColor"
          opacity="0.38"
        />
      </svg>
      <svg
        className="kiosk-identify-generic-svg kiosk-identify-generic-svg--kids_bubble"
        viewBox="0 0 72 72"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="36" cy="36" r="28" fill="currentColor" opacity="0.14" />
        <circle cx="36" cy="30" r="12" fill="currentColor" opacity="0.42" />
        <path
          d="M16 58c5-12 13-18 20-18s15 6 20 18"
          fill="currentColor"
          opacity="0.42"
        />
        <circle cx="14" cy="16" r="4" fill="currentColor" opacity="0.35" />
        <circle cx="60" cy="18" r="3" fill="currentColor" opacity="0.3" />
      </svg>
    </div>
  );
}

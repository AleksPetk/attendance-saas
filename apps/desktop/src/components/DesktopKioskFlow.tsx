import { useState, type CSSProperties, type FormEvent } from "react";

function PasswordVisibilityIcon({ hidden }: { hidden: boolean }) {
  if (hidden) {
    return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12 18 18.75 12 18.75 2.25 12 2.25 12z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3.1" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M3 3l18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M9.88 9.88A3.1 3.1 0 0 0 12 15.1a3.1 3.1 0 0 0 2.22-.92M6.53 6.53C4.3 8.02 2.7 10.2 2.25 12c.75 1.8 3.75 6.75 9.75 6.75 1.86 0 3.5-.45 4.9-1.16M17.47 17.47C19.7 15.98 21.3 13.8 21.75 12 21 10.2 18 5.25 12 5.25c-.78 0-1.52.08-2.22.23" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

export function DesktopKioskConfirmation({ family, message, accent }: { family: string; message: string; accent: string }) {
  const style = { "--kc-accent": accent, "--kc-accent-2": accent, "--kc-accent-gradient": accent, "--kc-accent-mode": "solid" } as CSSProperties;
  return <div className={`kiosk-confirmation kiosk-confirmation--unified kiosk-confirmation--${family} kiosk-confirmation--live`} data-kc-family={family} style={style} role="status" aria-live="polite">
    <div className="kc-unified-panel"><div className="kc-unified-mark" aria-hidden="true"><span className="kc-unified-check">✓</span></div><p className="kc-unified-message">{message}</p></div>
  </div>;
}

export function DesktopKioskProcessing({ family, name, accent }: { family: string; name: string; accent: string }) {
  const style = { "--kp-accent": accent, "--kp-accent-2": accent } as CSSProperties;
  return <div className={`kiosk-processing kiosk-processing--unified kiosk-processing--${family} kiosk-processing--live`} data-kp-family={family} style={style} role="status" aria-live="polite" aria-busy="true">
    <div className="kp-unified-panel"><div className="kp-unified-indicator kp-unified-indicator--spinner" aria-hidden="true"><span className="kp-spinner-ring" /></div><p className="kp-unified-headline">{name}</p></div>
  </div>;
}

export function DesktopKioskExitDialog({ code, error, busy, labels, onCodeChange, onCancel, onConfirm }: {
  code: string; error: string; busy: boolean;
  labels: { title: string; hint: string; code: string; show: string; hide: string; cancel: string; exit: string; verifying: string };
  onCodeChange: (value: string) => void; onCancel: () => void; onConfirm: () => void;
}) {
  const [visible, setVisible] = useState(false);
  function submit(event: FormEvent) { event.preventDefault(); if (code && !busy) onConfirm(); }
  return <div className="kiosk-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="desktop-kiosk-exit-title">
    <form className="kiosk-modal" onSubmit={submit}>
      <h2 id="desktop-kiosk-exit-title">{labels.title}</h2><p className="hint">{labels.hint}</p>
      <label className="field"><span className="field-label">{labels.code}</span><span className="password-input password-input-with-toggle"><input autoFocus autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} name="kiosk-exit-code" type={visible ? "text" : "password"} value={code} onChange={(event) => onCodeChange(event.target.value)} /><button type="button" className="password-toggle" aria-label={visible ? labels.hide : labels.show} aria-pressed={visible} onMouseDown={(event) => event.preventDefault()} onClick={() => setVisible((value) => !value)}><PasswordVisibilityIcon hidden={!visible} /></button></span>{error ? <span className="field-error-text">{error}</span> : null}</label>
      <div className="kiosk-exit-actions"><button type="button" className="btn-secondary" disabled={busy} onClick={onCancel}>{labels.cancel}</button><button type="submit" className="btn-primary" disabled={busy || !code}>{busy ? labels.verifying : labels.exit}</button></div>
    </form>
  </div>;
}

export function DesktopKioskPinDialog({ title, label, code, error, busy, cancelLabel, confirmLabel, onCodeChange, onCancel, onConfirm }: {
  title: string; label: string; code: string; error: string; busy: boolean; cancelLabel: string; confirmLabel: string;
  onCodeChange: (value: string) => void; onCancel: () => void; onConfirm: () => void;
}) {
  function submit(event: FormEvent) { event.preventDefault(); if (code && !busy) onConfirm(); }
  return <div className="kiosk-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="desktop-kiosk-pin-title">
    <form className="kiosk-modal" onSubmit={submit}><h2 id="desktop-kiosk-pin-title">{title}</h2><label className="field"><span className="field-label">{label}</span><input className="kiosk-pin-input" autoFocus autoComplete="one-time-code" value={code} onChange={(event) => onCodeChange(event.target.value)} />{error ? <span className="field-error-text">{error}</span> : null}</label><div className="kiosk-exit-actions"><button type="button" className="btn-secondary" disabled={busy} onClick={onCancel}>{cancelLabel}</button><button type="submit" className="btn-primary" disabled={busy || !code}>{confirmLabel}</button></div></form>
  </div>;
}

import { useState, type CSSProperties, type FormEvent } from "react";

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
      <label className="field"><span className="field-label">{labels.code}</span><span className="password-input password-input-with-toggle"><input autoFocus autoComplete="off" name="kiosk-exit-code" type={visible ? "text" : "password"} value={code} onChange={(event) => onCodeChange(event.target.value)} /><button type="button" className="password-toggle" aria-label={visible ? labels.hide : labels.show} aria-pressed={visible} onMouseDown={(event) => event.preventDefault()} onClick={() => setVisible((value) => !value)}>{visible ? "◉" : "◌"}</button></span>{error ? <span className="field-error-text">{error}</span> : null}</label>
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

/**
 * Desktop gate: keep the kiosk route mounted when Django session expires.
 *
 * AuthController becomes anonymous on 401, but App must not drop to Sign-In while
 * an active kiosk lock (with exit token recovery) is in effect.
 */

type Listener = (groupId: string | null) => void;

let activeGroupId: string | null = null;
let sessionExpired = false;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener(activeGroupId);
}

export function setDesktopKioskActive(groupId: string | number): void {
  const next = String(groupId || "").trim();
  if (!next) return;
  if (activeGroupId === next) return;
  activeGroupId = next;
  notify();
}

export function clearDesktopKioskActive(groupId?: string | number): void {
  if (groupId != null && activeGroupId !== String(groupId)) return;
  if (activeGroupId == null && !sessionExpired) return;
  activeGroupId = null;
  sessionExpired = false;
  notify();
}

export function getDesktopKioskActiveGroupId(): string | null {
  return activeGroupId;
}

export function markDesktopKioskSessionExpired(): void {
  sessionExpired = true;
}

export function clearDesktopKioskSessionExpired(): void {
  sessionExpired = false;
}

export function isDesktopKioskSessionExpired(): boolean {
  return sessionExpired;
}

export function subscribeDesktopKioskActive(listener: Listener): () => void {
  listeners.add(listener);
  listener(activeGroupId);
  return () => {
    listeners.delete(listener);
  };
}

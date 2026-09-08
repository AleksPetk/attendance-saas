import { endpoints } from "@checkstation/api";

export type AccountLink = { kind: "reset" | "recover" | "verify"; endpoint: string; uid: string; token: string };

/** Parse only CheckStation Workspace email routes; pasted URLs are never opened. */
export function parseAccountLink(input: string): AccountLink | null {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== "https:" || url.hostname !== "workspace.checkstation.app" || url.username || url.password) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const paths: Record<string, { kind: AccountLink["kind"]; endpoint: string }> = {
      "reset-password": { kind: "reset", endpoint: endpoints.resetPassword() },
      "recover-account": { kind: "recover", endpoint: endpoints.recoverAccountConfirm() },
      "recover-account/verify-primary": { kind: "verify", endpoint: endpoints.recoverAccountVerifyPrimary() },
      "verify-email": { kind: "verify", endpoint: "/auth/verify-email/" },
      "verify-backup-email": { kind: "verify", endpoint: "/auth/verify-backup-email/" },
      "verify-primary-email": { kind: "verify", endpoint: "/auth/verify-primary-email/" },
    };
    const token = parts.pop();
    const uid = parts.pop();
    const route = paths[parts.join("/")];
    return route && uid && token ? { ...route, uid, token } : null;
  } catch {
    return null;
  }
}

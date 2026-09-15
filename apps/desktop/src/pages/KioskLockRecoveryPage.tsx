import { useState } from "react";
import { flushSync } from "react-dom";
import { endpoints } from "@checkstation/api";
import { DesktopKioskExitDialog } from "../components/DesktopKioskFlow";
import { Alert, Button, Page, formatError } from "../components/ui";
import { useApp } from "../lib/AppProvider";
import { beginDesktopKioskExitGuard } from "../lib/kioskExitGuard";

/**
 * Server says kiosk_locked but the locked Group id is missing/unusable.
 * Never blank the window — offer exit-code unlock without bypassing security.
 */
export function KioskLockRecoveryPage() {
  const { api, auth, locale, t } = useApp();
  const [exitOpen, setExitOpen] = useState(true);
  const [exitCode, setExitCode] = useState("");
  const [exitError, setExitError] = useState("");
  const [busy, setBusy] = useState(false);

  async function exit() {
    setBusy(true);
    setExitError("");
    try {
      const response = await api.post<{
        kiosk_locked?: boolean;
        kiosk_group_id?: number | null;
        kiosk_available?: boolean;
      }>(endpoints.kioskExit(), { exit_code: exitCode });
      beginDesktopKioskExitGuard();
      flushSync(() => {
        auth.applyKioskUnlock(response);
      });
      window.location.hash = "#/";
      void auth.refreshWorkspace().catch(() => {});
    } catch (caught) {
      setExitError(formatError(caught, t("common.error")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page>
      <div style={{ maxWidth: 520, margin: "48px auto", display: "grid", gap: 16 }}>
        <h1 style={{ margin: 0 }}>{t("kiosk.exit")}</h1>
        <Alert tone="warning">
          {locale === "ja"
            ? "このセッションはキオスクロック中ですが、復元に必要なグループ情報が見つかりません。終了コードでロックを解除してください。"
            : "This session is kiosk-locked, but the locked Group could not be restored. Enter the exit code to unlock."}
        </Alert>
        <Button type="button" onClick={() => setExitOpen(true)}>{t("kiosk.exit")}</Button>
      </div>
      {exitOpen ? (
        <DesktopKioskExitDialog
          code={exitCode}
          error={exitError}
          busy={busy}
          onCodeChange={setExitCode}
          onCancel={() => { setExitOpen(false); setExitCode(""); setExitError(""); }}
          onConfirm={() => void exit()}
          labels={{
            title: t("kiosk.exit"),
            hint: locale === "ja"
              ? "キオスク終了コードを入力して、このアプリのロックを解除してください。"
              : "Enter the kiosk exit code to unlock this app.",
            code: t("kiosk.exitCode"),
            show: t("auth.showPassword"),
            hide: t("auth.hidePassword"),
            cancel: t("common.cancel"),
            exit: t("kiosk.exit"),
            verifying: t("common.loading"),
          }}
        />
      ) : null}
    </Page>
  );
}

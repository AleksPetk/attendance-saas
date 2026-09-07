import { useApp } from "../lib/AppProvider";

export function SecurityPage() {
  const { auth, t } = useApp();
  return (
    <div>
      <h1>Security</h1>
      <p>{auth.getOAuthGapNote()}</p>
      <p>{t("auth.oauthUnavailable")}</p>
    </div>
  );
}

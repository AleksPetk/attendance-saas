import { Link } from "react-router-dom";
import { useApp } from "../lib/AppProvider";

export function AccountPage() {
  const { authState, t } = useApp();
  return (
    <div>
      <h1>{t("account.title")}</h1>
      <p>Role: {String(authState.session?.role || "")}</p>
      <p><Link to="/security">Security</Link></p>
    </div>
  );
}

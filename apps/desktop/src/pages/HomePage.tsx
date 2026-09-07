import { useEffect, useState } from "react";
import { endpoints } from "@checkstation/api";
import { workspacePlanKey } from "@checkstation/domain";
import { useApp } from "../lib/AppProvider";

export function HomePage() {
  const { api, authState, t } = useApp();
  const [dashboard, setDashboard] = useState<unknown>(null);
  useEffect(() => {
    void api.get(endpoints.dashboard()).then(setDashboard).catch(() => setDashboard(null));
  }, [api]);
  return (
    <div>
      <h1>{t("home.welcome")}</h1>
      <p>{String(authState.session?.workspace?.name || authState.session?.workspace?.workspace_id || "")}</p>
      <p>{t("home.plan")}: {workspacePlanKey(authState.session)}</p>
      <p>Role: {String(authState.session?.role || "")}</p>
      {dashboard ? <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(dashboard, null, 2).slice(0, 800)}</pre> : null}
    </div>
  );
}

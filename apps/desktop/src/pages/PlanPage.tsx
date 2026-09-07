import { useEffect, useState } from "react";
import { endpoints } from "@checkstation/api";
import { workspacePlanKey } from "@checkstation/domain";
import { useApp } from "../lib/AppProvider";

export function PlanPage() {
  const { api, authState, t } = useApp();
  const [billing, setBilling] = useState<unknown>(null);
  useEffect(() => {
    void api.get(endpoints.billing()).then(setBilling).catch(() => setBilling(null));
  }, [api]);
  return (
    <div>
      <h1>{t("plan.title")}</h1>
      <p>Plan: {workspacePlanKey(authState.session)}</p>
      <p>{t("plan.nativeBillingNote")}</p>
      {billing ? <pre>{JSON.stringify(billing, null, 2).slice(0, 600)}</pre> : null}
    </div>
  );
}

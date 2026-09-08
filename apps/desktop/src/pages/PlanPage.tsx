import { useCallback, useEffect, useState } from "react";
import { endpoints } from "@checkstation/api";
import { canViewBilling } from "@checkstation/domain";
import { formatDateTime } from "@checkstation/i18n";
import { Alert, Badge, Card, Loading, Page, PageHeader, formatError } from "../components/ui";
import { useApp } from "../lib/AppProvider";
type Billing = { effective_plan?: { key?: string; display_name?: string }; subscribed_plan?: { display_name?: string }; status?: string; interval?: string | null; trial_ends_at?: string | null; current_period_end?: string | null; cancel_at_period_end?: boolean; managed_by_platform?: boolean; purchase_source?: string; scheduled_change?: { active?: boolean; kind?: string | null } };
export function PlanPage() {
  const { api, authState, locale, t } = useApp(); const allowed = canViewBilling(authState.session); const [billing, setBilling] = useState<Billing | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const load = useCallback(async () => { if (!allowed) return; setLoading(true); setError(""); try { setBilling(await api.get<Billing>(endpoints.billing())); } catch (caught) { setError(formatError(caught, t("common.error"))); } finally { setLoading(false); } }, [allowed, api, t]); useEffect(() => { void load(); }, [load]);
  if (!allowed) return <Page><Alert tone="warning">{t("more.staffRoleDescription")}</Alert></Page>;
  if (loading) return <Page><Loading label={t("plan.loading")} /></Page>;
  const date = billing?.trial_ends_at || billing?.current_period_end; const plan = billing?.effective_plan?.display_name || billing?.effective_plan?.key || t("common.unknown");
  return <Page narrow><PageHeader title={t("plan.title")} description={t("plan.description")} /><Alert>{error}</Alert><Card><div className="plan-hero"><div><span>{t("plan.current")}</span><strong>{plan}</strong></div><Badge tone="blue">{billing?.status || t("plan.available")}</Badge></div></Card><Card title={t("plan.subscription")}><dl className="info-grid"><Info label={t("plan.billingInterval")} value={billing?.interval || t("plan.notApplicable")} /><Info label={t("plan.renewsEnds")} value={date ? formatDateTime(date, locale) : t("plan.notApplicable")} /><Info label={t("plan.management")} value={billing?.managed_by_platform ? t("plan.platformManaged") : t("plan.workspaceManaged")} /><Info label={t("plan.subscription")} value={billing?.subscribed_plan?.display_name || billing?.purchase_source || t("plan.notApplicable")} /></dl>{billing?.cancel_at_period_end ? <Alert tone="warning">{t("plan.cancellationScheduled")}</Alert> : null}{billing?.scheduled_change?.active ? <Alert tone="info">{String(billing.scheduled_change.kind || t("plan.subscription"))}</Alert> : null}</Card><Alert tone="info">{t("plan.nativeBillingNote")}</Alert></Page>;
}
function Info({ label, value }: { label: string; value: string }) { return <div className="info-item"><dt>{label}</dt><dd>{value}</dd></div>; }

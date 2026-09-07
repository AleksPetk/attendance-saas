import { useEffect, useState } from "react";
import { ScrollView } from "react-native";
import { endpoints } from "@checkstation/api";
import { workspacePlanKey } from "@checkstation/domain";
import { Body, Card, LoadingState, Screen, Title } from "../../src/components/ui";
import { useApp } from "../../src/lib/AppProvider";

export default function PlanScreen() {
  const { api, authState, t } = useApp();
  const [billing, setBilling] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await api.get<Record<string, unknown>>(endpoints.billing());
        if (!cancelled) setBilling(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t("common.error"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, t]);

  if (loading) {
    return (
      <Screen>
        <LoadingState label={t("common.loading")} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView>
        <Title>{t("plan.title")}</Title>
        <Card>
          <Body>Plan: {workspacePlanKey(authState.session)}</Body>
          <Body muted>{t("plan.nativeBillingNote")}</Body>
          {error ? <Body muted>{error}</Body> : null}
          {billing ? <Body muted>Billing state loaded from API.</Body> : null}
        </Card>
      </ScrollView>
    </Screen>
  );
}

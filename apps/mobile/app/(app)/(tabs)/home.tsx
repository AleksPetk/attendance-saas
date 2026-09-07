import { useEffect, useState } from "react";
import { ScrollView } from "react-native";
import { endpoints } from "@checkstation/api";
import { workspacePlanKey } from "@checkstation/domain";
import { Body, Card, LoadingState, Screen, Title } from "../../../src/components/ui";
import { useApp } from "../../../src/lib/AppProvider";

export default function HomeScreen() {
  const { api, authState, t } = useApp();
  const [dashboard, setDashboard] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await api.get<Record<string, unknown>>(endpoints.dashboard());
        if (!cancelled) setDashboard(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t("common.error"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, t]);

  const plan =
    authState.session?.workspace?.entitlements?.plan?.display_name
    || workspacePlanKey(authState.session);

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
        <Title>{t("home.welcome")}</Title>
        <Card>
          <Body>
            {String(
              authState.session?.workspace?.name
                || authState.session?.workspace?.workspace_id
                || "Workspace",
            )}
          </Body>
          <Body muted>
            {t("home.plan")}: {String(plan)}
          </Body>
          <Body muted>Role: {String(authState.session?.role || "")}</Body>
        </Card>
        {error ? <Body muted>{error}</Body> : null}
        {dashboard ? (
          <Card>
            <Body>Dashboard loaded from `/api/dashboard/`.</Body>
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

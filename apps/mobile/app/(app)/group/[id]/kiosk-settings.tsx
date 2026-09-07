import { useEffect, useState } from "react";
import { ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { endpoints } from "@checkstation/api";
import { Body, Card, LoadingState, Screen, Title } from "../../../../src/components/ui";
import { useApp } from "../../../../src/lib/AppProvider";

export default function KioskSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, t } = useApp();
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await api.get<Record<string, unknown>>(endpoints.kioskSettings(id));
        if (!cancelled) setSettings(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t("common.error"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, id, t]);

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
        <Title>Kiosk settings</Title>
        <Card>
          {error ? <Body muted>{error}</Body> : null}
          <Body muted>{settings ? JSON.stringify(settings).slice(0, 500) : t("common.empty")}</Body>
        </Card>
      </ScrollView>
    </Screen>
  );
}

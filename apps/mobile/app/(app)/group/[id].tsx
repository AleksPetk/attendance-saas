import { useEffect, useState } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { endpoints } from "@checkstation/api";
import { Body, Button, Card, LoadingState, Screen, Title } from "../../../src/components/ui";
import { useApp } from "../../../src/lib/AppProvider";
import { space } from "../../../src/theme/tokens";

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, t } = useApp();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const [group, setGroup] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await api.get<Record<string, unknown>>(endpoints.group(id));
        if (!cancelled) setGroup(data);
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
        <Title>{String(group?.name || t("groups.title"))}</Title>
        <View style={{ flexDirection: isTablet ? "row" : "column", gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Card>
              <Body>Type: {String(group?.group_type || "")}</Body>
              <Body muted>Status: {String(group?.status || "")}</Body>
              {error ? <Body muted>{error}</Body> : null}
            </Card>
          </View>
          <View style={{ flex: 1, gap: space.sm }}>
            <Button label={t("kiosk.title")} onPress={() => router.push(`/kiosk/${id}`)} />
            <Button
              label="Kiosk settings"
              variant="secondary"
              onPress={() => router.push(`/(app)/group/${id}/kiosk-settings`)}
            />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

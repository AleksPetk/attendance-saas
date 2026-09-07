import { useCallback, useState } from "react";
import { RefreshControl, ScrollView } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { endpoints } from "@checkstation/api";
import { EmptyState, ListRow, LoadingState, Screen, Title } from "../../../src/components/ui";
import { useApp } from "../../../src/lib/AppProvider";

type GroupRow = {
  id: number;
  name: string;
  group_type?: string;
  status?: string;
};

export default function GroupsScreen() {
  const { api, t } = useApp();
  const router = useRouter();
  const [rows, setRows] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await api.get<GroupRow[] | { results: GroupRow[] }>(endpoints.groups());
      const list = Array.isArray(data) ? data : data.results || [];
      setRows(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [api, t]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  if (loading) {
    return (
      <Screen>
        <LoadingState label={t("common.loading")} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>{t("groups.title")}</Title>
      <ScrollView refreshControl={<RefreshControl refreshing={false} onRefresh={() => void load()} />}>
        {error ? <EmptyState label={error} /> : null}
        {!error && rows.length === 0 ? <EmptyState label={t("common.empty")} /> : null}
        {rows.map((g) => (
          <ListRow
            key={g.id}
            title={g.name}
            subtitle={`${g.group_type || "standard"} · ${g.status || "active"}`}
            onPress={() => router.push(`/(app)/group/${g.id}`)}
          />
        ))}
      </ScrollView>
    </Screen>
  );
}

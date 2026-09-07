import { useCallback, useState } from "react";
import { RefreshControl, ScrollView } from "react-native";
import { useFocusEffect } from "expo-router";
import { endpoints } from "@checkstation/api";
import { formatDateTime } from "@checkstation/i18n";
import { EmptyState, ListRow, LoadingState, Screen, Title } from "../../../src/components/ui";
import { useApp } from "../../../src/lib/AppProvider";

type HistoryRow = {
  id: number;
  action_type?: string;
  participant_name_snapshot?: string;
  performed_at?: string;
  group_name_snapshot?: string;
};

export default function HistoryScreen() {
  const { api, t, locale } = useApp();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await api.get<HistoryRow[] | { results: HistoryRow[] }>(endpoints.history());
      const list = Array.isArray(data) ? data : data.results || [];
      setRows(list.slice(0, 50));
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
      <Title>{t("history.title")}</Title>
      <ScrollView refreshControl={<RefreshControl refreshing={false} onRefresh={() => void load()} />}>
        {error ? <EmptyState label={error} /> : null}
        {!error && rows.length === 0 ? <EmptyState label={t("common.empty")} /> : null}
        {rows.map((row) => (
          <ListRow
            key={row.id}
            title={`${row.action_type || "action"} · ${row.participant_name_snapshot || ""}`}
            subtitle={`${row.group_name_snapshot || ""} · ${
              row.performed_at ? formatDateTime(row.performed_at, locale) : ""
            }`}
          />
        ))}
      </ScrollView>
    </Screen>
  );
}

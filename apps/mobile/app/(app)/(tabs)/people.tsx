import { useCallback, useState } from "react";
import { RefreshControl, ScrollView } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { endpoints } from "@checkstation/api";
import { EmptyState, ListRow, LoadingState, Screen, Title } from "../../../src/components/ui";
import { useApp } from "../../../src/lib/AppProvider";

type MemberRow = {
  id: number;
  name?: string;
  full_name?: string;
  email?: string;
  status?: string;
};

export default function PeopleScreen() {
  const { api, t } = useApp();
  const router = useRouter();
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await api.get<MemberRow[] | { results: MemberRow[] }>(endpoints.members());
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
      <Title>{t("people.title")}</Title>
      <ScrollView refreshControl={<RefreshControl refreshing={false} onRefresh={() => void load()} />}>
        {error ? <EmptyState label={error} /> : null}
        {!error && rows.length === 0 ? <EmptyState label={t("common.empty")} /> : null}
        {rows.map((m) => (
          <ListRow
            key={m.id}
            title={m.name || m.full_name || `Member ${m.id}`}
            subtitle={m.email || m.status || ""}
            onPress={() => router.push(`/(app)/member/${m.id}`)}
          />
        ))}
      </ScrollView>
    </Screen>
  );
}

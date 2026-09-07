import { useEffect, useState } from "react";
import { ScrollView } from "react-native";
import { endpoints } from "@checkstation/api";
import { EmptyState, ListRow, LoadingState, Screen, Title } from "../../src/components/ui";
import { useApp } from "../../src/lib/AppProvider";

type StaffRow = { id: number; username?: string; role?: string; status?: string };

export default function StaffScreen() {
  const { api, t } = useApp();
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await api.get<StaffRow[] | { results: StaffRow[] }>(endpoints.workspaceStaff());
        if (!cancelled) setRows(Array.isArray(data) ? data : data.results || []);
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
        <Title>{t("nav.staff")}</Title>
        {error ? <EmptyState label={error} /> : null}
        {!error && rows.length === 0 ? <EmptyState label={t("common.empty")} /> : null}
        {rows.map((s) => (
          <ListRow
            key={s.id}
            title={s.username || `Staff ${s.id}`}
            subtitle={`${s.role || ""} · ${s.status || ""}`}
          />
        ))}
      </ScrollView>
    </Screen>
  );
}

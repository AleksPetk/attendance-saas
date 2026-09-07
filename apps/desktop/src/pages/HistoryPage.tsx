import { useEffect, useState } from "react";
import { endpoints } from "@checkstation/api";
import { formatDateTime } from "@checkstation/i18n";
import { useApp } from "../lib/AppProvider";

type Row = {
  id: number;
  action_type?: string;
  participant_name_snapshot?: string;
  performed_at?: string;
  group_name_snapshot?: string;
};

export function HistoryPage() {
  const { api, t, locale } = useApp();
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    void api
      .get<Row[] | { results: Row[] }>(endpoints.history())
      .then((data) => setRows((Array.isArray(data) ? data : data.results || []).slice(0, 50)))
      .catch(() => setRows([]));
  }, [api]);
  return (
    <div>
      <h1>{t("history.title")}</h1>
      <ul>
        {rows.map((r) => (
          <li key={r.id}>
            {r.action_type} · {r.participant_name_snapshot} · {r.group_name_snapshot} ·{" "}
            {r.performed_at ? formatDateTime(r.performed_at, locale) : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

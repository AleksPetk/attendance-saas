import { useEffect, useState } from "react";
import { endpoints } from "@checkstation/api";
import { useApp } from "../lib/AppProvider";

type Row = { id: number; username?: string; role?: string; status?: string };

export function StaffPage() {
  const { api, t } = useApp();
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    void api
      .get<Row[] | { results: Row[] }>(endpoints.workspaceStaff())
      .then((data) => setRows(Array.isArray(data) ? data : data.results || []))
      .catch(() => setRows([]));
  }, [api]);
  return (
    <div>
      <h1>{t("nav.staff")}</h1>
      <ul>
        {rows.map((s) => (
          <li key={s.id}>{s.username} · {s.role} · {s.status}</li>
        ))}
      </ul>
    </div>
  );
}

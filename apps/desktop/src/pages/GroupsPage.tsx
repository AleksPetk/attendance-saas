import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { endpoints } from "@checkstation/api";
import { useApp } from "../lib/AppProvider";

type Row = { id: number; name: string; group_type?: string; status?: string };

export function GroupsPage() {
  const { api, t } = useApp();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    void api
      .get<Row[] | { results: Row[] }>(endpoints.groups())
      .then((data) => setRows(Array.isArray(data) ? data : data.results || []))
      .catch((err) => setError(err instanceof Error ? err.message : t("common.error")));
  }, [api, t]);
  return (
    <div>
      <h1>{t("groups.title")}</h1>
      {error ? <p>{error}</p> : null}
      <ul>
        {rows.map((g) => (
          <li key={g.id}>
            <Link to={`/groups/${g.id}`}>{g.name}</Link> · {g.group_type} · {g.status}
          </li>
        ))}
      </ul>
    </div>
  );
}

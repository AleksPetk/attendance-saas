import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { endpoints } from "@checkstation/api";
import { useApp } from "../lib/AppProvider";

type Row = { id: number; name?: string; full_name?: string; email?: string };

export function PeoplePage() {
  const { api, t } = useApp();
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    void api
      .get<Row[] | { results: Row[] }>(endpoints.members())
      .then((data) => setRows(Array.isArray(data) ? data : data.results || []))
      .catch(() => setRows([]));
  }, [api]);
  return (
    <div>
      <h1>{t("people.title")}</h1>
      <ul>
        {rows.map((m) => (
          <li key={m.id}>
            <Link to={`/people/${m.id}`}>{m.name || m.full_name || m.id}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

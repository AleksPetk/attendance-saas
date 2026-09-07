import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { endpoints } from "@checkstation/api";
import { useApp } from "../lib/AppProvider";

export function GroupDetailPage() {
  const { id } = useParams();
  const { api, t } = useApp();
  const [group, setGroup] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    if (!id) return;
    void api.get<Record<string, unknown>>(endpoints.group(id)).then(setGroup).catch(() => setGroup(null));
  }, [api, id]);
  return (
    <div>
      <h1>{String(group?.name || t("groups.title"))}</h1>
      <p>Type: {String(group?.group_type || "")}</p>
      <p>
        <Link to={`/kiosk/${id}`}>{t("kiosk.title")}</Link>
      </p>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { endpoints } from "@checkstation/api";
import { useApp } from "../lib/AppProvider";

export function MemberDetailPage() {
  const { id } = useParams();
  const { api, t } = useApp();
  const [member, setMember] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    if (!id) return;
    void api.get<Record<string, unknown>>(endpoints.member(id)).then(setMember).catch(() => setMember(null));
  }, [api, id]);
  return (
    <div>
      <h1>{String(member?.name || member?.full_name || t("people.title"))}</h1>
      <p>{String(member?.email || "")}</p>
    </div>
  );
}

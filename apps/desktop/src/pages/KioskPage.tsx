import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { endpoints } from "@checkstation/api";
import { getValidActionsForState, type ActionType } from "@checkstation/domain";
import { useApp } from "../lib/AppProvider";

export function KioskPage() {
  const { groupId } = useParams();
  const { api, auth, t } = useApp();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [pin, setPin] = useState("");
  const [exitCode, setExitCode] = useState("");
  const [participant, setParticipant] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [group, setGroup] = useState<any>(null);

  useEffect(() => {
    if (!groupId) return;
    void (async () => {
      try {
        await api.post(endpoints.kiosk(groupId), {});
        const data = await api.get(endpoints.kiosk(groupId));
        setGroup(data);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : t("common.error"));
      }
    })();
  }, [api, groupId, t]);

  const flags = {
    check_in_enabled: Boolean(group?.group?.check_in_enabled ?? true),
    check_out_enabled: Boolean(group?.group?.check_out_enabled ?? true),
    breaks_enabled: Boolean(group?.group?.breaks_enabled ?? false),
    max_breaks: Number(group?.group?.max_breaks ?? 0),
  };
  const state = {
    is_checked_in: Boolean(participant?.attendance?.is_checked_in),
    is_on_break: Boolean(participant?.attendance?.is_on_break),
    break_count: Number(participant?.attendance?.break_count ?? 0),
  };
  const actions = participant ? getValidActionsForState(flags, state) : [];

  async function identify() {
    try {
      const data = await api.post(endpoints.kioskIdentify(groupId!), {
        identifier: identifier.trim(),
        pin: pin.trim() || undefined,
      });
      setParticipant(data);
      setMessage("");
    } catch (err) {
      setParticipant(null);
      setMessage(err instanceof Error ? err.message : t("common.error"));
    }
  }

  async function perform(action: ActionType) {
    try {
      await api.post(endpoints.kioskPerform(groupId!), {
        action_type: action,
        identifier: identifier.trim(),
        pin: pin.trim() || undefined,
      });
      setMessage(`${action} recorded`);
      await identify();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t("common.error"));
    }
  }

  async function exitKiosk() {
    try {
      await api.post(endpoints.kioskExit(), {
        group_id: Number(groupId),
        exit_code: exitCode.trim(),
      });
      await auth.bootstrap();
      navigate("/");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t("common.error"));
    }
  }

  return (
    <div style={{ minHeight: "100%", background: "#0B3D3A", color: "#fff", padding: 32 }}>
      <h1>{t("kiosk.title")}</h1>
      <p>{String(group?.group?.name || `Group ${groupId}`)}</p>
      <div style={{ maxWidth: 480 }}>
        <label>Identifier<input value={identifier} onChange={(e) => setIdentifier(e.target.value)} /></label>
        <label>PIN<input type="password" value={pin} onChange={(e) => setPin(e.target.value)} /></label>
        <button type="button" onClick={() => void identify()}>{t("kiosk.identify")}</button>
        {actions.map((a) => (
          <button key={a} type="button" onClick={() => void perform(a)} style={{ marginRight: 8 }}>{a}</button>
        ))}
        <hr />
        <label>Exit code<input type="password" value={exitCode} onChange={(e) => setExitCode(e.target.value)} /></label>
        <button type="button" onClick={() => void exitKiosk()}>{t("kiosk.exit")}</button>
        {message ? <p>{message}</p> : null}
      </div>
      <style>{`label{display:block;margin:12px 0} input{display:block;width:100%;padding:12px;margin-top:6px;font-size:18px} button{min-height:44px;padding:10px 16px;margin-top:8px}`}</style>
    </div>
  );
}

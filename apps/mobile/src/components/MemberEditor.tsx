import { useRef, useState } from "react";
import { ApiError, endpoints, fieldErrorsFromBody } from "@checkstation/api";
import { useApp } from "../lib/AppProvider";
import { Alert, Button, Field } from "./ui";
import { ManagementSheet } from "./ManagementSheet";
import { PhotoField, appendPhoto, type PhotoSelection } from "./PhotoField";

export type MemberRecord = { id: number; name: string; email?: string; phone?: string; address?: string; notes?: string; date_of_birth?: string | null; status?: string; photo_url?: string | null; is_plan_locked?: boolean };
const fields = ["name", "email", "phone", "date_of_birth", "address", "notes"] as const;
export function MemberEditor({ member, onClose, onSaved }: { member: MemberRecord; onClose: () => void; onSaved: (member: MemberRecord) => void }) {
  const { api, t } = useApp();
  const initial = Object.fromEntries(fields.map((key) => [key, member[key] || ""])) as Record<typeof fields[number], string>;
  const [values, setValues] = useState(initial);
  const [clearPhoto, setClearPhoto] = useState(false);
  const [photo, setPhoto] = useState<PhotoSelection | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  async function save() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(""); setErrors({});
    try {
      const form = new FormData();
      fields.forEach((key) => form.append(key, values[key].trim()));
      if (photo) appendPhoto(form, photo);
      if (clearPhoto && !photo) form.append("clear_photo", "true");
      const saved = await api.request<MemberRecord>(endpoints.member(member.id), { method: "PATCH", formData: form });
      onSaved(saved);
    } catch (caught) {
      if (caught instanceof ApiError) setErrors(fieldErrorsFromBody(caught.data));
      setError(caught instanceof Error ? caught.message : t("common.error"));
    } finally { inFlight.current = false; setBusy(false); }
  }
  return <ManagementSheet title={t("members.edit")} dirty={!!photo || clearPhoto || JSON.stringify(values) !== JSON.stringify(initial)} busy={busy} onClose={onClose}>
    <Alert message={error} />
    {fields.map((key) => <Field key={key} label={t(key === "email" ? "auth.email" : key === "date_of_birth" ? "members.birthday" : "members." + key)} hint={key === "date_of_birth" ? t("members.dateHint") : undefined} value={values[key]} onChangeText={(value) => setValues((current) => ({ ...current, [key]: value }))} error={errors[key]} keyboardType={key === "email" ? "email-address" : key === "phone" ? "phone-pad" : "default"} autoCapitalize={key === "email" ? "none" : "sentences"} multiline={key === "address" || key === "notes"} />)}
    <PhotoField value={photo} onChange={setPhoto} />
    {member.photo_url ? <Button variant="secondary" disabled={clearPhoto} label={t("members.removePhoto")} onPress={() => { setClearPhoto(true); setPhoto(null); }} /> : null}
    <Button label={t("members.save")} loading={busy} onPress={() => void save()} />
  </ManagementSheet>;
}

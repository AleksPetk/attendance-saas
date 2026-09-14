import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, endpoints, fieldErrorsFromBody } from "@checkstation/api";
import { canManageWorkspace, canViewGlobalMembers } from "@checkstation/domain";
import { Alert, Badge, Button, Card, Field, Input, Loading, Page, PageHeader, TextArea, formatError } from "../components/ui";
import { AuthenticatedImage } from "../components/AuthenticatedImage";
import { useApp } from "../lib/AppProvider";
import { isPlanResourceLocked } from "../lib/planCapacity";

type Member = {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  date_of_birth?: string | null;
  status?: string;
  check_in_identifier?: string;
  photo_url?: string | null;
  is_plan_locked?: boolean;
};

type MemberValues = {
  name: string;
  email: string;
  phone: string;
  date_of_birth: string;
  address: string;
  notes: string;
};

const emptyValues: MemberValues = { name: "", email: "", phone: "", date_of_birth: "", address: "", notes: "" };

export function MemberDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { api, authState, t } = useApp();
  const [member, setMember] = useState<Member | null>(null);
  const [values, setValues] = useState<MemberValues>(emptyValues);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [clearPhoto, setClearPhoto] = useState(false);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [planLockedDenied, setPlanLockedDenied] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const canManage = canManageWorkspace(authState.session);

  const load = useCallback(async () => {
    setLoading(true);
    setPlanLockedDenied(false);
    try {
      const value = await api.get<Member>(endpoints.member(id));
      setMember(value);
      setValues(valuesFromMember(value));
    } catch (caught) {
      setMember(null);
      if (isPlanResourceLocked(caught)) setPlanLockedDenied(true);
      else setError(formatError(caught, t("common.error")));
    } finally {
      setLoading(false);
    }
  }, [api, id, t]);

  useEffect(() => {
    if (canViewGlobalMembers(authState.session)) void load();
  }, [authState.session, load]);

  useEffect(() => () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  function update(key: keyof MemberValues, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function resetPhotoSelection() {
    setPhoto(null);
    setPhotoPreview("");
    setClearPhoto(false);
  }

  function beginEditing() {
    if (!member) return;
    setValues(valuesFromMember(member));
    setFields({});
    setError("");
    resetPhotoSelection();
    setEditing(true);
  }

  function cancelEditing() {
    if (member) setValues(valuesFromMember(member));
    setFields({});
    setError("");
    resetPhotoSelection();
    setEditing(false);
  }

  function selectPhoto(file: File | null) {
    if (!file) return;
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
    setClearPhoto(false);
  }

  function removePhoto() {
    setPhoto(null);
    setPhotoPreview("");
    setClearPhoto(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setFields({});
    try {
      const body = new FormData();
      Object.entries(values).forEach(([key, value]) => body.append(key, value.trim()));
      if (photo) body.append("photo", photo);
      if (clearPhoto) body.append("clear_photo", "true");
      const saved = await api.request<Member>(endpoints.member(id), { method: "PATCH", formData: body });
      setMember(saved);
      setValues(valuesFromMember(saved));
      resetPhotoSelection();
      setEditing(false);
    } catch (caught) {
      if (caught instanceof ApiError) setFields(fieldErrorsFromBody(caught.data));
      setError(formatError(caught, t("common.error")));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Page><Loading label={t("members.loading")} /></Page>;
  if (planLockedDenied) return <Page><section className="plan-locked-banner" role="status"><Badge tone="warning">{t("members.planLocked")}</Badge><strong>{t("members.detail.unavailable")}</strong><p>{t("members.detail.lockedMessage")}</p><Button onClick={() => navigate("/people")} variant="secondary">{t("members.detail.back")}</Button></section></Page>;
  if (!member) return <Page><Alert>{error}</Alert></Page>;

  if (editing) {
    return <Page>
      <form className="member-edit-form" onSubmit={save}>
        <section className="card member-edit-profile">
          <MemberPhotoEditor
            busy={busy}
            clearPhoto={clearPhoto}
            error={fields.photo}
            member={member}
            onRemove={removePhoto}
            onSelect={selectPhoto}
            preview={photoPreview}
          />
          <div className="member-edit-name">
            <Field error={fields.name} label={`${t("members.name")} *`}>
              <Input autoFocus onChange={(event) => update("name", event.target.value)} required value={values.name} />
            </Field>
            <span className="member-edit-identifier">#{member.check_in_identifier || member.id}</span>
          </div>
          <div className="member-edit-actions">
            <Badge tone="green">{t("members.active")}</Badge>
            <Button disabled={busy} onClick={cancelEditing} type="button" variant="secondary">{t("common.cancel")}</Button>
            <Button loading={busy} type="submit">{t("members.save")}</Button>
          </div>
        </section>

        <Alert>{error}</Alert>

        <div className="member-edit-sections">
          <Card className="member-edit-section" title={t("members.contactDetails")}>
            <div className="member-edit-contact-grid">
              <Field error={fields.email} label={t("auth.email")}>
                <Input onChange={(event) => update("email", event.target.value)} type="email" value={values.email} />
              </Field>
              <Field error={fields.phone} label={t("members.phone")}>
                <Input onChange={(event) => update("phone", event.target.value)} value={values.phone} />
              </Field>
              <div className="member-edit-address"><Field error={fields.address} label={t("members.address")}>
                <Input onChange={(event) => update("address", event.target.value)} value={values.address} />
              </Field></div>
            </div>
          </Card>
          <Card className="member-edit-section" title={t("members.personal")}>
            <Field error={fields.date_of_birth} label={t("members.birthday")}>
              <Input onChange={(event) => update("date_of_birth", event.target.value)} type="date" value={values.date_of_birth} />
            </Field>
          </Card>
        </div>

        <Card className="member-edit-notes-card" title={t("members.notes")}>
          <Field error={fields.notes} label={t("members.notes")}>
            <TextArea onChange={(event) => update("notes", event.target.value)} value={values.notes} />
          </Field>
        </Card>
      </form>
    </Page>;
  }

  return <Page narrow>
    <PageHeader
      actions={canManage && member.status !== "archived" && !member.is_plan_locked ? <Button onClick={beginEditing} variant="secondary">{t("members.edit")}</Button> : undefined}
      description={member.email || member.phone}
      title={member.name}
    />
    <div className="member-heading">
      <span className="profile-photo">{member.photo_url ? <AuthenticatedImage alt="" src={member.photo_url} /> : null}<span className="avatar-fallback">{member.name.slice(0, 1).toUpperCase()}</span></span>
      <Badge tone={member.status === "archived" ? "neutral" : member.is_plan_locked ? "warning" : "green"}>{member.is_plan_locked ? t("members.planLocked") : member.status === "archived" ? t("members.archivedLabel") : t("members.active")}</Badge>
    </div>
    <Alert>{error}</Alert>
    <Card title={t("members.contactDetails")}>
      <dl className="info-grid">{[[t("auth.email"), member.email], [t("members.phone"), member.phone], [t("members.identifier"), member.check_in_identifier], [t("members.birthday"), member.date_of_birth], [t("members.address"), member.address], [t("members.notes"), member.notes]].map(([label, value]) => <div className="info-item" key={String(label)}><dt>{label}</dt><dd>{value || "—"}</dd></div>)}</dl>
    </Card>
  </Page>;
}

function MemberPhotoEditor({ busy, clearPhoto, error, member, onRemove, onSelect, preview }: {
  busy: boolean;
  clearPhoto: boolean;
  error?: string;
  member: Member;
  onRemove: () => void;
  onSelect: (file: File | null) => void;
  preview: string;
}) {
  const { t } = useApp();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const hasPhoto = Boolean(preview || (member.photo_url && !clearPhoto));

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function openPicker() {
    setOpen(false);
    inputRef.current?.click();
  }

  return <div className={`member-edit-photo${error ? " field-error" : ""}`} ref={rootRef}>
    <button aria-expanded={open} aria-haspopup="menu" aria-label={t("members.editPhoto")} className="member-edit-photo-button" disabled={busy} onClick={() => setOpen((value) => !value)} type="button">
      {preview ? <img alt="" src={preview} /> : member.photo_url && !clearPhoto ? <AuthenticatedImage alt="" src={member.photo_url} /> : <span className="member-create-photo-placeholder" aria-hidden="true">{member.name.slice(0, 1).toUpperCase()}</span>}
      <span aria-hidden="true" className="member-edit-camera"><CameraIcon /></span>
    </button>
    {open ? <div className="member-edit-photo-menu" role="menu">
      <button onClick={openPicker} role="menuitem" type="button">{t("members.changePhoto")}</button>
      <button className="member-edit-photo-remove" disabled={!hasPhoto} onClick={() => { onRemove(); setOpen(false); }} role="menuitem" type="button">{t("members.removePhoto")}</button>
    </div> : null}
    <input accept="image/*" className="member-create-photo-input" onChange={(event) => { onSelect(event.target.files?.[0] || null); event.currentTarget.value = ""; }} ref={inputRef} tabIndex={-1} type="file" />
    {error ? <span className="field-error-text">{error}</span> : null}
  </div>;
}

function valuesFromMember(member: Member): MemberValues {
  return {
    name: member.name || "",
    email: member.email || "",
    phone: member.phone || "",
    date_of_birth: member.date_of_birth || "",
    address: member.address || "",
    notes: member.notes || "",
  };
}

function CameraIcon() {
  return <svg fill="none" height="16" viewBox="0 0 20 20" width="16"><path d="M7.2 4.5h5.6l.9 1.4H16a1.5 1.5 0 0 1 1.5 1.5v7.1A1.5 1.5 0 0 1 16 16H4a1.5 1.5 0 0 1-1.5-1.5V7.4A1.5 1.5 0 0 1 4 5.9h2.3l.9-1.4Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.5"/><circle cx="10" cy="10.6" r="2.4" stroke="currentColor" strokeWidth="1.5"/></svg>;
}

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "./api.js";
import {
  EditableProfilePhoto,
  ErrorBanner,
  Field,
  LoadingState,
  PhotoThumb,
  StatusBadge,
} from "./components.jsx";
import { localizedErrorMessage } from "./i18n/errorMessages.js";
import { usePageTitle } from "./i18n/usePageTitle.js";
import {
  buildMemberFormData,
  displayText,
  emptyMemberValues,
  formatMemberDate,
  formatMemberId,
  valuesFromMember,
} from "./memberForm.js";

function InfoItem({ label, value, empty = false }) {
  return (
    <div className="member-info-item">
      <dt>{label}</dt>
      <dd className={empty ? "member-info-empty" : undefined}>{value}</dd>
    </div>
  );
}

export default function MemberProfileScreen({ session, memberId, onNavigate }) {
  const { t } = useTranslation(["members", "common", "errors"]);
  const [member, setMember] = useState(null);
  const [values, setValues] = useState(emptyMemberValues());
  const [editing, setEditing] = useState(false);
  const [photoPreview, setPhotoPreview] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  usePageTitle("pageTitles.members", { ns: "workspace" });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await api.getMember(session, memberId);
      if (result.data.status === "archived") {
        onNavigate({ name: "members", status: "archived", replace: true });
        return;
      }
      if (result.data.is_plan_locked || result.data.plan_unlocked === false) {
        setMember(result.data);
        setError(t("profile.lockedMessage"));
        setLoading(false);
        return;
      }
      setMember(result.data);
      setValues(valuesFromMember(result.data));
    } catch (loadError) {
      const message = localizedErrorMessage(loadError, t);
      setError(message);
      setMember(null);
      setLoading(false);
      return;
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [memberId]);

  function update(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function startEdit() {
    setValues(valuesFromMember(member));
    setPhotoPreview("");
    setEditing(true);
    setError("");
  }

  function cancelEdit() {
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
    }
    setPhotoPreview("");
    setValues(valuesFromMember(member));
    setEditing(false);
    setError("");
  }

  function handlePhotoChange(file) {
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
    }
    setPhotoPreview(file ? URL.createObjectURL(file) : "");
    setValues((current) => ({
      ...current,
      photo: file,
      clear_photo: false,
    }));
  }

  function removePhoto() {
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
    }
    setPhotoPreview("");
    setValues((current) => ({
      ...current,
      photo: null,
      clear_photo: true,
    }));
  }

  async function handleSave(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const result = await api.updateMember(
        session,
        memberId,
        buildMemberFormData(values, { includeEmptyDate: true }),
      );
      setMember(result.data);
      setValues(valuesFromMember(result.data));
      if (photoPreview) {
        URL.revokeObjectURL(photoPreview);
      }
      setPhotoPreview("");
      setEditing(false);
    } catch (saveError) {
      setError(localizedErrorMessage(saveError, t));
    } finally {
      setSaving(false);
    }
  }

  async function archiveMember() {
    if (!window.confirm(t("confirmArchive", { name: member.name }))) {
      return;
    }
    try {
      await api.archiveMember(session, member.id);
      onNavigate({ name: "members", status: "archived", replace: true });
    } catch (archiveError) {
      setError(localizedErrorMessage(archiveError, t));
    }
  }

  const currentPhotoUrl = values.clear_photo ? null : photoPreview || member?.photo_url || null;
  const displayName = editing ? values.name : member?.name;

  return (
    <div className="page member-profile-page">
      <div className="member-profile-nav">
        <button type="button" className="btn-secondary" onClick={() => onNavigate({ name: "members" })}>
          {t("profile.back")}
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={() => onNavigate({ name: "member-create" })}
        >
          {t("profile.addNewMember")}
        </button>
      </div>

      {loading ? <LoadingState label={t("loadingOne")} /> : null}
      <ErrorBanner message={error} />

      {!loading && error && !member ? (
        <div className="plan-locked-banner" role="status">
          <strong>{t("profile.unavailable")}</strong>
          <p>{error}</p>
          <button type="button" className="btn-secondary" onClick={() => onNavigate({ name: "members" })}>
            {t("profile.backToList")}
          </button>
        </div>
      ) : null}

      {!loading && member ? (
        <form className="member-profile" onSubmit={handleSave}>
          <header className="member-profile-header card-surface">
            {editing ? (
              <EditableProfilePhoto
                url={currentPhotoUrl}
                name={displayName}
                size="xl"
                onSelectFile={handlePhotoChange}
                onRemove={removePhoto}
                disabled={saving}
              />
            ) : (
              <PhotoThumb url={currentPhotoUrl} name={displayName} size="xl" />
            )}
            <div className="member-profile-identity">
              {editing ? (
                <>
                  <Field label={t("fields.name")} hint={t("fields.required")}>
                    <input
                      value={values.name}
                      onChange={(event) => update("name", event.target.value)}
                      required
                    />
                  </Field>
                  <p className="member-profile-kicker">{formatMemberId(member.id)}</p>
                </>
              ) : (
                <>
                  <h2>{member.name}</h2>
                  <p className="member-profile-kicker">{formatMemberId(member.id)}</p>
                </>
              )}
            </div>
            <div className="member-profile-header-actions">
              <StatusBadge status={member.status} />
              {editing ? (
                <>
                  <button type="button" className="btn-secondary" onClick={cancelEdit} disabled={saving}>
                    {t("common:cancel")}
                  </button>
                  <button type="submit" className="btn-primary" disabled={saving}>
                    {saving ? t("profile.saving") : t("common:save")}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="btn-primary" onClick={startEdit}>
                    {t("common:edit")}
                  </button>
                  {member.status === "active" ? (
                    <button type="button" className="btn-ghost btn-sm" onClick={archiveMember}>
                      {t("archive")}
                    </button>
                  ) : null}
                </>
              )}
            </div>
          </header>

          <div className="member-profile-grid">
            <section className="card-surface member-info-card">
              <h3>{t("profile.sections.contact")}</h3>
              {editing ? (
                <div className="member-edit-fields">
                  <Field label={t("fields.email")}>
                    <input
                      type="email"
                      value={values.email}
                      onChange={(event) => update("email", event.target.value)}
                    />
                  </Field>
                  <Field label={t("fields.phone")}>
                    <input
                      value={values.phone}
                      onChange={(event) => update("phone", event.target.value)}
                    />
                  </Field>
                  <Field label={t("fields.address")}>
                    <input
                      value={values.address}
                      onChange={(event) => update("address", event.target.value)}
                      maxLength={500}
                    />
                  </Field>
                </div>
              ) : (
                <dl className="member-info-list">
                  <InfoItem label={t("fields.email")} value={displayText(member.email)} empty={!member.email} />
                  <InfoItem label={t("fields.phone")} value={displayText(member.phone)} empty={!member.phone} />
                  <InfoItem label={t("fields.address")} value={displayText(member.address)} empty={!member.address} />
                </dl>
              )}
            </section>

            <section className="card-surface member-info-card">
              <h3>{t("profile.sections.personal")}</h3>
              {editing ? (
                <div className="member-edit-fields">
                  <Field label={t("fields.dateOfBirth")}>
                    <input
                      type="date"
                      value={values.date_of_birth}
                      onChange={(event) => update("date_of_birth", event.target.value)}
                    />
                  </Field>
                </div>
              ) : (
                <dl className="member-info-list">
                  <InfoItem
                    label={t("fields.dateOfBirth")}
                    value={formatMemberDate(member.date_of_birth)}
                    empty={!member.date_of_birth}
                  />
                </dl>
              )}
            </section>
          </div>

          <section className="card-surface member-info-card member-notes-card">
            <h3>{t("profile.sections.notes")}</h3>
            {editing ? (
              <Field label={t("fields.notes")}>
                <textarea
                  rows="3"
                  value={values.notes}
                  onChange={(event) => update("notes", event.target.value)}
                />
              </Field>
            ) : member.notes ? (
              <p className="member-info-notes">{member.notes}</p>
            ) : (
              <p className="member-info-empty">{t("profile.noNotes")}</p>
            )}
          </section>
        </form>
      ) : null}
    </div>
  );
}

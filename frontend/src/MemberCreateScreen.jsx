import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "./api.js";
import { EditableProfilePhoto, ErrorBanner, Field, PageHeader } from "./components.jsx";
import { localizedErrorMessage } from "./i18n/errorMessages.js";
import { usePageTitle } from "./i18n/usePageTitle.js";
import { buildMemberFormData, emptyMemberValues } from "./memberForm.js";

export default function MemberCreateScreen({ session, onNavigate }) {
  const { t } = useTranslation(["members", "common", "errors"]);
  const [values, setValues] = useState(emptyMemberValues);
  const [photoPreview, setPhotoPreview] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  usePageTitle("pageTitles.members", { ns: "workspace" });

  function update(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function handlePhotoChange(file) {
    update("photo", file);
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
    }
    setPhotoPreview(file ? URL.createObjectURL(file) : "");
  }

  function removePhoto() {
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
    }
    setPhotoPreview("");
    update("photo", null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const result = await api.createMember(session, buildMemberFormData(values));
      onNavigate({ name: "member-profile", memberId: result.data.id });
    } catch (saveError) {
      setError(localizedErrorMessage(saveError, t));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page member-create-page">
      <PageHeader
        title={t("create.title")}
        description={t("create.description")}
        actions={
          <button type="button" className="btn-secondary" onClick={() => onNavigate({ name: "members" })}>
            {t("common:cancel")}
          </button>
        }
      />

      <form
        className="form-card card-surface member-create-form"
        data-tutorial-target="member-create-form"
        onSubmit={handleSubmit}
      >
        <div className="member-create-photo">
          <EditableProfilePhoto
            url={photoPreview || null}
            name={values.name}
            size="xl"
            onSelectFile={handlePhotoChange}
            onRemove={removePhoto}
            disabled={saving}
          />
        </div>

        <div className="form-grid">
          <Field label={t("fields.name")} hint={t("fields.required")}>
            <input
              value={values.name}
              onChange={(event) => update("name", event.target.value)}
              required
              autoFocus
            />
          </Field>
          <Field label={t("fields.email")}>
            <input
              type="email"
              value={values.email}
              onChange={(event) => update("email", event.target.value)}
            />
          </Field>
          <Field label={t("fields.dateOfBirth")}>
            <input
              type="date"
              value={values.date_of_birth}
              onChange={(event) => update("date_of_birth", event.target.value)}
            />
          </Field>
          <Field label={t("fields.phone")}>
            <input
              value={values.phone}
              onChange={(event) => update("phone", event.target.value)}
            />
          </Field>
          <Field label={t("fields.address")} className="member-span-2">
            <input
              value={values.address}
              onChange={(event) => update("address", event.target.value)}
              maxLength={500}
            />
          </Field>
          <Field label={t("fields.notes")} className="member-span-2">
            <textarea
              rows="3"
              value={values.notes}
              onChange={(event) => update("notes", event.target.value)}
            />
          </Field>
        </div>

        <ErrorBanner message={error} />

        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? t("create.creating") : t("create.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}

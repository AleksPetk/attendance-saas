import { useState } from "react";
import { api, errorMessage } from "./api.js";
import { EditableProfilePhoto, ErrorBanner, Field, PageHeader } from "./components.jsx";
import { buildMemberFormData, emptyMemberValues } from "./memberForm.js";

export default function MemberCreateScreen({ session, onNavigate }) {
  const [values, setValues] = useState(emptyMemberValues);
  const [photoPreview, setPhotoPreview] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

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
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page member-create-page">
      <PageHeader
        title="Add Member"
        description="Only name is required. A Member with just a name is valid."
        actions={
          <button type="button" className="btn-secondary" onClick={() => onNavigate({ name: "members" })}>
            Cancel
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
          <Field label="Name" hint="Required">
            <input
              value={values.name}
              onChange={(event) => update("name", event.target.value)}
              required
              autoFocus
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={values.email}
              onChange={(event) => update("email", event.target.value)}
            />
          </Field>
          <Field label="Date of birth">
            <input
              type="date"
              value={values.date_of_birth}
              onChange={(event) => update("date_of_birth", event.target.value)}
            />
          </Field>
          <Field label="Phone">
            <input
              value={values.phone}
              onChange={(event) => update("phone", event.target.value)}
            />
          </Field>
          <Field label="Address" className="member-span-2">
            <input
              value={values.address}
              onChange={(event) => update("address", event.target.value)}
              maxLength={500}
            />
          </Field>
          <Field label="Notes" className="member-span-2">
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
            {saving ? "Creating…" : "Create Member"}
          </button>
        </div>
      </form>
    </div>
  );
}

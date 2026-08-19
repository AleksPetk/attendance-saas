import { useEffect, useState } from "react";
import { api, errorMessage } from "./api.js";
import {
  CodeBadge,
  ErrorBanner,
  Field,
  FormSection,
  LoadingState,
  PageHeader,
  PhotoThumb,
  StatusBadge,
} from "./components.jsx";
import { EmptyState, PersonRow } from "./WorkspaceLayout.jsx";

export default function MembersScreen({ session, onNavigate }) {
  const [statusFilter, setStatusFilter] = useState("active");
  const [search, setSearch] = useState("");
  const [members, setMembers] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ status: statusFilter });
    if (search.trim()) {
      params.set("search", search.trim());
    }
    try {
      const result = await api.listMembers(session, `?${params.toString()}`);
      setMembers(result.data);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [statusFilter]);

  async function archiveMember(member) {
    if (
      !window.confirm(
        `Archive ${member.name}? They will not appear when adding people to Groups.`
      )
    ) {
      return;
    }
    try {
      await api.archiveMember(session, member.id);
      await load();
    } catch (archiveError) {
      setError(errorMessage(archiveError));
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Members"
        description="Reusable people in this workspace. They do not log in."
        actions={
          <button type="button" className="btn-primary" onClick={() => onNavigate({ name: "member-editor" })}>
            Add Member
          </button>
        }
      />

      <div className="toolbar card-surface">
        <input
          className="search-input"
          placeholder="Search name, email, code, or identifier"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              load();
            }
          }}
        />
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
        <button type="button" className="btn-secondary" onClick={load}>
          Search
        </button>
      </div>

      <ErrorBanner message={error} />

      {loading ? <LoadingState label="Loading Members…" /> : null}

      {!loading && members.length === 0 ? (
        <EmptyState
          title="No Members yet"
          body="Add a reusable person with just a name, then attach them to Groups when needed."
          action={
            <button type="button" className="btn-primary" onClick={() => onNavigate({ name: "member-editor" })}>
              Add Member
            </button>
          }
        />
      ) : null}

      {!loading && members.length > 0 ? (
        <div className="list">
          {members.map((member) => (
            <PersonRow
              key={member.id}
              person={member}
              status={member.status}
              subtitle={
                <>
                  <CodeBadge>{member.internal_code}</CodeBadge>
                  {member.email ? <span>{member.email}</span> : null}
                  {member.check_in_identifier ? <span>{member.check_in_identifier}</span> : null}
                </>
              }
              onOpen={() => onNavigate({ name: "member-editor", memberId: member.id })}
              actions={
                member.status === "active" ? (
                  <button
                    type="button"
                    className="btn-danger-soft"
                    onClick={(event) => {
                      event.stopPropagation();
                      archiveMember(member);
                    }}
                  >
                    Archive
                  </button>
                ) : (
                  <StatusBadge status="archived" />
                )
              }
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function MemberEditorScreen({ session, memberId, onNavigate }) {
  const isEdit = Boolean(memberId);
  const [values, setValues] = useState({
    name: "",
    email: "",
    phone: "",
    date_of_birth: "",
    check_in_identifier: "",
    notes: "",
    pin: "",
    photo: null,
    clear_photo: false,
  });
  const [existing, setExisting] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!memberId) {
      return;
    }
    api
      .getMember(session, memberId)
      .then((result) => {
        setExisting(result.data);
        setValues((current) => ({
          ...current,
          name: result.data.name || "",
          email: result.data.email || "",
          phone: result.data.phone || "",
          date_of_birth: result.data.date_of_birth || "",
          check_in_identifier: result.data.check_in_identifier || "",
          notes: result.data.notes || "",
        }));
      })
      .catch((loadError) => setError(errorMessage(loadError)));
  }, [memberId]);

  function update(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const data = new FormData();
    data.append("name", values.name);
    data.append("email", values.email);
    data.append("phone", values.phone);
    data.append("check_in_identifier", values.check_in_identifier);
    data.append("notes", values.notes);
    if (values.date_of_birth) {
      data.append("date_of_birth", values.date_of_birth);
    }
    if (values.pin) {
      data.append("pin", values.pin);
    }
    if (values.photo) {
      data.append("photo", values.photo);
    }
    if (values.clear_photo) {
      data.append("clear_photo", "true");
    }
    try {
      if (isEdit) {
        await api.updateMember(session, memberId, data);
      } else {
        await api.createMember(session, data);
      }
      onNavigate({ name: "members" });
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <PageHeader
        title={isEdit ? "Edit Member" : "Add Member"}
        description="Only name is required. Other fields stay optional unless a Group needs them."
        actions={
          <button type="button" className="btn-secondary" onClick={() => onNavigate({ name: "members" })}>
            Back
          </button>
        }
      />

      {existing ? (
        <div className="meta-banner card-surface">
          <PhotoThumb url={existing.photo_url} name={existing.name} size="lg" />
          <div>
            <p className="meta-banner-label">Internal Member code</p>
            <CodeBadge>{existing.internal_code}</CodeBadge>
          </div>
        </div>
      ) : null}

      <form className="form-card card-surface" onSubmit={handleSubmit}>
        <FormSection title="Basic information">
          <Field label="Name">
            <input
              value={values.name}
              onChange={(event) => update("name", event.target.value)}
              required
            />
          </Field>
        </FormSection>

        <FormSection title="Contact and identifiers" description="All optional.">
          <div className="form-grid">
            <Field label="Email">
              <input
                type="email"
                value={values.email}
                onChange={(event) => update("email", event.target.value)}
              />
            </Field>
            <Field label="Phone">
              <input value={values.phone} onChange={(event) => update("phone", event.target.value)} />
            </Field>
            <Field label="Date of birth">
              <input
                type="date"
                value={values.date_of_birth}
                onChange={(event) => update("date_of_birth", event.target.value)}
              />
            </Field>
            <Field label="Member identifier" hint="Customer-facing ID, e.g. STUDENT-123">
              <input
                value={values.check_in_identifier}
                onChange={(event) => update("check_in_identifier", event.target.value)}
              />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Photo and security">
          <Field label="Photo">
            {existing?.photo_url && !values.clear_photo ? (
              <div className="photo-preview">
                <PhotoThumb url={existing.photo_url} name={existing.name} size="lg" />
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => update("clear_photo", true)}
                >
                  Remove photo
                </button>
              </div>
            ) : null}
            <input
              type="file"
              accept="image/*"
              className="file-input"
              onChange={(event) => update("photo", event.target.files[0] || null)}
            />
          </Field>
          <Field label="PIN" hint="Stored hashed. Never shown again after save.">
            <input
              type="password"
              autoComplete="new-password"
              value={values.pin}
              onChange={(event) => update("pin", event.target.value)}
              placeholder={existing?.has_pin ? "Enter a new PIN to replace the current one" : ""}
            />
          </Field>
        </FormSection>

        <FormSection title="Notes">
          <Field label="Notes">
            <textarea
              rows="4"
              value={values.notes}
              onChange={(event) => update("notes", event.target.value)}
            />
          </Field>
        </FormSection>

        <ErrorBanner message={error} />

        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save Member" : "Create Member"}
          </button>
        </div>
      </form>
    </div>
  );
}

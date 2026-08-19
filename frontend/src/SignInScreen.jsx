import { useState } from "react";
import { api, errorMessage } from "./api.js";
import { ErrorBanner, Field, PasswordInput } from "./components.jsx";

const ACCOUNT_TYPES = [
  {
    id: "owner",
    title: "Paying owner",
    description: "Manage Members and Groups with your platform email.",
  },
  {
    id: "workspace_staff",
    title: "Workspace staff",
    description: "Sign in with Workspace ID, username, and password.",
  },
  {
    id: "platform_operator",
    title: "Platform operator",
    description: "Verify platform admin access with your email.",
  },
];

export default function SignInScreen({ onSignedIn }) {
  const [accountKind, setAccountKind] = useState("owner");
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const isStaff = accountKind === "workspace_staff";

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const auth = {
      accountKind,
      identity: identity.trim(),
      password,
      workspaceId: workspaceId.trim(),
    };
    try {
      const result = await api.loadWorkspace(auth);
      onSignedIn({ ...auth, workspace: result.data });
    } catch (loadError) {
      if (loadError.status === 401 || loadError.status === 403) {
        setError("Could not authenticate that account.");
      } else if (loadError.status === 404) {
        setError("This paying User does not own an active workspace.");
      } else {
        setError(errorMessage(loadError));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <header className="auth-header">
          <p className="eyebrow">Local workspace</p>
          <h1>Sign in</h1>
          <p className="auth-lead">
            Temporary local verification. Registration is not built yet.
          </p>
        </header>

        <form className="auth-form" onSubmit={handleSubmit}>
          <fieldset className="account-type-fieldset">
            <legend className="fieldset-label">Account type</legend>
            <div className="account-type-grid">
              {ACCOUNT_TYPES.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  className={`account-type-card ${accountKind === type.id ? "selected" : ""}`}
                  aria-pressed={accountKind === type.id}
                  onClick={() => setAccountKind(type.id)}
                >
                  <span className="account-type-title">{type.title}</span>
                  <span className="account-type-description">{type.description}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="auth-fields">
            {isStaff ? (
              <Field label="Workspace ID">
                <input
                  value={workspaceId}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck="false"
                  placeholder="e.g. ABC123"
                  onChange={(event) => setWorkspaceId(event.target.value)}
                  required
                />
              </Field>
            ) : null}
            <Field label={isStaff ? "Username" : "Email"}>
              <input
                type={isStaff ? "text" : "email"}
                autoComplete="username"
                value={identity}
                placeholder={isStaff ? "Workspace username" : "you@example.com"}
                onChange={(event) => setIdentity(event.target.value)}
                required
              />
            </Field>
            <Field label="Password">
              <PasswordInput
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </Field>
          </div>

          <ErrorBanner message={error} />

          <button type="submit" className="btn-primary btn-block" disabled={loading}>
            {loading ? "Signing in…" : "Open workspace"}
          </button>

          <p className="auth-footnote">
            Members and Groups management is owner-only in this slice.
          </p>
        </form>
      </div>
    </main>
  );
}

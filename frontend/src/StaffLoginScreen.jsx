import { useState } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "./api.js";
import { AuthLayout, ErrorBanner, Field, PasswordInput } from "./components.jsx";

export default function StaffLoginScreen({ onSignedIn }) {
  const [workspaceId, setWorkspaceId] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      await api.csrf();
      const result = await api.loginStaff({
        workspace_id: workspaceId,
        username,
        password,
      });
      onSignedIn({ workspace: result.data });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      variant="staff"
      title="Staff login"
      lead="Sign in with the Workspace ID, username, and password provided by your workspace owner."
      footnote={
        <p>
          Workspace owner? <Link to="/login">Customer login</Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="auth-form">
        <div className="auth-fields">
          <Field
            label="Workspace ID"
            hint="Provided by your workspace owner. Not your email or company name."
          >
            <input
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              autoCapitalize="characters"
              spellCheck={false}
              required
            />
          </Field>
          <Field label="Username">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
            />
          </Field>
          <Field label="Password">
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </Field>
        </div>
        <ErrorBanner message={error} />
        <button type="submit" className="btn-primary btn-block" disabled={loading}>
          {loading ? "Signing in…" : "Enter workspace"}
        </button>
      </form>
    </AuthLayout>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "./api.js";
import { AuthLayout, ErrorBanner, Field, SuccessBanner } from "./components.jsx";

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await api.csrf();
      const result = await api.forgotPassword({ email });
      setMessage(result.data.detail);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Forgot password"
      lead="Enter the email for your Check Station owner account. If an account exists, we will send a reset link."
      footnote={
        <p>
          Remembered it? <Link to="/login">Back to login</Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="auth-form">
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </Field>
        <SuccessBanner message={message} />
        <ErrorBanner message={error} />
        <button type="submit" className="btn-primary btn-block" disabled={loading}>
          {loading ? "Sending…" : "Send reset link"}
        </button>
      </form>
    </AuthLayout>
  );
}

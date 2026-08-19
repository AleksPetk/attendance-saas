import { useEffect } from "react";
import PublicPageShell from "./PublicPageShell.jsx";

export default function PublicRegisterScreen() {
  useEffect(() => {
    document.title = "Register — Attendance SaaS";
  }, []);

  return (
    <PublicPageShell>
      <section className="public-section">
        <h1>Register</h1>
        <p className="public-lead">
          Registration UI is a next iteration in this slice. For now, use the temporary sign-in page to test the full journey.
        </p>
      </section>
    </PublicPageShell>
  );
}


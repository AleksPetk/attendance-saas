import { useEffect } from "react";
import { Link } from "react-router-dom";
import PublicPageShell from "./PublicPageShell.jsx";

const STEPS = [
  {
    title: "Create account",
    body: "Register with your email and password. No workspace name needed — it's created automatically.",
  },
  {
    title: "Workspace created automatically",
    body: "Your isolated workspace is ready immediately. You become the owner with full access.",
  },
  {
    title: "Add Members",
    body: "Add the people you want to track. Only a name is required; email, phone, address, photo, date of birth, and notes are optional.",
  },
  {
    title: "Create and configure Groups",
    body: "Set up check-in/check-out/break actions, member requirements, kiosk settings, and notifications.",
  },
  {
    title: "Launch kiosk",
    body: "Open the Group kiosk on a tablet or shared device. Participants check in without seeing the admin workspace.",
  },
  {
    title: "Review activity and history",
    body: "Every action is recorded. Filter history by Group, action type, person, or date to review attendance.",
  },
];

export default function PublicHowItWorksScreen() {
  useEffect(() => {
    document.title = "How it works — Check Station";
    const ensure = (name, content) => {
      let el = document.querySelector(`meta[name="${name}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("name", name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };
    ensure(
      "description",
      "Customer journey: register, add Members, create Groups, configure kiosk behavior, and review history."
    );
  }, []);

  return (
    <PublicPageShell>
      <section className="public-section">
        <h1>How it works</h1>
        <p className="public-lead">
          From account creation to your first check-in — a connected workflow designed for flexibility.
        </p>
      </section>

      <section className="public-section public-section-muted">
        <h2>Your journey</h2>
        <div className="journey-steps">
          {STEPS.map((step, index) => (
            <div key={step.title} className="journey-step">
              <span className="journey-step-num">{index + 1}</span>
              <div className="journey-step-copy">
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="public-section">
        <h2>Kiosk flexibility</h2>
        <div className="public-grid">
          <div className="public-card">
            <h3>Group-owned kiosk</h3>
            <p>Each Group has its own kiosk configuration and participant experience — separate from the admin workspace.</p>
          </div>
          <div className="public-card">
            <h3>Configurable actions</h3>
            <p>Choose which actions are allowed per Group so check-in matches your real workflow.</p>
          </div>
          <div className="public-card">
            <h3>Two kiosk modes</h3>
            <p>Member list mode for tap-to-select, or input mode for name/email/identifier entry.</p>
          </div>
        </div>
      </section>

      <section className="public-cta-banner">
        <h2>Start your journey</h2>
        <p>Your workspace is created automatically when you register.</p>
        <Link className="btn-primary" to="/register">
          Create account
        </Link>
      </section>
    </PublicPageShell>
  );
}

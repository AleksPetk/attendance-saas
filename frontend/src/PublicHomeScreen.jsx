import { useEffect } from "react";
import { Link } from "react-router-dom";
import PublicPageShell from "./PublicPageShell.jsx";
import { ConnectionVisual } from "./components.jsx";

function PageTitle({ title, description }) {
  useEffect(() => {
    document.title = title;
    const ensure = (name, content) => {
      let el = document.querySelector(`meta[name="${name}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("name", name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };
    ensure("description", description);

    const ensureProp = (property, content) => {
      let el = document.querySelector(`meta[property="${property}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("property", property);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };
    ensureProp("og:title", title);
    ensureProp("og:description", description);
    ensureProp("og:type", "website");
  }, [title, description]);
  return null;
}

export default function PublicHomeScreen() {
  return (
    <PublicPageShell>
      <PageTitle
        title="Check Station — Configurable check-in for your workspace"
        description="Set up Members and Groups, launch kiosks, and review history — tailored for any organization."
      />

      <section className="public-hero">
        <div className="public-hero-copy">
          <p className="public-hero-eyebrow">Connected check-in system</p>
          <h1 className="public-hero-title">
            Attendance workflows that match your real-world setup.
          </h1>
          <p className="public-hero-lead">
            Create Members, organize them into Groups, configure kiosks for check-in, check-out, and
            breaks — then review every action in history. One workspace, fully configurable.
          </p>
          <div className="public-hero-cta">
            <Link className="btn-primary" to="/register">
              Get started free
            </Link>
            <Link className="btn-secondary" to="/features">
              Explore features
            </Link>
          </div>
          <div className="public-hero-highlights" aria-label="Key capabilities">
            <span className="public-pill">Members</span>
            <span className="public-pill">Groups</span>
            <span className="public-pill">Kiosk flows</span>
            <span className="public-pill">History</span>
          </div>
        </div>
        <div className="public-hero-visual">
          <ConnectionVisual />
        </div>
      </section>

      <section className="public-section">
        <h2>Why Check Station</h2>
        <div className="public-grid">
          <div className="public-card">
            <div className="public-card-icon">⚙</div>
            <h3>Configure check-in behavior</h3>
            <p>Set identification requirements and allowed actions per Group, then launch dedicated kiosks.</p>
          </div>
          <div className="public-card">
            <div className="public-card-icon">◉</div>
            <h3>Track Members and Groups</h3>
            <p>Attach reusable Members to Groups with optional overrides — history stays intact.</p>
          </div>
          <div className="public-card">
            <div className="public-card-icon">↻</div>
            <h3>Review complete history</h3>
            <p>Every kiosk action creates a record you can filter, search, and audit over time.</p>
          </div>
        </div>
      </section>

      <section className="public-section">
        <h2>Built for real setups</h2>
        <div className="public-grid public-grid-2">
          <div className="public-card">
            <h3>Schools & classes</h3>
            <p>Students check in through kiosk flows; staff manage Members, Groups, and history.</p>
          </div>
          <div className="public-card">
            <h3>Staff time & presence</h3>
            <p>Quick kiosk identification and action recording for employee attendance workflows.</p>
          </div>
          <div className="public-card">
            <h3>Clubs & communities</h3>
            <p>Organize recurring Groups and run participant-friendly check-in.</p>
          </div>
          <div className="public-card">
            <h3>Any organization</h3>
            <p>Industry-agnostic and configurable — your workspace, your rules.</p>
          </div>
        </div>
      </section>

      <section className="public-section public-section-muted">
        <h2>How it works</h2>
        <div className="journey-steps">
          {[
            { title: "Create account", body: "Register with email — your workspace is created automatically." },
            { title: "Add Members", body: "Add the people you want to track across your organization." },
            { title: "Create Groups", body: "Configure check-in, check-out, breaks, and requirements per Group." },
            { title: "Launch kiosk", body: "Each Group gets its own participant-facing kiosk experience." },
          ].map((step, index) => (
            <div key={step.title} className="journey-step">
              <span className="journey-step-num">{index + 1}</span>
              <div className="journey-step-copy">
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="public-cta-row">
          <Link className="btn-secondary" to="/how-it-works">
            See full journey
          </Link>
        </div>
      </section>

      <section className="public-section">
        <h2>Group-owned kiosks</h2>
        <p className="public-lead">
          Each Group owns its kiosk configuration — different check-in experiences for different
          contexts, without exposing the admin workspace to participants.
        </p>
      </section>

      <section className="public-cta-banner">
        <h2>Ready to configure your first check-in?</h2>
        <p>Create an account and your workspace will be ready in seconds.</p>
        <Link className="btn-primary" to="/register">
          Create your workspace
        </Link>
      </section>
    </PublicPageShell>
  );
}

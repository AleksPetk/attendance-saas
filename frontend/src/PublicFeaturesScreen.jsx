import { useEffect } from "react";
import { Link } from "react-router-dom";
import PublicPageShell from "./PublicPageShell.jsx";
import { Badge } from "./components.jsx";

function PageTitle({ title, description }) {
  useEffect(() => {
    document.title = title;
    let el = document.querySelector('meta[name="description"]');
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute("name", "description");
      document.head.appendChild(el);
    }
    el.setAttribute("content", description);
  }, [title, description]);
  return null;
}

const CORE_FEATURES = [
  {
    icon: "👤",
    title: "Members",
    body: "Create reusable profiles for people you track. Members don't log in — they're managed by workspace staff.",
  },
  {
    icon: "◈",
    title: "Groups",
    body: "Long-lived participation contexts with configurable check-in, check-out, break rules, and requirements.",
  },
  {
    icon: "▣",
    title: "Configurable kiosk",
    body: "Launch a dedicated kiosk per Group — member list or input mode, themes, messages, and display options.",
  },
  {
    icon: "↔",
    title: "Check-in / out / breaks",
    body: "Enable the actions each Group needs. Break limits, PIN requirements, and identification fields are all configurable.",
  },
  {
    icon: "↻",
    title: "History",
    body: "View action records created by kiosk operations. Filter by Group, action type, person, or day.",
  },
  {
    icon: "🔑",
    title: "Staff access",
    body: "Owners create workspace staff accounts. Staff sign in with Workspace ID, username, and password.",
  },
];

const COMING_SOON = [
  {
    title: "Events",
    body: "Temporary one-time participation contexts for conferences, classes, or single-day check-in.",
    badge: "Planned",
  },
  {
    title: "Advanced notifications",
    body: "Email delivery for check-in, check-out, and break events with custom templates.",
    badge: "Planned",
  },
];

export default function PublicFeaturesScreen() {
  return (
    <PublicPageShell>
      <PageTitle
        title="Features — Check Station"
        description="Members, Groups, kiosk flows, history, and staff access — plus what's coming next."
      />

      <section className="public-section">
        <h1>Features</h1>
        <p className="public-lead">
          The core workspace includes everything you need to configure check-in for your organization.
          All data is scoped per workspace for strict isolation.
        </p>
      </section>

      <section className="public-section">
        <h2>Available now</h2>
        <div className="public-grid public-grid-2">
          {CORE_FEATURES.map((feature) => (
            <div key={feature.title} className="public-card">
              <div className="public-card-icon">{feature.icon}</div>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="public-section public-section-muted">
        <h2>On the roadmap</h2>
        <p className="public-lead">These areas are planned but not yet available in the current product.</p>
        <div className="public-grid">
          {COMING_SOON.map((item) => (
            <div key={item.title} className="public-card public-card-muted">
              <h3>
                {item.title}{" "}
                <Badge variant="default">{item.badge}</Badge>
              </h3>
              <p>{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="public-section">
        <div className="public-cta-row">
          <Link className="btn-primary" to="/register">
            Start with core features
          </Link>
          <Link className="btn-secondary" to="/how-it-works">
            See how it works
          </Link>
        </div>
      </section>
    </PublicPageShell>
  );
}

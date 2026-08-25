import { useEffect } from "react";
import { Link } from "react-router-dom";
import PublicPageShell from "./PublicPageShell.jsx";
import { ConnectionVisual } from "./components.jsx";
import {
  homeRealSetupsImage,
  homeWorkflowImage,
} from "./assets/home/homeImages.js";

function HomeImageSlot({ slotClass, image }) {
  return (
    <figure className={`home-image-slot home-image-slot-filled ${slotClass}`.trim()}>
      <picture>
        <source type="image/avif" srcSet={image.avifSrcSet} sizes={image.sizes} />
        <source type="image/webp" srcSet={image.webpSrcSet} sizes={image.sizes} />
        <img
          src={image.fallbackSrc}
          srcSet={image.jpgSrcSet}
          sizes={image.sizes}
          alt={image.alt}
          width={image.width}
          height={image.height}
          loading="lazy"
          decoding="async"
          style={{ objectPosition: image.objectPosition }}
        />
      </picture>
    </figure>
  );
}

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

const WHY_CAPABILITIES = [
  {
    label: "Configure",
    title: "Configure check-in behavior",
    body: "Set identification requirements and allowed actions per Group, then launch dedicated kiosks.",
  },
  {
    label: "Organize",
    title: "Track Members and Groups",
    body: "Attach reusable Members to Groups with optional overrides — history stays intact.",
  },
  {
    label: "Audit",
    title: "Review complete history",
    body: "Every kiosk action creates a record you can filter, search, and audit over time.",
  },
];

const USE_CASES = [
  {
    label: "Education",
    title: "Schools & classes",
    body: "Students check in through kiosk flows; staff manage Members, Groups, and history.",
  },
  {
    label: "Workplace",
    title: "Staff time & presence",
    body: "Quick kiosk identification and action recording for employee attendance workflows.",
  },
  {
    label: "Community",
    title: "Clubs & communities",
    body: "Organize recurring Groups and run participant-friendly check-in.",
  },
  {
    label: "Any org",
    title: "Any organization",
    body: "Industry-agnostic and configurable — your workspace, your rules.",
  },
];

const FLOW_STEPS = [
  {
    num: "01",
    title: "Create your workspace",
    body: "Account registration creates your workspace.",
  },
  {
    num: "02",
    title: "Add people",
    body: "Create reusable Members or use Group-only participants where appropriate.",
  },
  {
    num: "03",
    title: "Build Groups",
    body: "Choose actions, requirements, participants, and workflow behavior.",
  },
  {
    num: "04",
    title: "Launch the kiosk",
    body: "Run the configured kiosk on the device you need.",
  },
  {
    num: "05",
    title: "Every action is recorded",
    body: "Check-ins, check-outs, and breaks become history/report data.",
  },
];

const DIFFERENTIATORS = [
  "Group-specific check-in behavior",
  "Reusable Members + flexible participants",
  "Custom kiosk experiences",
  "Complete action history and reporting",
];

export default function PublicHomeScreen() {
  return (
    <PublicPageShell>
      <div className="public-home">
        <PageTitle
          title="Check Station — Configurable check-in for your workspace"
          description="Set up Members and Groups, launch kiosks, and review history — tailored for any organization."
        />

        <section className="public-home-hero-band">
          <div className="public-home-hero-inner">
            <div className="public-home-hero-copy">
              <p className="public-home-brand">Check Station</p>
              <h1 className="public-home-headline">
                Attendance workflows that match your real-world setup.
              </h1>
              <p className="public-home-lead">
                Create Members, organize Groups, configure kiosks for check-in, check-out, and
                breaks — then review every action in history.
              </p>
              <div className="public-home-actions">
                <Link className="btn-primary public-home-btn-primary" to="/register">
                  Get started free
                </Link>
                <Link className="btn-secondary public-home-btn-secondary" to="/features">
                  Explore features
                </Link>
              </div>
            </div>
            <div className="public-home-hero-visual" aria-hidden="true">
              <ConnectionVisual />
            </div>
          </div>
        </section>

        <section className="public-section public-section-why public-home-why">
          <header className="public-section-header">
            <p className="public-section-eyebrow">Platform</p>
            <h2>Why Check Station</h2>
            <p className="public-section-lead">
              Configure once, run reliably — from identification to lasting history.
            </p>
          </header>
          <div className="public-home-why-layout">
            <HomeImageSlot
              slotClass="home-image-slot-workflow"
              image={homeWorkflowImage}
            />
            <div className="public-home-why-capabilities">
              {WHY_CAPABILITIES.map((item) => (
                <article key={item.title} className="public-home-capability">
                  <span className="public-home-capability-marker" aria-hidden="true" />
                  <div className="public-home-capability-copy">
                    <p className="public-home-capability-label">{item.label}</p>
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="public-section public-section-setups public-home-setups">
          <header className="public-section-header">
            <p className="public-section-eyebrow">Use cases</p>
            <h2>Built for real setups</h2>
            <p className="public-section-lead">
              One platform for schools, workplaces, clubs, and any organization that needs reliable check-in.
            </p>
          </header>
          <div className="public-home-setups-layout">
            <HomeImageSlot
              slotClass="home-image-slot-setups"
              image={homeRealSetupsImage}
            />
            <ul className="public-home-usecases">
              {USE_CASES.map((item) => (
                <li key={item.title} className="public-home-usecase">
                  <span className="public-home-usecase-label">{item.label}</span>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="public-section public-home-journey">
          <header className="public-section-header">
            <p className="public-section-eyebrow">Getting started</p>
            <h2>How it works</h2>
            <p className="public-section-lead">
              From workspace creation to recorded actions — one connected Check Station flow.
            </p>
          </header>
          <ol className="public-home-flow">
            {FLOW_STEPS.map((step, index) => (
              <li key={step.num} className="public-home-flow-step">
                <div className="public-home-flow-rail" aria-hidden="true">
                  <span className="public-home-flow-node">{step.num}</span>
                  {index < FLOW_STEPS.length - 1 ? (
                    <span className="public-home-flow-line" />
                  ) : null}
                </div>
                <div className="public-home-flow-copy">
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="public-cta-row">
            <Link className="btn-secondary" to="/how-it-works">
              See full journey
            </Link>
          </div>
        </section>

        <section className="public-section public-home-diff">
          <div className="public-home-diff-inner">
            <header className="public-home-diff-header">
              <p className="public-section-eyebrow public-section-eyebrow-on-dark">Difference</p>
              <h2>Built around your workflow</h2>
            </header>
            <ul className="public-home-diff-list">
              {DIFFERENTIATORS.map((item) => (
                <li key={item} className="public-home-diff-item">
                  <span className="public-home-diff-dot" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="public-section public-home-kiosk">
          <div className="public-home-kiosk-inner">
            <p className="public-section-eyebrow public-section-eyebrow-on-dark">Kiosk model</p>
            <h2>Group-owned kiosks</h2>
            <p className="public-lead">
              Each Group owns its kiosk configuration — different check-in experiences for different
              contexts, without exposing the admin workspace to participants.
            </p>
          </div>
        </section>

        <section className="public-cta-banner public-home-cta">
          <h2>Ready to configure your first check-in?</h2>
          <p>Create an account and your workspace will be ready in seconds.</p>
          <Link className="btn-primary" to="/register">
            Create your workspace
          </Link>
        </section>
      </div>
    </PublicPageShell>
  );
}

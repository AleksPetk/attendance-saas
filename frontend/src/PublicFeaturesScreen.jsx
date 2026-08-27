import { useEffect } from "react";
import { Link } from "react-router-dom";
import PublicPageShell from "./PublicPageShell.jsx";
import ProductImageSlot from "./ProductImageSlot.jsx";

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
    ensure("og:title", title);
    ensure("og:description", description);
    ensure("og:type", "website");
  }, [title, description]);
  return null;
}

const FEATURE_STORIES = [
  {
    eyebrow: "Organize once",
    title: "Keep every person and Group in one clear place.",
    body: "Create reusable Member profiles, then organize them into the Groups that reflect how your organization actually works. Add flexible Group-only participants when a reusable profile is not needed.",
    points: ["Reusable Member profiles", "Long-lived Groups", "Optional profile details and notes"],
    label: "Members and Groups workspace",
    caption: "A future screenshot will show the Members and Groups workspace here.",
  },
  {
    eyebrow: "Make it yours",
    title: "Build a check-in flow that fits the room.",
    body: "Every Group gets its own kiosk experience. Choose how people identify themselves, which actions they can take, and how the kiosk looks and speaks to participants.",
    points: ["Member list or input mode", "Themes, messages, and display options", "A dedicated kiosk per Group"],
    label: "Configurable Group kiosk",
    caption: "A future screenshot will show kiosk configuration and presentation options here.",
  },
  {
    eyebrow: "Capture the moment",
    title: "Record the actions that matter — automatically.",
    body: "Turn a quick participant interaction into dependable history. Enable the actions each Group needs, from check-in and check-out to breaks, then review the record whenever you need it.",
    points: ["Check-in, check-out, and break actions", "PIN and identification requirements", "Filter by Group, person, action, or date"],
    label: "Activity history and actions",
    caption: "A future screenshot will show recorded actions and history filters here.",
  },
];

const INCLUDED_FEATURES = [
  ["Members", "Reusable profiles for the people you track."],
  ["Groups", "Long-lived contexts for teams, classes, clubs, and more."],
  ["Group-owned kiosks", "A separate participant experience for each Group."],
  ["Flexible identification", "Use the identification fields your workflow needs."],
  ["Configurable actions", "Enable check-in, check-out, breaks, and other actions per Group."],
  ["Kiosk presentation", "Themes, messages, display options, and participant-friendly flows."],
  ["History and reporting", "Review action records by person, Group, type, or day."],
  ["Staff access", "Let workspace staff manage operations with their own sign-in."],
  ["Workspace isolation", "Keep each organization’s data scoped to its own workspace."],
];

const PLATFORMS = ["Browser", "iPhone & iPad", "Android phone & tablet", "Mac", "Windows"];

function CheckIcon() {
  return <span className="features-check" aria-hidden="true">✓</span>;
}

function PlatformIcon({ name }) {
  const symbols = { Browser: "◎", "iPhone & iPad": "▯", "Android phone & tablet": "▱", Mac: "⌘", Windows: "⊞" };
  return <span className="features-platform-icon" aria-hidden="true">{symbols[name]}</span>;
}

export default function PublicFeaturesScreen() {
  useEffect(() => {
    const page = document.querySelector(".features-page");
    if (!page) return undefined;
    const revealItems = [...page.querySelectorAll("[data-reveal]")];
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || !("IntersectionObserver" in window)) {
      revealItems.forEach((item) => item.classList.add("is-visible"));
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }),
      { threshold: 0.14 }
    );
    revealItems.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);

  return (
    <PublicPageShell>
      <div className="features-page">
        <PageTitle title="Features — Check Station" description="Configure check-in your way, run participant-friendly kiosks, and keep a dependable record of every action." />

        <section className="features-hero" data-reveal>
          <div className="features-hero-copy">
            <p className="features-kicker">A clearer way to manage attendance</p>
            <h1>Check-in that works the way your organization works.</h1>
            <p className="features-hero-lead">Check Station brings people, Groups, kiosk flows, and activity history together in one calm, configurable workspace — so your team can spend less time managing attendance and more time doing the work.</p>
            <div className="features-actions">
              <Link className="btn-primary features-primary-button" to="/pricing">Check out pricing <span aria-hidden="true">→</span></Link>
              <Link className="btn-secondary features-secondary-button" to="/how-it-works">See how it works</Link>
            </div>
            <div className="features-proof-row" aria-label="Key benefits">
              <span><CheckIcon /> No hardware to install</span>
              <span><CheckIcon /> Configurable by Group</span>
              <span><CheckIcon /> Built for everyday use</span>
            </div>
          </div>
          <div className="features-hero-orbit" aria-hidden="true">
            <div className="features-orbit-glow" />
            <div className="features-orbit-card features-orbit-card-main">
              <span className="features-orbit-card-top"><span className="features-status-dot" /> Check Station</span>
              <span className="features-orbit-card-title">One workspace.<br /><em>Every action in sync.</em></span>
              <span className="features-orbit-bars"><i /><i /><i /><i /></span>
            </div>
            <div className="features-orbit-card features-orbit-card-small features-orbit-members"><b>24</b><span>Members</span></div>
            <div className="features-orbit-card features-orbit-card-small features-orbit-history"><b>✓</b><span>History captured</span></div>
            <span className="features-orbit-ring features-orbit-ring-one" />
            <span className="features-orbit-ring features-orbit-ring-two" />
          </div>
        </section>

        <section className="features-showcase" data-reveal>
          <div className="features-section-heading"><p className="features-kicker">See the whole picture</p><h2>Everything your check-in flow needs, without the busywork.</h2><p>Set up the experience once. Then give participants a simple way to take action and your team a reliable way to understand what happened.</p></div>
          <ProductImageSlot label="Check Station workspace overview" caption="Image placeholder — add an original Check Station screenshot here later." aspect="16 / 8" className="features-showcase-image" />
        </section>

        <section className="features-stories" aria-label="Check Station capabilities">
          {FEATURE_STORIES.map((story, index) => (
            <article className={`features-story features-story-${index % 2 ? "reverse" : "normal"}`} data-reveal key={story.title}>
              <ProductImageSlot label={story.label} caption={story.caption} aspect="4 / 3" className="features-story-image" />
              <div className="features-story-copy"><p className="features-kicker">{story.eyebrow}</p><h2>{story.title}</h2><p className="features-story-body">{story.body}</p><ul className="features-point-list">{story.points.map((point) => <li key={point}><CheckIcon />{point}</li>)}</ul></div>
            </article>
          ))}
        </section>

        <section className="features-platform" data-reveal>
          <div className="features-platform-copy"><p className="features-kicker">Ready wherever work happens</p><h2>One check-in experience across every screen.</h2><p>Check Station is designed for the browser, iPhone and iPad, Android phones and tablets, Mac, and Windows. Use the device that fits the space — at the front desk, in a classroom, or at a shared kiosk.</p><Link className="features-text-link" to="/how-it-works">Explore the workflow <span aria-hidden="true">→</span></Link></div>
          <div className="features-platform-list">{PLATFORMS.map((platform) => <div className="features-platform-item" key={platform}><PlatformIcon name={platform} /><span>{platform}</span><span className="features-platform-arrow" aria-hidden="true">↗</span></div>)}</div>
        </section>

        <section className="features-included" data-reveal>
          <div className="features-section-heading features-section-heading-centered"><p className="features-kicker">The details that make it useful</p><h2>Everything included.</h2><p>Thoughtful controls for the day-to-day, with enough flexibility to make the system feel like yours.</p></div>
          <div className="features-included-grid">{INCLUDED_FEATURES.map(([title, body]) => <article className="features-included-card" key={title}><span className="features-included-icon"><CheckIcon /></span><div><h3>{title}</h3><p>{body}</p></div></article>)}</div>
        </section>

        <section className="features-final-cta" data-reveal><div><p className="features-kicker features-kicker-light">Make attendance feel effortless</p><h2>Give your team a better way to keep track.</h2><p>Start with a workspace that is ready for your people, your Groups, and the way your organization runs.</p></div><Link className="btn-primary features-final-button" to="/register">Create your workspace <span aria-hidden="true">→</span></Link></section>
      </div>
    </PublicPageShell>
  );
}

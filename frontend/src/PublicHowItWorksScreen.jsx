import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PublicPageShell from "./PublicPageShell.jsx";
import ProductImageSlot from "./ProductImageSlot.jsx";

const JOURNEY_STEPS = [
  {
    number: "01",
    eyebrow: "Start in minutes",
    title: "Create your workspace",
    body: "Register once and your Check Station workspace is ready to shape around the way your organization runs.",
    detail: "One workspace gives your team a single place to set up, run, and review attendance.",
  },
  {
    number: "02",
    eyebrow: "Bring in your people",
    title: "Add Members and staff",
    body: "Create reusable Member profiles and staff accounts for the people who help keep things moving.",
    detail: "Keep your people organized now, so every new check-in flow starts with a strong foundation.",
  },
  {
    number: "03",
    eyebrow: "Match your real world",
    title: "Build the right Group structure",
    body: "Use standard Groups for everyday check-in, or Structured Groups when you need classes and sections inside a larger setup.",
    detail: "A school can organize by class. A workplace can organize by team. The workspace stays clear either way.",
  },
  {
    number: "04",
    eyebrow: "Make every flow feel right",
    title: "Configure each check-in experience",
    body: "Give every Group its own actions, identification method, rules, people, and kiosk presentation.",
    detail: "The front desk can run a different flow from the classroom — without creating another workspace.",
  },
  {
    number: "05",
    eyebrow: "Open the right screen",
    title: "Launch wherever it makes sense",
    body: "Run a kiosk on a shared tablet, use the browser with staff, or keep several Group experiences moving at once.",
    detail: "Every Group kiosk stays separate from the admin workspace and independent from the others.",
  },
  {
    number: "06",
    eyebrow: "Stay in the loop",
    title: "Review what happened",
    body: "Each check-in, check-out, and break becomes a record your team can revisit whenever they need it.",
    detail: "Filter activity by Group, person, action, or day and keep the full story close at hand.",
  },
];

const STAFF_EXAMPLES = [
  ["Teacher", "Assign the classes or Groups they should view and operate."],
  ["Manager", "Keep the Groups they oversee close to hand for everyday operations."],
  ["Reception", "Give a front-desk teammate access to the check-in Groups they run."],
];

function PageTitle() {
  useEffect(() => {
    const title = "How it works — Check Station";
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
    ensure("description", "Set up flexible check-in flows, run them across your devices, and keep every action connected in one Check Station workspace.");
    ensure("og:title", title);
    ensure("og:description", "A flexible check-in flow for every Group, all from one workspace.");
    ensure("og:type", "website");
  }, []);
  return null;
}

function CheckMark() {
  return <span className="how-check" aria-hidden="true">✓</span>;
}

export default function PublicHowItWorksScreen() {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const page = document.querySelector(".how-page");
    if (!page) return undefined;
    const items = [...page.querySelectorAll("[data-reveal]")];
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      items.forEach((item) => item.classList.add("is-visible"));
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
    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);

  const selected = JOURNEY_STEPS[activeStep];

  return (
    <PublicPageShell>
      <div className="how-page">
        <PageTitle />

        <section className="how-hero" data-reveal>
          <div className="how-hero-copy">
            <p className="how-kicker">Simple to start. Flexible by design.</p>
            <h1>One workspace for every way your people check in.</h1>
            <p>Set up a flow for the front desk, another for each class, and another for your team — all at the same time, all from one place.</p>
            <div className="how-hero-actions">
              <Link className="btn-primary how-primary-button" to="/register">Create your workspace <span aria-hidden="true">→</span></Link>
              <a className="how-quiet-link" href="#your-journey">See the journey <span aria-hidden="true">↓</span></a>
            </div>
            <div className="how-hero-pills"><span><CheckMark /> Set up fast</span><span><CheckMark /> Different flows, one workspace</span><span><CheckMark /> Ready on your devices</span></div>
          </div>
          <div className="how-hero-visual" aria-hidden="true">
            <span className="how-hero-line how-hero-line-one" /><span className="how-hero-line how-hero-line-two" />
            <div className="how-hero-hub"><span>One</span><b>workspace</b></div>
            <div className="how-hero-flow how-hero-flow-a"><span>Class A</span><b>iPad kiosk</b></div>
            <div className="how-hero-flow how-hero-flow-b"><span>Welcome desk</span><b>Browser kiosk</b></div>
            <div className="how-hero-flow how-hero-flow-c"><span>Team check-in</span><b>Phone ready</b></div>
          </div>
        </section>

        <section id="your-journey" className="how-journey" data-reveal>
          <div className="how-section-heading"><p className="how-kicker">Your journey</p><h2>From first workspace to first check-in — it just clicks.</h2><p>Choose a step to see how Check Station helps your setup take shape.</p></div>
          <div className="how-journey-layout">
            <ol className="how-step-list">
              {JOURNEY_STEPS.map((step, index) => (
                <li key={step.number}>
                  <button type="button" className={index === activeStep ? "how-step-button is-active" : "how-step-button"} onClick={() => setActiveStep(index)} onMouseEnter={() => setActiveStep(index)}>
                    <span className="how-step-number">{step.number}</span><span><b>{step.title}</b><small>{step.eyebrow}</small></span><span className="how-step-arrow" aria-hidden="true">→</span>
                  </button>
                </li>
              ))}
            </ol>
            <div key={selected.number} className="how-step-detail" aria-live="polite">
              <p className="how-kicker">{selected.eyebrow}</p><span className="how-detail-number">{selected.number}</span><h3>{selected.title}</h3><p>{selected.body}</p><div className="how-detail-note"><CheckMark />{selected.detail}</div>
            </div>
          </div>
        </section>

        <section className="how-structure" data-reveal>
          <div className="how-structure-copy"><p className="how-kicker">Organize without compromise</p><h2>Simple Groups when they are enough. Structure when you need it.</h2><p>Start with the everyday Groups that make sense for your team. When a school or larger program needs another layer, Structured Groups give you classes and sections within the same workspace.</p><div className="how-structure-points"><span><CheckMark /> Standard Groups for everyday flows</span><span><CheckMark /> Structured Groups for classes and sections</span><span><CheckMark /> One workspace, a clear view of it all</span></div></div>
          <ProductImageSlot label="Standard and Structured Groups" caption="Image placeholder — add an original Groups screenshot here later." aspect="4 / 3" className="how-image-slot" />
        </section>

        <section className="how-simultaneous" data-reveal>
          <div className="how-section-heading how-heading-light"><p className="how-kicker">Made to move together</p><h2>One workspace. Different Groups. Different devices. All running together.</h2><p>Open each Group’s own check-in experience where it belongs, while the rest of your workspace keeps moving.</p></div>
          <div className="how-device-network">
            <span className="how-network-line how-network-line-a" aria-hidden="true" /><span className="how-network-line how-network-line-b" aria-hidden="true" /><span className="how-network-line how-network-line-c" aria-hidden="true" />
            <div className="how-device-card how-device-tablet"><span className="how-device-label">Group A · shared tablet</span><ProductImageSlot label="Group A iPad kiosk" caption="Future iPad kiosk screenshot" aspect="4 / 3" className="how-device-image" /></div>
            <div className="how-device-card how-device-desktop"><span className="how-device-label">Welcome desk · browser</span><ProductImageSlot label="Staff browser kiosk" caption="Future browser kiosk screenshot" aspect="16 / 10" className="how-device-image" /></div>
            <div className="how-device-card how-device-phone"><span className="how-device-label">Structured Group · class</span><ProductImageSlot label="Structured Group class check-in" caption="Future class check-in screenshot" aspect="4 / 5" className="how-device-image" /></div>
            <div className="how-network-hub" aria-hidden="true"><span>One</span><b>workspace</b></div>
          </div>
          <div className="how-simultaneous-foot"><span><CheckMark /> Each Group owns its kiosk setup</span><span><CheckMark /> Kiosks run independently</span><span><CheckMark /> Admin workspace stays separate</span></div>
        </section>

        <section className="how-staff" data-reveal>
          <ProductImageSlot label="Staff account and Group access" caption="Image placeholder — add an original staff access screenshot here later." aspect="4 / 3" className="how-image-slot" />
          <div className="how-staff-copy"><p className="how-kicker">The right people, in the right Groups</p><h2>Give staff a focused place to help.</h2><p>Create staff accounts for the people who run check-in with you, then choose the Groups each staff account can view and operate.</p><div className="how-staff-examples">{STAFF_EXAMPLES.map(([title, body]) => <article key={title}><span>{title.slice(0, 1)}</span><div><h3>{title}</h3><p>{body}</p></div></article>)}</div><p className="how-staff-note">Whether they are a teacher, manager, or receptionist, the access stays tied to the Groups you choose.</p></div>
        </section>

        <section className="how-history" data-reveal>
          <div><p className="how-kicker">Everything connects</p><h2>Every action becomes a clearer picture.</h2><p>When people check in, check out, or take a break, Check Station keeps the activity connected to the Group. Your team can return to the workspace, filter the history, and understand what happened without chasing down scattered notes.</p><Link className="how-text-link" to="/features">Explore all features <span aria-hidden="true">→</span></Link></div>
          <ProductImageSlot label="Activity history" caption="Image placeholder — add an original history screenshot here later." aspect="16 / 10" className="how-history-image" />
        </section>

        <section className="how-final-cta" data-reveal><div><p className="how-kicker how-kicker-light">Ready when you are</p><h2>Start your first check-in today.</h2><p>Create a workspace, build your first Group, and make attendance feel easier from the first day.</p></div><Link className="btn-primary how-final-button" to="/register">Create your workspace <span aria-hidden="true">→</span></Link></section>
      </div>
    </PublicPageShell>
  );
}

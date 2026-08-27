import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PublicPageShell from "./PublicPageShell.jsx";
import ProductImageSlot from "./ProductImageSlot.jsx";
import { ConnectionVisual } from "./components.jsx";
import { homeRealSetupsImage, homeWorkflowImage } from "./assets/home/homeImages.js";

function MarketingImage({ className = "", image }) {
  return (
    <figure className={`home-image-slot home-image-slot-filled ${className}`.trim()}>
      <picture>
        <source type="image/avif" srcSet={image.avifSrcSet} sizes={image.sizes} />
        <source type="image/webp" srcSet={image.webpSrcSet} sizes={image.sizes} />
        <img src={image.fallbackSrc} srcSet={image.jpgSrcSet} sizes={image.sizes} alt={image.alt} width={image.width} height={image.height} loading="lazy" decoding="async" style={{ objectPosition: image.objectPosition }} />
      </picture>
    </figure>
  );
}

function PageTitle() {
  useEffect(() => {
    const title = "Check Station — Flexible check-in, made simple";
    const description = "Create flexible kiosk check-in experiences for schools, workplaces, clubs, and more. Start free with a 7-day Business trial and no card required.";
    document.title = title;
    const ensure = (selector, attribute, value, content) => {
      let el = document.querySelector(selector);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attribute, value);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };
    ensure('meta[name="description"]', "name", "description", description);
    ensure('meta[property="og:title"]', "property", "og:title", title);
    ensure('meta[property="og:description"]', "property", "og:description", description);
    ensure('meta[property="og:type"]', "property", "og:type", "website");
  }, []);
  return null;
}

const VALUES = [
  { icon: "↗", title: "Start quickly", body: "Create your workspace, add people, and launch your first check-in flow without a complicated rollout." },
  { icon: "◇", title: "Fit your workflow", body: "Give every Group its own actions, requirements, identification, and kiosk experience." },
  { icon: "◎", title: "See what happened", body: "Turn check-ins, check-outs, and breaks into clear history your team can review." },
];

const FEATURES = [
  ["Members & Groups", "Keep reusable people profiles and organize them around the way your operation really works."],
  ["Independent kiosks", "Run a dedicated participant experience for every Group without exposing the admin workspace."],
  ["Flexible actions", "Choose check-in, check-out, breaks, identification requirements, and more per Group."],
  ["Staff access", "Create staff accounts and choose the Groups each staff member can view and operate."],
];

const STEPS = [
  ["01", "Create your workspace", "Register and start immediately."],
  ["02", "Add people and Groups", "Build the structure that fits your organization."],
  ["03", "Shape each kiosk", "Choose the actions, rules, and presentation."],
  ["04", "Launch and review", "Run check-in on your devices and keep every action connected."],
];

const KIOSK_STYLES = [
  { name: "School", tone: "Calm and welcoming", color: "#2563eb" },
  { name: "Warehouse", tone: "Clear and high-contrast", color: "#f59e0b" },
  { name: "Café", tone: "Warm and friendly", color: "#ea580c" },
  { name: "Office", tone: "Clean and professional", color: "#0ea5e9" },
  { name: "Club", tone: "Energetic and familiar", color: "#8b5cf6" },
];

const USE_CASES = ["Schools & classes", "Warehouses & teams", "Cafés & hospitality", "Offices & reception", "Clubs & communities"];

function Check() {
  return <span className="home-sales-check" aria-hidden="true">✓</span>;
}

export default function PublicHomeScreen() {
  const [kioskStyle, setKioskStyle] = useState(0);

  useEffect(() => {
    const page = document.querySelector(".home-sales");
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

  const selectedStyle = KIOSK_STYLES[kioskStyle];

  return (
    <PublicPageShell>
      <div className="home-sales">
        <PageTitle />

        <section className="home-sales-hero" data-reveal>
          <div className="home-sales-hero-copy">
            <p className="home-sales-kicker">Flexible check-in for real-world teams</p>
            <h1>Make every check-in feel effortless.</h1>
            <p>Bring people, Groups, custom kiosks, and activity history together in one workspace that adapts to the way you already work.</p>
            <div className="home-sales-actions">
              <Link className="btn-primary home-sales-primary" to="/register">Register now <span aria-hidden="true">→</span></Link>
              <Link className="btn-secondary home-sales-secondary" to="/how-it-works">See how it works</Link>
            </div>
            <div className="home-sales-trial"><span className="home-sales-trial-badge">7 days</span><span>Try Business free — no card required.</span></div>
          </div>
          <div className="home-sales-hero-visual" aria-hidden="true">
            <div className="home-sales-hero-glow" />
            <ConnectionVisual />
            <div className="home-sales-hero-note home-sales-note-one"><b>Unique kiosks</b><span>For every Group</span></div>
            <div className="home-sales-hero-note home-sales-note-two"><b>One workspace</b><span>Everything connected</span></div>
          </div>
        </section>

        <section className="home-sales-why" data-reveal>
          <header className="home-sales-heading home-sales-heading-centered"><p className="home-sales-kicker">Why Check Station</p><h2>Simple for people. Powerful for your team.</h2><p>Set up the details once, then give everyone a clear and dependable way to keep attendance moving.</p></header>
          <div className="home-sales-value-grid">{VALUES.map((value) => <article key={value.title}><span className="home-sales-value-icon">{value.icon}</span><h3>{value.title}</h3><p>{value.body}</p></article>)}</div>
        </section>

        <section className="home-sales-features" data-reveal>
          <div className="home-sales-feature-visual"><MarketingImage image={homeWorkflowImage} className="home-sales-workflow-image" /></div>
          <div className="home-sales-feature-copy"><p className="home-sales-kicker">A complete flow</p><h2>Everything your check-in needs, working together.</h2><p>From the people you organize to the actions you review later, Check Station keeps the whole experience connected.</p><div className="home-sales-feature-list">{FEATURES.map(([title, body]) => <article key={title}><Check /><div><h3>{title}</h3><p>{body}</p></div></article>)}</div><Link className="home-sales-text-link" to="/features">Explore all features <span aria-hidden="true">→</span></Link></div>
        </section>

        <section className="home-sales-how" data-reveal>
          <header className="home-sales-heading"><p className="home-sales-kicker">How it works</p><h2>From sign-up to check-in in four clear steps.</h2><p>No lengthy implementation. Build the flow you need and open it on the device that fits the space.</p></header>
          <ol className="home-sales-step-grid">{STEPS.map(([number, title, body]) => <li key={number}><span>{number}</span><h3>{title}</h3><p>{body}</p></li>)}</ol>
          <Link className="btn-secondary home-sales-outline-button" to="/how-it-works">See how it works <span aria-hidden="true">→</span></Link>
        </section>

        <section className="home-sales-kiosk" data-reveal>
          <div className="home-sales-kiosk-copy"><p className="home-sales-kicker">Your kiosk, your character</p><h2>Make every kiosk feel like it belongs there.</h2><p>Use the kiosk editor to shape the presentation, messages, identification flow, and available actions for each Group. A school can feel different from a warehouse, café, office, or club — all inside the same workspace.</p><div className="home-sales-style-picker" role="group" aria-label="Kiosk style examples">{KIOSK_STYLES.map((style, index) => <button type="button" key={style.name} className={index === kioskStyle ? "is-active" : ""} onClick={() => setKioskStyle(index)}>{style.name}</button>)}</div><div className="home-sales-style-result" style={{ "--style-accent": selectedStyle.color }} aria-live="polite"><span className="home-sales-style-swatch" /><div><b>{selectedStyle.name} kiosk</b><span>{selectedStyle.tone}</span></div></div><Link className="home-sales-text-link" to="/features">Learn about customization <span aria-hidden="true">→</span></Link></div>
          <ProductImageSlot label="Kiosk editor and live preview" caption="Image placeholder — add an original kiosk editor screenshot here later." aspect="4 / 3" className="home-sales-kiosk-image" />
        </section>

        <section className="home-sales-usecases" data-reveal>
          <header className="home-sales-heading"><p className="home-sales-kicker">Built for the way you work</p><h2>One flexible platform. Plenty of real-world possibilities.</h2></header>
          <div className="home-sales-usecase-layout"><MarketingImage image={homeRealSetupsImage} className="home-sales-setups-image" /><div className="home-sales-usecase-list">{USE_CASES.map((item, index) => <article key={item}><span>0{index + 1}</span><h3>{item}</h3><Check /></article>)}</div></div>
        </section>

        <section className="home-sales-pricing" data-reveal>
          <div className="home-sales-pricing-copy"><p className="home-sales-kicker">Start without friction</p><h2>Explore the full experience before you choose a plan.</h2><p>Your new workspace starts with Business free for 7 days. No card required. After the trial, you can keep going with Basic for free or choose the plan that fits.</p><Link className="btn-secondary home-sales-pricing-button" to="/pricing">View pricing <span aria-hidden="true">→</span></Link></div>
          <div className="home-sales-price-cards"><article><span className="home-sales-price-label">Start here</span><h3>Business trial</h3><strong>Free <small>for 7 days</small></strong><p>Try the richer Check Station experience from day one.</p><span className="home-sales-no-card"><Check /> No card required</span></article><article><span className="home-sales-price-label">Stay free</span><h3>Basic</h3><strong>$0 <small>to get started</small></strong><p>Keep a straightforward workspace running without a paid plan.</p><span className="home-sales-no-card"><Check /> Upgrade when ready</span></article></div>
        </section>

        <section className="home-sales-preview" data-reveal><div><p className="home-sales-kicker">See your workspace come together</p><h2>One place for people, kiosks, and the full attendance story.</h2><p>We’ll add an original Check Station product overview here as the screenshot library grows.</p></div><ProductImageSlot label="Check Station workspace overview" caption="Image placeholder — add an original product screenshot here later." aspect="16 / 9" className="home-sales-preview-image" /></section>

        <section className="home-sales-final" data-reveal><div><p className="home-sales-kicker home-sales-kicker-light">Ready to make check-in easier?</p><h2>Build your first Check Station flow today.</h2><p>Start free, try Business for one week, and create a check-in experience that fits your world.</p></div><Link className="btn-primary home-sales-final-button" to="/register">Create your workspace <span aria-hidden="true">→</span></Link></section>
      </div>
    </PublicPageShell>
  );
}

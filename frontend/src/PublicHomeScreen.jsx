import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import PublicPageShell from "./PublicPageShell.jsx";
import ProductImageSlot from "./ProductImageSlot.jsx";
import { ConnectionVisual } from "./components.jsx";
import {
  homeGroupCommunicationImages,
  homeKioskStyleImages,
  homeRealSetupsImage,
  homeValueIcons,
  homeWorkspaceImages,
  homeWorkflowImage,
} from "./assets/home/homeImages.js";

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
    const title = "CheckStation — Flexible check-in, made simple";
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
  { icon: homeValueIcons.startQuickly, title: "Start quickly", body: "Create your workspace, add people, and launch your first check-in flow without a complicated rollout." },
  { icon: homeValueIcons.fitWorkflow, title: "Fit your workflow", body: "Give every Group its own actions, requirements, identification, and kiosk experience." },
  { icon: homeValueIcons.seeHistory, title: "See what happened", body: "Turn check-ins, check-outs, and breaks into clear history your team can review." },
];

const FEATURES = [
  ["Members & Groups", "Keep reusable people profiles and organize them around the way your operation really works."],
  ["Independent kiosks", "Run a dedicated participant experience for every Group without exposing the admin workspace."],
  ["Flexible actions", "Choose check-in, check-out, breaks, identification requirements, and more per Group."],
  ["Staff access", "Create staff accounts and choose the Groups each staff member can view and operate."],
];

const STEPS = [
  ["01", "Create your workspace", "Register and start immediately.", "workspace"],
  ["02", "Add people and Groups", "Build the structure that fits your organization.", "people"],
  ["03", "Shape each kiosk", "Choose the actions, rules, and presentation.", "kiosk"],
  ["04", "Launch and review", "Run check-in on your devices and keep every action connected.", "history"],
];

const KIOSK_STYLES = [
  { name: "School", tone: "Calm and welcoming", color: "#2563eb", image: homeKioskStyleImages.school },
  { name: "Warehouse", tone: "Clear and high-contrast", color: "#f59e0b", image: homeKioskStyleImages.warehouse },
  { name: "Café", tone: "Warm and friendly", color: "#ea580c", image: homeKioskStyleImages.cafe },
  { name: "Office", tone: "Clean and professional", color: "#0ea5e9", image: homeKioskStyleImages.office },
  { name: "Club", tone: "Energetic and familiar", color: "#8b5cf6", image: homeKioskStyleImages.club },
];

const USE_CASES = ["Schools & classes", "Warehouses & teams", "Cafés & hospitality", "Offices & reception", "Clubs & communities"];

const HERO_FEATURE_WORDS = ["ATTENDANCE", "GROUPS", "KIOSKS", "NOTIFICATIONS", "HISTORY"];
const HERO_WORD_DURATION = 3400;
const HERO_PARTICLES = [
  { x: "55%", y: "16%", size: "3px", duration: "15s", delay: "-4s", drift: "-22px" },
  { x: "64%", y: "72%", size: "5px", duration: "19s", delay: "-11s", drift: "28px" },
  { x: "72%", y: "28%", size: "2px", duration: "13s", delay: "-7s", drift: "18px" },
  { x: "80%", y: "82%", size: "3px", duration: "21s", delay: "-14s", drift: "-26px" },
  { x: "87%", y: "19%", size: "4px", duration: "17s", delay: "-8s", drift: "24px" },
  { x: "92%", y: "61%", size: "2px", duration: "14s", delay: "-2s", drift: "-18px" },
  { x: "76%", y: "52%", size: "3px", duration: "23s", delay: "-17s", drift: "20px" },
];

function Check() {
  return <span className="home-sales-check" aria-hidden="true">✓</span>;
}

function StepIcon({ type }) {
  const paths = {
    workspace: <><path d="M4 5.5h16v12H4z" /><path d="M8 21h8M12 17.5V21M7.5 9h9" /></>,
    people: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.4-3.2 2.2-5 5.5-5s5.1 1.8 5.5 5M15 6.5a2.5 2.5 0 0 1 0 5M16.5 14c2.4.3 3.7 1.8 4 4" /></>,
    kiosk: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8.5 7.5h7M8.5 11.5h3M15.5 11.5h.01M8.5 15.5h.01M12 15.5h3.5" /></>,
    history: <><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6" /><path d="M4 4v4.6h4.6M12 7.5V12l3 2" /></>,
  };

  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[type]}</svg>;
}

function HeroFeatureWord({ active, reducedMotion }) {
  const [wordIndex, setWordIndex] = useState(0);
  const remainingRef = useRef(HERO_WORD_DURATION);

  useEffect(() => {
    if (!active || reducedMotion) return undefined;
    const startedAt = window.performance.now();
    let completed = false;
    const timer = window.setTimeout(() => {
      completed = true;
      remainingRef.current = HERO_WORD_DURATION;
      setWordIndex((current) => (current + 1) % HERO_FEATURE_WORDS.length);
    }, remainingRef.current);

    return () => {
      window.clearTimeout(timer);
      if (!completed) {
        remainingRef.current = Math.max(
          100,
          remainingRef.current - (window.performance.now() - startedAt),
        );
      }
    };
  }, [active, reducedMotion, wordIndex]);

  const word = reducedMotion ? HERO_FEATURE_WORDS[0] : HERO_FEATURE_WORDS[wordIndex];

  return (
    <div className="home-hero-feature-word" aria-hidden="true">
      <span className="home-hero-feature-label">Built around</span>
      <span className="home-hero-feature-letters" key={word}>
        {[...word].map((letter, index) => (
          <span
            key={`${letter}-${index}`}
            style={{
              "--letter-index": index,
              "--letter-x": `${((index % 3) - 1) * 5}px`,
              "--letter-y": `${index % 2 === 0 ? -4 : 5}px`,
            }}
          >
            {letter}
          </span>
        ))}
      </span>
    </div>
  );
}

function WorkspaceOverviewCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setActiveIndex((current) => (current + 1) % homeWorkspaceImages.length);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [activeIndex]);

  function move(direction) {
    setActiveIndex((current) => (
      (current + direction + homeWorkspaceImages.length) % homeWorkspaceImages.length
    ));
  }

  return (
    <figure
      className="home-sales-preview-image home-workspace-carousel"
      role="region"
      aria-roledescription="carousel"
      aria-label="CheckStation workspace overview"
    >
      <div className="home-workspace-carousel-stage">
        {homeWorkspaceImages.map((image, index) => (
          <img
            key={image.src}
            className={index === activeIndex ? "is-active" : ""}
            src={image.src}
            alt={index === activeIndex ? image.alt : ""}
            width="1600"
            height="900"
            loading="lazy"
            decoding="async"
            aria-hidden={index === activeIndex ? undefined : "true"}
          />
        ))}
        <button
          type="button"
          className="home-workspace-carousel-arrow home-workspace-carousel-arrow-left"
          aria-label="Previous workspace image"
          onClick={() => move(-1)}
        >
          <span aria-hidden="true">‹</span>
        </button>
        <button
          type="button"
          className="home-workspace-carousel-arrow home-workspace-carousel-arrow-right"
          aria-label="Next workspace image"
          onClick={() => move(1)}
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>
    </figure>
  );
}

export default function PublicHomeScreen() {
  const [kioskStyle, setKioskStyle] = useState(0);
  const [heroInView, setHeroInView] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const heroRef = useRef(null);

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

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => setReducedMotion(media.matches);
    updateMotionPreference();
    media.addEventListener?.("change", updateMotionPreference);
    return () => media.removeEventListener?.("change", updateMotionPreference);
  }, []);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero || !("IntersectionObserver" in window)) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setHeroInView(entry.isIntersecting),
      { threshold: 0.05 },
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  const selectedStyle = KIOSK_STYLES[kioskStyle];

  return (
    <PublicPageShell>
      <div className="home-sales">
        <PageTitle />

        <section
          ref={heroRef}
          className="home-sales-hero"
          data-hero-motion={heroInView && !reducedMotion ? "active" : "paused"}
          data-reveal
        >
          <div className="home-hero-particles" aria-hidden="true">
            {HERO_PARTICLES.map((particle, index) => (
              <span
                className="home-hero-particle"
                key={index}
                style={{
                  "--particle-x": particle.x,
                  "--particle-y": particle.y,
                  "--particle-size": particle.size,
                  "--particle-duration": particle.duration,
                  "--particle-delay": particle.delay,
                  "--particle-drift": particle.drift,
                }}
              />
            ))}
          </div>
          <div className="home-sales-hero-copy">
            <p className="home-sales-kicker">Flexible check-in for real-world teams</p>
            <h1>Make attendance feel effortless.</h1>
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
            <HeroFeatureWord active={heroInView} reducedMotion={reducedMotion} />
            <div className="home-sales-hero-note home-sales-note-one"><b>Unique kiosks</b><span>For every Group</span></div>
            <div className="home-sales-hero-note home-sales-note-two"><b>One workspace</b><span>Everything connected</span></div>
          </div>
        </section>

        <section className="home-sales-why" data-reveal>
          <header className="home-sales-heading home-sales-heading-centered"><p className="home-sales-kicker">Why CheckStation</p><h2>Simple for people. Powerful for your team.</h2><p>Set up the details once, then give everyone a clear and dependable way to keep attendance moving.</p></header>
          <div className="home-sales-value-grid">{VALUES.map((value) => <article key={value.title}><span className="home-sales-value-icon"><img src={value.icon} alt="" width="40" height="40" loading="lazy" decoding="async" /></span><h3>{value.title}</h3><p>{value.body}</p></article>)}</div>
        </section>

        <section className="home-sales-group-email" data-reveal>
          <div className="home-sales-group-email-copy">
            <p className="home-sales-kicker">Group-level communication</p>
            <h2>Every Group can communicate its own way.</h2>
            <p>Give each Group or Structured Group its own Gmail, Microsoft/Outlook, Yahoo, or custom SMTP sender — with forwarding destinations and notification rules that fit the people it serves.</p>
            <div className="home-sales-group-email-examples">
              <article><span>School</span><p>Use the school business email, notify parents when a child checks in or out, and optionally forward copies to the school director.</p></article>
              <article><span>Café / staff</span><p>Use a completely different café business email and choose whether staff receive check-in and check-out notifications.</p></article>
            </div>
            <p className="home-sales-group-email-summary">One workspace. Different Groups, senders, recipients, and notification rules.</p>
          </div>
          <div className="home-sales-group-email-visuals" aria-label="Future Group email settings screenshots">
            <ProductImageSlot label="Group email sender settings" image={homeGroupCommunicationImages.sender} aspect="4 / 5" className="home-sales-email-slot" />
            <ProductImageSlot label="Notification and forwarding rules" image={homeGroupCommunicationImages.notifications} aspect="4 / 5" className="home-sales-email-slot" />
          </div>
        </section>

        <section className="home-sales-features" data-reveal>
          <div className="home-sales-feature-visual"><MarketingImage image={homeWorkflowImage} className="home-sales-workflow-image" /></div>
          <div className="home-sales-feature-copy"><p className="home-sales-kicker">A complete flow</p><h2>Everything your check-in needs, working together.</h2><p>From the people you organize to the actions you review later, CheckStation keeps the whole experience connected.</p><div className="home-sales-feature-list">{FEATURES.map(([title, body]) => <article key={title}><Check /><div><h3>{title}</h3><p>{body}</p></div></article>)}</div><Link className="home-sales-text-link" to="/features">Explore all features <span aria-hidden="true">→</span></Link></div>
        </section>

        <section className="home-sales-how" data-reveal>
          <header className="home-sales-heading"><p className="home-sales-kicker">How it works</p><h2>From sign-up to your first attendance flow in four clear steps.</h2><p>No lengthy implementation. Build the flow you need and open it on the device that fits the space.</p></header>
          <ol className="home-sales-step-grid">{STEPS.map(([number, title, body, icon]) => <li key={number}><span className="home-sales-step-marker"><StepIcon type={icon} /><small>{number}</small></span><h3>{title}</h3><p>{body}</p></li>)}</ol>
          <Link className="btn-secondary home-sales-outline-button" to="/how-it-works">See how it works <span aria-hidden="true">→</span></Link>
        </section>

        <section className="home-sales-kiosk" data-reveal style={{ "--style-accent": selectedStyle.color }}>
          <div className="home-sales-kiosk-copy"><p className="home-sales-kicker">One editor. Practically unlimited looks.</p><h2>These aren’t templates — they’re examples built with the Kiosk Editor.</h2><p>Every example uses the same flexible editor. Change colors, gradients, fonts, text, logos, images, layout, presentation, and supported actions and flows to create something entirely your own. School, warehouse, café, office, and club are just a few possibilities.</p><div className="home-sales-style-picker" role="group" aria-label="Kiosk style examples">{KIOSK_STYLES.map((style, index) => <button type="button" key={style.name} className={index === kioskStyle ? "is-active" : ""} onClick={() => setKioskStyle(index)}>{style.name}</button>)}</div><div className="home-sales-style-result" aria-live="polite"><span className="home-sales-style-swatch" /><div><b>{selectedStyle.name} kiosk</b><span>{selectedStyle.tone}</span></div></div><Link className="home-sales-text-link" to="/features">Learn about customization <span aria-hidden="true">→</span></Link></div>
          <ProductImageSlot
            label={`${selectedStyle.name} kiosk preview`}
            caption={selectedStyle.image ? `${selectedStyle.name} kiosk example` : "Image placeholder — add an original kiosk editor screenshot here later."}
            image={selectedStyle.image}
            aspect="4 / 3"
            className="home-sales-kiosk-image"
          />
        </section>

        <section className="home-sales-usecases" data-reveal>
          <header className="home-sales-heading"><p className="home-sales-kicker">Built for the way you work</p><h2>One flexible platform. Plenty of real-world possibilities.</h2></header>
          <div className="home-sales-usecase-layout"><MarketingImage image={homeRealSetupsImage} className="home-sales-setups-image" /><div className="home-sales-usecase-list">{USE_CASES.map((item, index) => <article key={item}><span>0{index + 1}</span><h3>{item}</h3><Check /></article>)}</div></div>
        </section>

        <section className="home-sales-pricing" data-reveal>
          <div className="home-sales-pricing-copy"><p className="home-sales-kicker">Start without friction</p><h2>Explore the full experience before you choose a plan.</h2><p>Your new workspace starts with Business free for 7 days. No card required. After the trial, you can keep going with Basic for free or choose the plan that fits.</p><Link className="btn-secondary home-sales-pricing-button" to="/pricing">View pricing <span aria-hidden="true">→</span></Link></div>
          <div className="home-sales-price-cards"><article><span className="home-sales-price-label">Start here</span><h3>Business trial</h3><strong>Free <small>for 7 days</small></strong><p>Try the richer CheckStation experience from day one.</p><span className="home-sales-no-card"><Check /> No card required</span></article><article><span className="home-sales-price-label">Stay free</span><h3>Basic</h3><strong>$0 <small>to get started</small></strong><p>Keep a straightforward workspace running without a paid plan.</p><span className="home-sales-no-card"><Check /> Upgrade when ready</span></article></div>
        </section>

        <section className="home-sales-preview" data-reveal><div><p className="home-sales-kicker">See your workspace come together</p><h2>One place for people, kiosks, and the full attendance story.</h2><p>Move from a clear daily overview to member management and attendance history — all inside the same connected workspace.</p></div><WorkspaceOverviewCarousel /></section>

        <section className="home-sales-final" data-reveal><div><p className="home-sales-kicker home-sales-kicker-light">Ready to make check-in easier?</p><h2>Build your first CheckStation flow today.</h2><p>Start free, try Business for one week, and create a check-in experience that fits your world.</p></div><Link className="btn-primary home-sales-final-button" to="/register">Create your workspace <span aria-hidden="true">→</span></Link></section>
      </div>
    </PublicPageShell>
  );
}

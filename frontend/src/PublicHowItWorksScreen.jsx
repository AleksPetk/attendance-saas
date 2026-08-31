import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import PublicPageShell from "./PublicPageShell.jsx";
import ProductImageSlot from "./ProductImageSlot.jsx";
import section2StandardStructuredGroups from "./assets/how-it-works/section2-standard-structured-groups-1200.webp";
import section3Browser from "./assets/how-it-works/section3-browser-1200.webp";
import section3Ipad from "./assets/how-it-works/section3-ipad-960.webp";
import section3Iphone from "./assets/how-it-works/section3-iphone-675.webp";
import section4Admin from "./assets/how-it-works/section4-admin-1200.webp";
import section4Teacher from "./assets/how-it-works/section4-teacher-1200.webp";
import section4Manager from "./assets/how-it-works/section4-manager-1200.webp";
import section4Reception from "./assets/how-it-works/section4-reception-1200.webp";
import {
  HOW_IT_WORKS_SLIDESHOW_INTERVAL_MS,
  nextSlideshowIndex,
  shouldRunSlideshow,
} from "./howItWorksSlideshow.js";

const JOURNEY_STEPS = [
  {
    number: "01",
    eyebrow: "Start in minutes",
    title: "Create your workspace",
    body: "Register once and your CheckStation workspace is ready to shape around the way your organization runs.",
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

const SECTION_TWO_ARTWORK = {
  alt: "CheckStation Standard Group kiosk beside a Structured Group class kiosk.",
  width: 1200,
  height: 900,
  sizes: "(max-width: 880px) calc(100vw - 3rem), min(50vw, 35rem)",
  fallbackSrc: section2StandardStructuredGroups,
};

const SECTION_THREE_DEVICES = {
  browser: {
    alt: "Northgate Warehouse browser kiosk showing employee check-in cards.",
    width: 1200,
    height: 675,
    sizes: "(max-width: 700px) calc(100vw - 3rem), min(74vw, 49rem)",
    fallbackSrc: section3Browser,
  },
  tablet: {
    alt: "Northgate Warehouse tablet kiosk showing employee check-in cards.",
    width: 960,
    height: 720,
    sizes: "(max-width: 560px) calc(100vw - 4rem), min(45vw, 29rem)",
    fallbackSrc: section3Ipad,
  },
  phone: {
    alt: "Northgate Warehouse phone kiosk showing employee check-in cards.",
    width: 675,
    height: 1200,
    sizes: "(max-width: 560px) min(52vw, 11rem), min(21vw, 12.5rem)",
    fallbackSrc: section3Iphone,
  },
};

const SECTION_FOUR_SLIDES = [
  {
    role: "Admin",
    src: section4Admin,
    alt: "Admin Staff Management view showing Group access assignments for workspace staff.",
  },
  {
    role: "Teacher",
    src: section4Teacher,
    alt: "Teacher staff workspace showing assigned School and Sels Groups.",
  },
  {
    role: "Manager",
    src: section4Manager,
    alt: "Manager staff workspace showing an attendance report limited to assigned Groups.",
  },
  {
    role: "Reception",
    src: section4Reception,
    alt: "Reception staff dashboard showing activity from assigned Groups.",
  },
];

function PageTitle() {
  useEffect(() => {
    const title = "How it works — CheckStation";
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
    ensure("description", "Set up flexible check-in flows, run them across your devices, and keep every action connected in one CheckStation workspace.");
    ensure("og:title", title);
    ensure("og:description", "A flexible check-in flow for every Group, all from one workspace.");
    ensure("og:type", "website");
  }, []);
  return null;
}

function CheckMark() {
  return <span className="how-check" aria-hidden="true">✓</span>;
}

function StaffWorkspaceSlideshow() {
  const rootRef = useRef(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [direction, setDirection] = useState(1);
  const [timerVersion, setTimerVersion] = useState(0);
  const [inViewport, setInViewport] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [pageVisible, setPageVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState === "visible",
  );

  useEffect(() => {
    const node = rootRef.current;
    if (!node || !("IntersectionObserver" in window)) {
      setInViewport(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setInViewport(entry.isIntersecting),
      { threshold: 0.2 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    const update = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    if (!shouldRunSlideshow({ inViewport, interacting, reducedMotion, pageVisible })) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setDirection(1);
      setActiveSlide((current) =>
        nextSlideshowIndex(current, SECTION_FOUR_SLIDES.length, 1),
      );
    }, HOW_IT_WORKS_SLIDESHOW_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [activeSlide, inViewport, interacting, pageVisible, reducedMotion, timerVersion]);

  function navigate(directionDelta) {
    setDirection(directionDelta);
    setActiveSlide((current) =>
      nextSlideshowIndex(current, SECTION_FOUR_SLIDES.length, directionDelta),
    );
    setTimerVersion((current) => current + 1);
  }

  function selectSlide(index) {
    setDirection(index >= activeSlide ? 1 : -1);
    setActiveSlide(index);
    setTimerVersion((current) => current + 1);
  }

  return (
    <div
      ref={rootRef}
      className="how-staff-slideshow"
      data-direction={direction > 0 ? "next" : "previous"}
      onMouseEnter={() => setInteracting(true)}
      onMouseLeave={() => setInteracting(false)}
      onFocusCapture={() => setInteracting(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setInteracting(false);
      }}
      aria-roledescription="carousel"
      aria-label="Admin and staff workspace views"
    >
      <div className="how-staff-slideshow-frame">
        <div className="how-staff-slides">
          {SECTION_FOUR_SLIDES.map((slide, index) => (
            <figure
              key={slide.role}
              className={`how-staff-slide${index === activeSlide ? " is-active" : ""}`}
              aria-hidden={index !== activeSlide}
            >
              <img
                src={slide.src}
                alt={index === activeSlide ? slide.alt : ""}
                width="1200"
                height="675"
                loading={index === 0 ? "eager" : "lazy"}
                fetchPriority={index === 0 ? "high" : "auto"}
              />
            </figure>
          ))}
        </div>
        <button
          type="button"
          className="how-staff-slide-arrow is-previous"
          onClick={() => navigate(-1)}
          aria-label="Previous workspace view"
        >
          ‹
        </button>
        <button
          type="button"
          className="how-staff-slide-arrow is-next"
          onClick={() => navigate(1)}
          aria-label="Next workspace view"
        >
          ›
        </button>
      </div>
      <div className="how-staff-slide-dots" role="group" aria-label="Choose workspace view">
        {SECTION_FOUR_SLIDES.map((slide, index) => (
          <button
            key={slide.role}
            type="button"
            className={index === activeSlide ? "is-active" : ""}
            onClick={() => selectSlide(index)}
            aria-label={`Show ${slide.role} workspace view`}
            aria-current={index === activeSlide ? "true" : undefined}
          />
        ))}
      </div>
    </div>
  );
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

        <section id="your-journey" className="how-journey how-journey-hero" data-reveal>
          <div className="how-section-heading how-journey-heading"><p className="how-kicker">Your journey</p><h1>From setup to daily attendance — it just clicks.</h1><p>Choose a step to see how CheckStation helps your setup take shape.</p></div>
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
          <ProductImageSlot label="Standard and Structured Groups" image={SECTION_TWO_ARTWORK} aspect="4 / 3" className="how-image-slot how-section2-artwork" />
        </section>

        <section className="how-simultaneous" data-reveal>
          <div className="how-section-heading how-heading-light"><p className="how-kicker">Made to move together</p><h2>One workspace. Different Groups. Different devices. All running together.</h2><p>Open each Group’s own check-in experience where it belongs, while the rest of your workspace keeps moving.</p></div>
          <div className="how-device-stage">
            <div className="how-device how-device-browser">
              <span className="how-device-label">Admin · browser</span>
              <div className="how-device-shell how-device-shell-browser">
                <div className="how-browser-chrome" aria-hidden="true">
                  <span /><span /><span /><i />
                </div>
                <div className="how-device-viewport how-device-viewport-browser">
                  <ProductImageSlot label="Staff browser kiosk" image={SECTION_THREE_DEVICES.browser} aspect="16 / 9" className="how-device-image" />
                </div>
              </div>
            </div>
            <div className="how-device how-device-tablet">
              <span className="how-device-label">Group A · tablet</span>
              <div className="how-device-shell how-device-shell-tablet">
                <div className="how-device-viewport how-device-viewport-tablet">
                  <ProductImageSlot label="Group A iPad kiosk" image={SECTION_THREE_DEVICES.tablet} aspect="4 / 3" className="how-device-image" />
                </div>
              </div>
            </div>
            <div className="how-device how-device-phone">
              <span className="how-device-label">Class · phone</span>
              <div className="how-device-shell how-device-shell-phone">
                <span className="how-phone-island" aria-hidden="true" />
                <div className="how-device-viewport how-device-viewport-phone">
                  <ProductImageSlot label="Structured Group class check-in" image={SECTION_THREE_DEVICES.phone} aspect="9 / 16" className="how-device-image" />
                </div>
              </div>
            </div>
          </div>
          <div className="how-simultaneous-foot"><span><CheckMark /> Each Group owns its kiosk setup</span><span><CheckMark /> Kiosks run independently</span><span><CheckMark /> Admin workspace stays separate</span></div>
        </section>

        <section className="how-staff" data-reveal>
          <StaffWorkspaceSlideshow />
          <div className="how-staff-copy"><p className="how-kicker">The right people, in the right Groups</p><h2>Give staff a focused place to help.</h2><p>Create staff accounts for the people who run check-in with you, then choose the Groups each staff account can view and operate.</p><div className="how-staff-examples">{STAFF_EXAMPLES.map(([title, body]) => <article key={title}><span>{title.slice(0, 1)}</span><div><h3>{title}</h3><p>{body}</p></div></article>)}</div><p className="how-staff-note">Whether they are a teacher, manager, or receptionist, the access stays tied to the Groups you choose.</p></div>
        </section>

        <section className="how-history" data-reveal>
          <div><p className="how-kicker">Everything connects</p><h2>Every action becomes a clearer picture.</h2><p>When people check in, check out, or take a break, CheckStation keeps the activity connected to the Group. Your team can return to the workspace, filter the history, and understand what happened without chasing down scattered notes.</p><Link className="how-text-link" to="/features">Explore all features <span aria-hidden="true">→</span></Link></div>
          <ProductImageSlot label="Activity history" caption="Image placeholder — add an original history screenshot here later." aspect="16 / 10" className="how-history-image" />
        </section>

        <section className="how-final-cta" data-reveal><div><p className="how-kicker how-kicker-light">Ready when you are</p><h2>Start your first check-in today.</h2><p>Create a workspace, build your first Group, and make attendance feel easier from the first day.</p></div><Link className="btn-primary how-final-button" to="/register">Create your workspace <span aria-hidden="true">→</span></Link></section>
      </div>
    </PublicPageShell>
  );
}

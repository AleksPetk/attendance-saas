import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import PublicPageShell from "./PublicPageShell.jsx";
import ProductImageSlot from "./ProductImageSlot.jsx";
import { featuresShowcaseImages } from "./assets/features/first-section/showcaseImages.js";
import { membersGroupsStoryImages } from "./assets/features/second-section/storyImages.js";
import { configurableFlowDemo } from "./assets/features/third-section/demoVideos.js";
import { emailNotificationPairs } from "./assets/features/fourth-section/emailNotificationImages.js";

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
    images: membersGroupsStoryImages,
  },
  {
    eyebrow: "Make it yours",
    title: "Build a check-in flow that fits the room.",
    body: "Every Group gets its own kiosk experience. Choose how people identify themselves, which actions they can take, and how the kiosk looks and speaks to participants.",
    points: ["Member list or input mode", "Themes, messages, and display options", "A dedicated kiosk per Group"],
    label: "Configurable Group kiosk",
    caption: "A future screenshot will show kiosk configuration and presentation options here.",
    demo: configurableFlowDemo,
  },
  {
    type: "group-email",
    eyebrow: "Email & notifications",
    title: "Let every Group communicate from the right inbox.",
    body: "A school, café, office, or club can keep its communication distinct without leaving the workspace. Each Group or Structured Group chooses its own sender, recipients, forwarding, and action-based notification rules.",
    points: [
      "Gmail, Microsoft / Outlook, Yahoo, or custom SMTP",
      "A dedicated sender or business email for each Group",
      "Participant emails on or off independently",
      "Check-in, check-out, break, or combined notification triggers",
      "Forwarding emails and up to three participant recipients where supported",
    ],
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

function FeaturesShowcaseCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(media.matches);
    updatePreference();
    media.addEventListener?.("change", updatePreference);
    return () => media.removeEventListener?.("change", updatePreference);
  }, []);

  useEffect(() => {
    if (reducedMotion) return undefined;
    const timer = window.setTimeout(() => {
      setActiveIndex((current) => (current + 1) % featuresShowcaseImages.length);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [activeIndex, reducedMotion]);

  function move(direction) {
    setActiveIndex((current) => (
      (current + direction + featuresShowcaseImages.length) % featuresShowcaseImages.length
    ));
  }

  return (
    <figure
      className="features-showcase-carousel"
      role="region"
      aria-roledescription="carousel"
      aria-label="CheckStation workspace overview"
    >
      <div className="features-showcase-carousel-stage">
        {featuresShowcaseImages.map((image, index) => (
          <img
            key={image.src}
            className={index === activeIndex ? "is-active" : ""}
            src={image.src}
            alt={index === activeIndex ? image.alt : ""}
            width="1600"
            height="900"
            loading={index === 0 ? "eager" : "lazy"}
            decoding="async"
            aria-hidden={index === activeIndex ? undefined : "true"}
          />
        ))}
        <button type="button" className="features-showcase-arrow features-showcase-arrow-left" aria-label="Previous workspace image" onClick={() => move(-1)}><span aria-hidden="true">‹</span></button>
        <button type="button" className="features-showcase-arrow features-showcase-arrow-right" aria-label="Next workspace image" onClick={() => move(1)}><span aria-hidden="true">›</span></button>
      </div>
      <figcaption className="features-showcase-status" aria-live="polite">{featuresShowcaseImages[activeIndex].label}</figcaption>
    </figure>
  );
}

function FeaturesStoryCarousel({ images, label }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(media.matches);
    updatePreference();
    media.addEventListener?.("change", updatePreference);
    return () => media.removeEventListener?.("change", updatePreference);
  }, []);

  useEffect(() => {
    if (reducedMotion) return undefined;
    const timer = window.setTimeout(() => {
      setActiveIndex((current) => (current + 1) % images.length);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [activeIndex, images.length, reducedMotion]);

  function move(direction) {
    setActiveIndex((current) => (current + direction + images.length) % images.length);
  }

  return (
    <figure className="features-story-image features-story-carousel" role="region" aria-roledescription="carousel" aria-label={label}>
      <div className="features-story-carousel-stage">
        {images.map((image, index) => (
          <img
            key={image.src}
            className={index === activeIndex ? "is-active" : ""}
            src={image.src}
            alt={index === activeIndex ? image.alt : ""}
            width="1200"
            height="900"
            loading="lazy"
            decoding="async"
            aria-hidden={index === activeIndex ? undefined : "true"}
          />
        ))}
        <button type="button" className="features-story-carousel-arrow features-story-carousel-arrow-left" aria-label="Previous Members and Groups image" onClick={() => move(-1)}><span aria-hidden="true">‹</span></button>
        <button type="button" className="features-story-carousel-arrow features-story-carousel-arrow-right" aria-label="Next Members and Groups image" onClick={() => move(1)}><span aria-hidden="true">›</span></button>
      </div>
      <figcaption className="features-story-carousel-status" aria-live="polite">{images[activeIndex].label}</figcaption>
    </figure>
  );
}

function FeaturesStoryVideo({ demo, label }) {
  const frameRef = useRef(null);
  const videoRef = useRef(null);
  const switchTimerRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [inPlaybackRange, setInPlaybackRange] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(media.matches);
    updatePreference();
    media.addEventListener?.("change", updatePreference);
    return () => media.removeEventListener?.("change", updatePreference);
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;
    if (!("IntersectionObserver" in window)) {
      setInPlaybackRange(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setInPlaybackRange(entry.isIntersecting),
      { rootMargin: "240px 0px", threshold: 0 },
    );
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || reducedMotion) return undefined;
    if (inPlaybackRange) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
    return undefined;
  }, [activeIndex, inPlaybackRange, reducedMotion]);

  useEffect(() => () => window.clearTimeout(switchTimerRef.current), []);

  function continueSequence() {
    setIsTransitioning(true);
    window.clearTimeout(switchTimerRef.current);
    switchTimerRef.current = window.setTimeout(() => {
      setActiveIndex((current) => (current + 1) % demo.clips.length);
    }, 220);
  }

  function revealCurrentClip() {
    setIsTransitioning(false);
    if (inPlaybackRange) videoRef.current?.play().catch(() => {});
  }

  return (
    <figure ref={frameRef} className="features-story-image features-story-video" role="group" aria-label={label}>
      <div className="features-story-video-frame">
        <img className="features-story-video-poster" src={demo.poster} alt={reducedMotion ? "CheckStation Kiosk Editor configuring a Group kiosk." : ""} width="1128" height="720" aria-hidden={reducedMotion ? undefined : "true"} />
        {!reducedMotion && (
          <video
            ref={videoRef}
            className={isTransitioning ? "is-transitioning" : ""}
            src={demo.clips[activeIndex].src}
            poster={demo.poster}
            autoPlay={inPlaybackRange}
            muted
            playsInline
            preload="metadata"
            disablePictureInPicture
            controlsList="nodownload noplaybackrate noremoteplayback"
            onEnded={continueSequence}
            onLoadedData={revealCurrentClip}
          />
        )}
        <span className="features-story-video-status" aria-live="polite">{demo.clips[activeIndex].label}</span>
        <span className="features-story-video-dots" aria-hidden="true">{demo.clips.map((clip, index) => <i className={index === activeIndex ? "is-active" : ""} key={clip.src} />)}</span>
      </div>
    </figure>
  );
}

function FeaturesEmailGallery() {
  return (
    <div className="features-email-flow" aria-label="Group email and notification examples">
      {emailNotificationPairs.map((pair) => (
        <div className="features-email-pair" role="group" aria-label={pair.label} key={pair.label}>
          {pair.images.map((image) => (
            <figure className="features-email-window" key={image.src}>
              <span className="features-email-window-chrome" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <img
                src={image.src}
                alt={image.alt}
                width="800"
                height="600"
                loading="lazy"
                decoding="async"
              />
            </figure>
          ))}
        </div>
      ))}
    </div>
  );
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
        <PageTitle title="Features — CheckStation" description="Configure check-in your way, run participant-friendly kiosks, and keep a dependable record of every action." />

        <section className="features-hero" data-reveal>
          <div className="features-hero-copy">
            <p className="features-kicker">A clearer way to manage attendance</p>
            <h1>Check-in that works the way your organization works.</h1>
            <p className="features-hero-lead">CheckStation brings people, Groups, kiosk flows, and activity history together in one calm, configurable workspace — so your team can spend less time managing attendance and more time doing the work.</p>
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
              <span className="features-orbit-card-top"><span className="features-status-dot" /> CheckStation</span>
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
          <div className="features-section-heading"><p className="features-kicker">See the whole picture</p><h2>Everything your attendance workflow needs — without the busywork.</h2><p>Set up the experience once. Then give participants a simple way to take action and your team a reliable way to understand what happened.</p></div>
          <FeaturesShowcaseCarousel />
        </section>

        <section className="features-stories" aria-label="CheckStation capabilities">
          {FEATURE_STORIES.map((story, index) => (
            story.type === "group-email" ? (
              <article className={`features-story features-email-story features-story-${index % 2 ? "reverse" : "normal"}`} data-reveal key={story.title}>
                <FeaturesEmailGallery />
                <div className="features-story-copy features-email-copy">
                  <p className="features-kicker">{story.eyebrow}</p>
                  <h2>{story.title}</h2>
                  <p className="features-story-body">{story.body}</p>
                  <ul className="features-point-list features-email-capabilities">{story.points.map((point) => <li key={point}><CheckIcon />{point}</li>)}</ul>
                  <div className="features-email-examples">
                    <article><span>School Group</span><p>Send from the school email, notify parents on arrival or check-out, and forward copies to the director.</p></article>
                    <article><span>Café / staff Group</span><p>Use a different café business sender with its own staff notifications and forwarding rules.</p></article>
                  </div>
                </div>
              </article>
            ) : (
              <article className={`features-story features-story-${index % 2 ? "reverse" : "normal"}`} data-reveal key={story.title}>
                {story.images ? <FeaturesStoryCarousel images={story.images} label={story.label} /> : story.demo ? <FeaturesStoryVideo demo={story.demo} label={story.label} /> : <ProductImageSlot label={story.label} caption={story.caption} aspect="4 / 3" className="features-story-image" />}
                <div className="features-story-copy"><p className="features-kicker">{story.eyebrow}</p><h2>{story.title}</h2><p className="features-story-body">{story.body}</p><ul className="features-point-list">{story.points.map((point) => <li key={point}><CheckIcon />{point}</li>)}</ul></div>
              </article>
            )
          ))}
        </section>

        <section className="features-platform" data-reveal>
          <div className="features-platform-copy"><p className="features-kicker">Ready wherever work happens</p><h2>One check-in experience across every screen.</h2><p>CheckStation is designed for the browser, iPhone and iPad, Android phones and tablets, Mac, and Windows. Use the device that fits the space — at the front desk, in a classroom, or at a shared kiosk.</p><Link className="features-text-link" to="/how-it-works">Explore the workflow <span aria-hidden="true">→</span></Link></div>
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

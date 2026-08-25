/* Optimized Home marketing images — masters remain *.png beside these. */
import workflow480Avif from "./home-workflow-480.avif";
import workflow800Avif from "./home-workflow-800.avif";
import workflow1122Avif from "./home-workflow-1122.avif";
import workflow480Webp from "./home-workflow-480.webp";
import workflow800Webp from "./home-workflow-800.webp";
import workflow1122Webp from "./home-workflow-1122.webp";
import workflow480Jpg from "./home-workflow-480.jpg";
import workflow800Jpg from "./home-workflow-800.jpg";
import workflow1122Jpg from "./home-workflow-1122.jpg";

import setups480Avif from "./home-real-setups-480.avif";
import setups800Avif from "./home-real-setups-800.avif";
import setups1200Avif from "./home-real-setups-1200.avif";
import setups1448Avif from "./home-real-setups-1448.avif";
import setups480Webp from "./home-real-setups-480.webp";
import setups800Webp from "./home-real-setups-800.webp";
import setups1200Webp from "./home-real-setups-1200.webp";
import setups1448Webp from "./home-real-setups-1448.webp";
import setups480Jpg from "./home-real-setups-480.jpg";
import setups800Jpg from "./home-real-setups-800.jpg";
import setups1200Jpg from "./home-real-setups-1200.jpg";
import setups1448Jpg from "./home-real-setups-1448.jpg";

export const homeWorkflowImage = {
  alt: "Check Station workflow connecting members, groups, kiosk actions, and attendance history.",
  width: 1122,
  height: 1402,
  // Slot is ~40% of content column on desktop; full-bleed-ish on mobile.
  sizes: "(max-width: 720px) 100vw, (max-width: 960px) 92vw, 26rem",
  objectPosition: "center center",
  avifSrcSet: `${workflow480Avif} 480w, ${workflow800Avif} 800w, ${workflow1122Avif} 1122w`,
  webpSrcSet: `${workflow480Webp} 480w, ${workflow800Webp} 800w, ${workflow1122Webp} 1122w`,
  jpgSrcSet: `${workflow480Jpg} 480w, ${workflow800Jpg} 800w, ${workflow1122Jpg} 1122w`,
  fallbackSrc: workflow800Jpg,
};

export const homeRealSetupsImage = {
  alt: "Check Station used for check-in across schools, workplaces, communities, and events.",
  width: 1448,
  height: 1086,
  sizes: "(max-width: 720px) 100vw, (max-width: 960px) 92vw, 28rem",
  objectPosition: "center 40%",
  avifSrcSet: `${setups480Avif} 480w, ${setups800Avif} 800w, ${setups1200Avif} 1200w, ${setups1448Avif} 1448w`,
  webpSrcSet: `${setups480Webp} 480w, ${setups800Webp} 800w, ${setups1200Webp} 1200w, ${setups1448Webp} 1448w`,
  jpgSrcSet: `${setups480Jpg} 480w, ${setups800Jpg} 800w, ${setups1200Jpg} 1200w, ${setups1448Jpg} 1448w`,
  fallbackSrc: setups800Jpg,
};

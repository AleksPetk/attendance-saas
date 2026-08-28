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

import setups480Avif from "./home-real-setup-480.avif";
import setups800Avif from "./home-real-setup-800.avif";
import setups1200Avif from "./home-real-setup-1200.avif";
import setups1600Avif from "./home-real-setup-1600.avif";
import setups480Webp from "./home-real-setup-480.webp";
import setups800Webp from "./home-real-setup-800.webp";
import setups1200Webp from "./home-real-setup-1200.webp";
import setups1600Webp from "./home-real-setup-1600.webp";
import kioskSchool1200Webp from "./kiosk-school-1200.webp";
import kioskWarehouse1200Webp from "./kiosk-warehouse-1200.webp";
import kioskCafe1200Webp from "./kiosk-cafe-1200.webp";
import kioskOffice1200Webp from "./kiosk-office-1200.webp";
import kioskClub1200Webp from "./kiosk-club-1200.webp";
import workspaceDashboard1600Webp from "./home-workspace-dashboard-1600.webp";
import workspaceHistory1600Webp from "./home-workspace-history-1600.webp";
import workspaceMembers1600Webp from "./home-workspace-members-1600.webp";
import groupMail900Webp from "./home-groupmail-900.webp";
import notification900Webp from "./home-notification-900.webp";
import startQuicklyIcon from "./home-startQ-160.webp";
import fitWorkflowIcon from "./home-fitYour-160.webp";
import seeHistoryIcon from "./home-See-160.webp";

export const homeValueIcons = {
  startQuickly: startQuicklyIcon,
  fitWorkflow: fitWorkflowIcon,
  seeHistory: seeHistoryIcon,
};

export const homeWorkflowImage = {
  alt: "CheckStation workflow connecting members, groups, kiosk actions, and attendance history.",
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
  alt: "CheckStation used for check-in across schools, workplaces, communities, and events.",
  width: 1600,
  height: 1200,
  sizes: "(max-width: 720px) 100vw, (max-width: 960px) 92vw, 28rem",
  objectPosition: "center 40%",
  avifSrcSet: `${setups480Avif} 480w, ${setups800Avif} 800w, ${setups1200Avif} 1200w, ${setups1600Avif} 1600w`,
  webpSrcSet: `${setups480Webp} 480w, ${setups800Webp} 800w, ${setups1200Webp} 1200w, ${setups1600Webp} 1600w`,
  fallbackSrc: setups800Webp,
};

export const homeKioskStyleImages = {
  school: {
    alt: "A customized CheckStation school kiosk showing selectable classes.",
    width: 1200,
    height: 900,
    sizes: "(max-width: 900px) calc(100vw - 1.5rem), min(50vw, 38rem)",
    fallbackSrc: kioskSchool1200Webp,
  },
  warehouse: {
    alt: "A customized CheckStation warehouse kiosk with a participant code check-in flow.",
    width: 1200,
    height: 900,
    sizes: "(max-width: 900px) calc(100vw - 1.5rem), min(50vw, 38rem)",
    fallbackSrc: kioskWarehouse1200Webp,
  },
  cafe: {
    alt: "A customized CheckStation café kiosk showing selectable staff cards.",
    width: 1200,
    height: 900,
    sizes: "(max-width: 900px) calc(100vw - 1.5rem), min(50vw, 38rem)",
    fallbackSrc: kioskCafe1200Webp,
  },
  office: {
    alt: "A customized CheckStation office kiosk showing code cards for reception check-in.",
    width: 1200,
    height: 900,
    sizes: "(max-width: 900px) calc(100vw - 1.5rem), min(50vw, 38rem)",
    fallbackSrc: kioskOffice1200Webp,
  },
  club: {
    alt: "A customized CheckStation club kiosk with a branded participant check-in flow.",
    width: 1200,
    height: 900,
    sizes: "(max-width: 900px) calc(100vw - 1.5rem), min(50vw, 38rem)",
    fallbackSrc: kioskClub1200Webp,
  },
};

export const homeWorkspaceImages = [
  {
    src: workspaceDashboard1600Webp,
    alt: "CheckStation workspace dashboard with activity, totals, and quick actions.",
  },
  {
    src: workspaceHistory1600Webp,
    alt: "CheckStation workspace attendance history and report view.",
  },
  {
    src: workspaceMembers1600Webp,
    alt: "CheckStation workspace member management view.",
  },
];

export const homeGroupCommunicationImages = {
  sender: {
    alt: "CheckStation Group email sender settings with custom SMTP configuration.",
    width: 900,
    height: 1200,
    sizes: "(max-width: 900px) min(44vw, 18rem), min(22vw, 17rem)",
    fallbackSrc: groupMail900Webp,
  },
  notifications: {
    alt: "CheckStation notification and forwarding rules sending check-in messages to different recipients.",
    width: 900,
    height: 1200,
    sizes: "(max-width: 900px) min(44vw, 18rem), min(22vw, 17rem)",
    fallbackSrc: notification900Webp,
  },
};

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
import workflowJa900Webp from "./home-workflow-ja-900.webp";

import setups480Avif from "./home-real-setup-480.avif";
import setups800Avif from "./home-real-setup-800.avif";
import setups1200Avif from "./home-real-setup-1200.avif";
import setups1600Avif from "./home-real-setup-1600.avif";
import setups480Webp from "./home-real-setup-480.webp";
import setups800Webp from "./home-real-setup-800.webp";
import setups1200Webp from "./home-real-setup-1200.webp";
import setups1600Webp from "./home-real-setup-1600.webp";
import setupsJa1200Webp from "./home-real-setup-ja-1200.webp";
import kioskSchool1200Webp from "./kiosk-school-1200.webp";
import kioskWarehouse1200Webp from "./kiosk-warehouse-1200.webp";
import kioskCafe1200Webp from "./kiosk-cafe-1200.webp";
import kioskOffice1200Webp from "./kiosk-office-1200.webp";
import kioskClub1200Webp from "./kiosk-club-1200.webp";
import kioskSchoolJa1200Webp from "./kiosk-school-ja-1200.webp";
import kioskWarehouseJa1200Webp from "./kiosk-warehouse-ja-1200.webp";
import kioskCafeJa1200Webp from "./kiosk-cafe-ja-1200.webp";
import kioskOfficeJa1200Webp from "./kiosk-office-ja-1200.webp";
import kioskClubJa1200Webp from "./kiosk-club-ja-1200.webp";
import workspaceDashboard1600Webp from "./home-workspace-dashboard-1600.webp";
import workspaceHistory1600Webp from "./home-workspace-history-1600.webp";
import workspaceMembers1600Webp from "./home-workspace-members-1600.webp";
import workspaceDashboardJa1200Webp from "./home-workspace-dashboard-ja-1200.webp";
import workspaceMembersJa1200Webp from "./home-workspace-members-ja-1200.webp";
import workspaceGroupsJa1200Webp from "./home-workspace-groups-ja-1200.webp";
import workspaceHistoryJa1200Webp from "./home-workspace-history-ja-1200.webp";
import groupMail900Webp from "./home-groupmail-900.webp";
import notification900Webp from "./home-notification-900.webp";
import groupMailJa900Webp from "./home-groupmail-ja-900.webp";
import notificationJa900Webp from "./home-notification-ja-900.webp";
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

export const homeWorkflowJaImage = {
  alt: "メンバー、グループ、キオスク、アクション、履歴がつながるCheckStationの流れ。",
  width: 900,
  height: 1125,
  sizes: "(max-width: 720px) 100vw, (max-width: 960px) 92vw, 22rem",
  objectPosition: "center center",
  fallbackSrc: workflowJa900Webp,
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

export const homeRealSetupsJaImage = {
  alt: "学校、倉庫、カフェ、オフィスなど、さまざまな現場で使えるCheckStationの例。",
  width: 1200,
  height: 675,
  sizes: "(max-width: 900px) calc(100vw - 1.5rem), min(55vw, 40rem)",
  objectPosition: "center center",
  fallbackSrc: setupsJa1200Webp,
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

export const homeKioskStyleJaImages = {
  school: {
    alt: "学校向けにカスタマイズされたCheckStationキオスク。",
    width: 1200,
    height: 900,
    sizes: "(max-width: 900px) calc(100vw - 1.5rem), min(50vw, 38rem)",
    fallbackSrc: kioskSchoolJa1200Webp,
  },
  warehouse: {
    alt: "倉庫向けにカスタマイズされたCheckStationキオスク。",
    width: 1200,
    height: 900,
    sizes: "(max-width: 900px) calc(100vw - 1.5rem), min(50vw, 38rem)",
    fallbackSrc: kioskWarehouseJa1200Webp,
  },
  cafe: {
    alt: "カフェ向けにカスタマイズされたCheckStationキオスク。",
    width: 1200,
    height: 900,
    sizes: "(max-width: 900px) calc(100vw - 1.5rem), min(50vw, 38rem)",
    fallbackSrc: kioskCafeJa1200Webp,
  },
  office: {
    alt: "オフィス向けにカスタマイズされたCheckStationキオスク。",
    width: 1200,
    height: 900,
    sizes: "(max-width: 900px) calc(100vw - 1.5rem), min(50vw, 38rem)",
    fallbackSrc: kioskOfficeJa1200Webp,
  },
  club: {
    alt: "クラブ向けにカスタマイズされたCheckStationキオスク。",
    width: 1200,
    height: 900,
    sizes: "(max-width: 900px) calc(100vw - 1.5rem), min(50vw, 38rem)",
    fallbackSrc: kioskClubJa1200Webp,
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

export const homeWorkspaceJaImages = [
  {
    src: workspaceDashboardJa1200Webp,
    alt: "CheckStationワークスペースのダッシュボード。日々の状況と最近のアクティビティを確認できます。",
  },
  {
    src: workspaceMembersJa1200Webp,
    alt: "CheckStationワークスペースのメンバー管理画面。",
  },
  {
    src: workspaceGroupsJa1200Webp,
    alt: "CheckStationワークスペースのグループ管理画面。",
  },
  {
    src: workspaceHistoryJa1200Webp,
    alt: "CheckStationワークスペースの出席履歴画面。",
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

export const homeGroupCommunicationJaImages = {
  sender: {
    alt: "CheckStationの日本語メール送信元設定で、カスタムSMTPを設定する画面。",
    width: 900,
    height: 1200,
    sizes: "(max-width: 900px) min(44vw, 18rem), min(22vw, 17rem)",
    fallbackSrc: groupMailJa900Webp,
  },
  notifications: {
    alt: "チェックイン通知を保護者、管理者、グループ送信元へ届ける転送ルールの例。",
    width: 900,
    height: 1200,
    sizes: "(max-width: 900px) min(44vw, 18rem), min(22vw, 17rem)",
    fallbackSrc: notificationJa900Webp,
  },
};

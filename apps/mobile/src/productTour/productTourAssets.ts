/**
 * Mobile Product Tour slide assets + concise accessibility labels.
 * Approved marketing copy lives in the Desktop productTourContent module
 * (shared source of truth) — imported by ProductTourHost / MobileProductTour.
 */
import type { AppLocale } from "@checkstation/i18n";
import type { ImageSourcePropType } from "react-native";
import type { ProductTourSlideId } from "../../../desktop/src/productTour/productTourContent";

export type MobileTourSlideAsset = {
  id: ProductTourSlideId;
  source: ImageSourcePropType;
  width: number;
  height: number;
  alt: { en: string; ja: string };
};

export const MOBILE_TOUR_SLIDES: MobileTourSlideAsset[] = [
  {
    id: "platforms",
    source: require("./assets/slide-01.webp"),
    width: 1280,
    height: 800,
    alt: {
      en: "CheckStation workspace across browser, desktop, tablet, and phone",
      ja: "ブラウザ、デスクトップ、タブレット、スマートフォンのCheckStation",
    },
  },
  {
    id: "simplicity",
    source: require("./assets/slide-02.webp"),
    width: 1280,
    height: 800,
    alt: {
      en: "Clear CheckStation app navigation with reachable settings",
      ja: "わかりやすいCheckStationナビと設定",
    },
  },
  {
    id: "workspace",
    source: require("./assets/slide-03.webp"),
    width: 1280,
    height: 720,
    alt: {
      en: "Dashboard with reusable Members and Standard or Structured Groups",
      ja: "ダッシュボードとメンバー、スタンダード／構造化グループ",
    },
  },
  {
    id: "kiosk",
    source: require("./assets/slide-04.webp"),
    width: 1280,
    height: 960,
    alt: {
      en: "Custom branded kiosk preview with editor controls",
      ja: "ブランドに合わせたキオスクとエディタ",
    },
  },
  {
    id: "email",
    source: require("./assets/slide-05.webp"),
    width: 1280,
    height: 720,
    alt: {
      en: "Organization email sender options and message preview",
      ja: "組織のメール送信元とメッセージプレビュー",
    },
  },
  {
    id: "plans",
    source: require("./assets/slide-06.webp"),
    width: 1280,
    height: 960,
    alt: {
      en: "Basic, Plus, and Business plans with Basic highlighted free",
      ja: "Basic・Plus・Businessプラン。Basicは無料",
    },
  },
  {
    id: "security",
    source: require("./assets/slide-07.webp"),
    width: 1280,
    height: 960,
    alt: {
      en: "Owner and staff access with two-step verification",
      ja: "オーナーとスタッフのアクセス、二段階認証",
    },
  },
];

export function mobileTourAlt(id: ProductTourSlideId, locale: AppLocale): string {
  const slide = MOBILE_TOUR_SLIDES.find((item) => item.id === id);
  if (!slide) return "";
  return locale === "ja" ? slide.alt.ja : slide.alt.en;
}

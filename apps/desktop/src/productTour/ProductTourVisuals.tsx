import type { AppLocale } from "@checkstation/i18n";
import type { ProductTourSlideId } from "./productTourContent";

import slide01 from "./assets/slide-01.webp";
import slide02 from "./assets/slide-02.webp";
import slide03 from "./assets/slide-03.webp";
import slide04 from "./assets/slide-04.webp";
import slide05 from "./assets/slide-05.webp";
import slide06 from "./assets/slide-06.webp";
import slide07 from "./assets/slide-07.webp";

type VisualProps = {
  slideId: ProductTourSlideId;
  locale: AppLocale;
};

type SlideAsset = {
  src: string;
  width: number;
  height: number;
  alt: { en: string; ja: string };
};

const SLIDE_ASSETS: Record<ProductTourSlideId, SlideAsset> = {
  platforms: {
    src: slide01,
    width: 1600,
    height: 1000,
    alt: {
      en: "CheckStation workspace shown across browser, desktop, tablet, and phone",
      ja: "ブラウザ、デスクトップ、タブレット、スマートフォンでつながるCheckStationワークスペース",
    },
  },
  simplicity: {
    src: slide02,
    width: 1600,
    height: 1000,
    alt: {
      en: "CheckStation app window with clear navigation and reachable settings",
      ja: "わかりやすいナビと設定が整ったCheckStationアプリ画面",
    },
  },
  workspace: {
    src: slide03,
    width: 1600,
    height: 900,
    alt: {
      en: "Dashboard overview with reusable Members and Standard or Structured Groups",
      ja: "ダッシュボードと再利用できるメンバー、スタンダード／構造化グループの概要",
    },
  },
  kiosk: {
    src: slide04,
    width: 1600,
    height: 1200,
    alt: {
      en: "Custom branded kiosk preview beside kiosk editor controls",
      ja: "ブランドに合わせたキオスクプレビューとエディタ設定",
    },
  },
  email: {
    src: slide05,
    width: 1600,
    height: 900,
    alt: {
      en: "Organization email sender options and an automatic message preview",
      ja: "組織のメール送信元オプションと自動メッセージのプレビュー",
    },
  },
  plans: {
    src: slide06,
    width: 1600,
    height: 1200,
    alt: {
      en: "Basic, Plus, and Business plan cards with Basic highlighted as free",
      ja: "Basic・Plus・Businessのプランカード。Basicは無料として強調",
    },
  },
  security: {
    src: slide07,
    width: 1600,
    height: 1200,
    alt: {
      en: "Owner and staff access with two-step verification and kiosk separation",
      ja: "オーナーとスタッフのアクセス、二段階認証、キオスク分離のイメージ",
    },
  },
};

export function ProductTourVisual({ slideId, locale }: VisualProps) {
  const asset = SLIDE_ASSETS[slideId];
  if (!asset) return null;

  return (
    <figure
      className={`product-tour-image-frame ratio-${asset.width}x${asset.height}`}
      data-tour-asset={slideId}
    >
      <img
        src={asset.src}
        alt={locale === "ja" ? asset.alt.ja : asset.alt.en}
        width={asset.width}
        height={asset.height}
        decoding="async"
        draggable={false}
      />
    </figure>
  );
}

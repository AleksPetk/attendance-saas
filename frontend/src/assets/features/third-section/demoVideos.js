import jaPoster from "./ja-configurable-flow-poster.webp";
import poster from "./configurable-flow-poster.webp";

const FEATURE_MEDIA_BASE = "/media/features";

export const configurableFlowDemo = {
  poster,
  clips: [
    {
      src: `${FEATURE_MEDIA_BASE}/configurable-flow-1.mp4`,
      label: "Kiosk appearance configuration",
    },
    {
      src: `${FEATURE_MEDIA_BASE}/configurable-flow-2.mp4`,
      label: "Kiosk flow configuration",
    },
  ],
};

export const configurableFlowDemoJa = {
  poster: jaPoster,
  preloadNext: true,
  clips: [
    {
      src: `${FEATURE_MEDIA_BASE}/ja-configurable-flow-1.mp4`,
      label: "キオスクのデザイン設定",
    },
    {
      src: `${FEATURE_MEDIA_BASE}/ja-configurable-flow-2.mp4`,
      label: "キオスクフローの設定",
    },
  ],
};

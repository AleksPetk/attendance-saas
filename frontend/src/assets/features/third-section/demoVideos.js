import clipOne from "./configurable-flow-1.mp4";
import clipTwo from "./configurable-flow-2.mp4";
import jaClipOne from "./ja-configurable-flow-1.mp4";
import jaClipTwo from "./ja-configurable-flow-2.mp4";
import jaPoster from "./ja-configurable-flow-poster.webp";
import poster from "./configurable-flow-poster.webp";

export const configurableFlowDemo = {
  poster,
  clips: [
    { src: clipOne, label: "Kiosk appearance configuration" },
    { src: clipTwo, label: "Kiosk flow configuration" },
  ],
};

export const configurableFlowDemoJa = {
  poster: jaPoster,
  preloadNext: true,
  clips: [
    { src: jaClipOne, label: "キオスクのデザイン設定" },
    { src: jaClipTwo, label: "キオスクフローの設定" },
  ],
};

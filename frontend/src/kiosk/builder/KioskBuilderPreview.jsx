import { useEffect, useRef, useState } from "react";
import KioskRenderer from "../KioskRenderer.jsx";
import EditorSampleContent from "./EditorSampleContent.jsx";
import { clamp, cloneConfig } from "./builderUtils.js";

/**
 * Builder canvas: shared renderer + Main image-pan when Main section is active.
 * Header logo/title are alignment-based — no free-drag overlays.
 */
export default function KioskBuilderPreview({
  design,
  config,
  kioskBehavior,
  fakeParticipantCount = 12,
  onLiveConfig,
  onBeginGesture,
  onEndGesture,
  activeSection = null,
}) {
  const frameRef = useRef(null);
  const gestureRef = useRef(null);
  const [handles, setHandles] = useState(null);

  function measure() {
    const root = frameRef.current;
    if (!root) return;
    const main = root.querySelector(".kr-main");
    const frame = root.getBoundingClientRect();
    setHandles({
      main: main ? main.getBoundingClientRect() : null,
      frame,
    });
  }

  useEffect(() => {
    measure();
    const root = frameRef.current;
    if (!root) return undefined;
    const observer = new ResizeObserver(() => measure());
    observer.observe(root);
    return () => observer.disconnect();
  }, [
    config,
    design.header_logo_url,
    design.footer_logo_url,
    design.main_background_image_url,
    fakeParticipantCount,
    kioskBehavior,
  ]);

  function patchLive(mutator) {
    const next = cloneConfig(config);
    mutator(next);
    onLiveConfig(next);
  }

  function startImagePan(event) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    onBeginGesture();
    const main = frameRef.current?.querySelector(".kr-main");
    gestureRef.current = {
      kind: "image-pan",
      startX: event.clientX,
      startY: event.clientY,
      startConfig: cloneConfig(config),
      mainRect: main?.getBoundingClientRect() || null,
    };
  }

  function onPointerMove(event) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.kind !== "image-pan" || !gesture.mainRect) return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    const transform = gesture.startConfig.main.image_transform || {
      focal_x: 0.5,
      focal_y: 0.5,
      zoom: 1,
    };
    const focal_x = clamp(Number(transform.focal_x) - dx / gesture.mainRect.width, 0, 1);
    const focal_y = clamp(Number(transform.focal_y) - dy / gesture.mainRect.height, 0, 1);
    patchLive((cfg) => {
      cfg.main.image_transform = { ...transform, focal_x, focal_y };
    });
  }

  function onPointerUp() {
    if (!gestureRef.current) return;
    gestureRef.current = null;
    onEndGesture();
    measure();
  }

  const imageOn =
    config.main?.background?.mode === "image" && Boolean(design.main_background_image_url);
  const showMainTools = activeSection === "main" && imageOn && handles?.main;

  return (
    <div
      className="kb-preview-frame"
      ref={frameRef}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <KioskRenderer design={design} mode="editor" kioskBehavior={kioskBehavior}>
        <EditorSampleContent
          kioskBehavior={kioskBehavior}
          fakeParticipantCount={fakeParticipantCount}
        />
      </KioskRenderer>

      {showMainTools ? (
        <div
          className="kb-pan-layer"
          style={{
            left: handles.main.left - handles.frame.left,
            top: handles.main.top - handles.frame.top,
            width: handles.main.width,
            height: handles.main.height,
          }}
          onPointerDown={startImagePan}
        >
          <span className="kb-pan-hint">Drag to pan background</span>
        </div>
      ) : null}
    </div>
  );
}

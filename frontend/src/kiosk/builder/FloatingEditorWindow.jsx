import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_POS = { x: 16, y: 16 };
const EDITOR_WIDTH = 360;
const SAFE_MARGIN = 20;

function clampPosition(x, y, width, height) {
  const maxX = Math.max(SAFE_MARGIN, window.innerWidth - width - SAFE_MARGIN);
  const maxY = Math.max(SAFE_MARGIN, window.innerHeight - Math.min(height, window.innerHeight * 0.85) - SAFE_MARGIN);
  return {
    x: Math.min(maxX, Math.max(SAFE_MARGIN, x)),
    y: Math.min(maxY, Math.max(SAFE_MARGIN, y)),
  };
}

function sectionLabel(name) {
  return name[0].toUpperCase() + name.slice(1);
}

/**
 * Single floating kiosk builder editor window.
 * Position / minimize are UI-only — not Undo history.
 */
export default function FloatingEditorWindow({
  groupName,
  sections,
  activeSection,
  onSectionChange,
  minimized,
  onMinimize,
  onRestore,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  dirty,
  saving,
  saveError,
  onCancel,
  onSave,
  children,
}) {
  const panelRef = useRef(null);
  const dragRef = useRef(null);
  const [pos, setPos] = useState(DEFAULT_POS);
  const [dragging, setDragging] = useState(false);

  const reclamp = useCallback(() => {
    const el = panelRef.current;
    if (!el || minimized) return;
    const rect = el.getBoundingClientRect();
    setPos((current) =>
      clampPosition(current.x, current.y, rect.width || EDITOR_WIDTH, rect.height || 280),
    );
  }, [minimized]);

  useEffect(() => {
    if (minimized) return undefined;
    const frame = window.requestAnimationFrame(reclamp);
    window.addEventListener("resize", reclamp);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", reclamp);
    };
  }, [reclamp, minimized]);

  function onDragPointerDown(event) {
    if (event.button !== 0) return;
    if (window.matchMedia("(max-width: 960px)").matches) return;
    const el = panelRef.current;
    if (!el) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = el.getBoundingClientRect();
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      origX: pos.x,
      origY: pos.y,
      width: rect.width,
      height: rect.height,
    };
    setDragging(true);
  }

  function onDragPointerMove(event) {
    const drag = dragRef.current;
    if (!drag) return;
    setPos(
      clampPosition(
        drag.origX + (event.clientX - drag.startX),
        drag.origY + (event.clientY - drag.startY),
        drag.width,
        drag.height,
      ),
    );
  }

  function onDragPointerUp(event) {
    if (!dragRef.current) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
    dragRef.current = null;
    setDragging(false);
    reclamp();
  }

  if (minimized) {
    return (
      <button
        type="button"
        className="kb-corner-pill"
        onClick={onRestore}
        aria-label={`Edit kiosk — ${sectionLabel(activeSection)}. Restore editor.`}
      >
        <span className="kb-corner-pill-icon" aria-hidden="true">
          ✎
        </span>
        <span>Edit kiosk</span>
        <span className="kb-corner-pill-section">{sectionLabel(activeSection)}</span>
      </button>
    );
  }

  const statusLabel = saving ? "Saving…" : dirty ? "Unsaved" : "Saved";

  return (
    <aside
      ref={panelRef}
      className={`kb-editor-window ${dragging ? "dragging" : ""}`}
      style={{ left: pos.x, top: pos.y }}
      aria-label="Kiosk builder editor"
    >
      <div
        className="kb-editor-drag"
        onPointerDown={onDragPointerDown}
        onPointerMove={onDragPointerMove}
        onPointerUp={onDragPointerUp}
        onPointerCancel={onDragPointerUp}
      >
        <span className="kb-editor-grip" aria-hidden="true">
          ⋮⋮
        </span>
        <div className="kb-editor-drag-copy">
          <strong>Kiosk editor</strong>
          {groupName ? <span className="kb-editor-group">{groupName}</span> : null}
        </div>
        <button
          type="button"
          className="kb-tool-btn kb-editor-minimize"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onMinimize}
          aria-label="Minimize editor"
        >
          Minimize
        </button>
      </div>

      <div className="kb-editor-sections" role="tablist" aria-label="Kiosk sections">
        {sections.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={activeSection === name}
            className={`kb-editor-section-btn ${activeSection === name ? "active" : ""}`}
            onClick={() => onSectionChange(name)}
          >
            {sectionLabel(name)}
          </button>
        ))}
      </div>

      <div className="kb-editor-body">{children}</div>

      {saveError ? <p className="kb-editor-error">{saveError}</p> : null}

      <div className="kb-editor-footer">
        <div className="kb-editor-footer-row">
          <button
            type="button"
            className="kb-tool-btn kb-tool-compact"
            disabled={!canUndo}
            onClick={onUndo}
            aria-label="Undo"
          >
            <span className="kb-tool-icon" aria-hidden="true">
              ↩
            </span>
            <span className="kb-tool-label">Undo</span>
          </button>
          <button
            type="button"
            className="kb-tool-btn kb-tool-compact"
            disabled={!canRedo}
            onClick={onRedo}
            aria-label="Redo"
          >
            <span className="kb-tool-icon" aria-hidden="true">
              ↪
            </span>
            <span className="kb-tool-label">Redo</span>
          </button>
          <span className={`kb-editor-status ${dirty || saving ? "unsaved" : "saved"}`}>
            {statusLabel}
          </span>
        </div>
        <div className="kb-editor-footer-row kb-editor-footer-actions">
          <button type="button" className="kb-tool-btn" onClick={onCancel} aria-label="Cancel">
            Cancel
          </button>
          <button
            type="button"
            className="kb-tool-btn kb-tool-primary"
            disabled={!dirty || saving}
            onClick={onSave}
            aria-label={saving ? "Saving" : "Save"}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </aside>
  );
}

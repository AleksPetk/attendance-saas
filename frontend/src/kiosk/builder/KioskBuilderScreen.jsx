import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api.js";
import { LoadingState } from "../../components.jsx";
import CardTemplatePicker from "./CardTemplatePicker.jsx";
import ColorField from "./ColorField.jsx";
import FloatingEditorWindow from "./FloatingEditorWindow.jsx";
import GradientField from "./GradientField.jsx";
import InputTemplatePicker from "./InputTemplatePicker.jsx";
import KioskBuilderPreview from "./KioskBuilderPreview.jsx";
import { kioskEditorSections } from "./kioskEditorSections.js";
import TextStyleEditor from "./TextStyleEditor.jsx";
import { EMPTY_MEDIA, useEditorHistory } from "./useEditorHistory.js";
import {
  setWorkspaceLeaveChecker,
  skipNextWorkspaceLeaveCheck,
} from "./workspaceLeaveGuard.js";
import {
  FILE_SESSION_CAP,
  cloneConfig,
  ensureHeaderLogo,
  formatApiError,
  isAllowedImageFile,
  normalizeDesignMediaConfig,
  validateWorkingConfig,
} from "./builderUtils.js";
import { resolveKioskMediaUrl } from "../kioskMedia.js";
import {
  patchMainWithCardTemplate,
  resolveCardTemplate,
} from "../cardTemplates.js";
import {
  patchMainWithInputTemplate,
  resolveInputTemplate,
} from "../inputTemplates.js";
import {
  DEFAULT_FAKE_PARTICIPANT_COUNT,
  FAKE_PARTICIPANT_COUNTS,
} from "./fakeParticipants.js";
import "./kioskBuilder.css";

function modeLabel(mode, t) {
  if (mode === "solid") return t("builder.solid");
  if (mode === "gradient") return t("builder.gradient");
  if (mode === "image") return t("builder.image");
  return mode;
}

function alignmentLabel(alignment, t) {
  if (alignment === "left") return t("builder.left");
  if (alignment === "center") return t("builder.center");
  if (alignment === "right") return t("builder.right");
  return alignment[0].toUpperCase() + alignment.slice(1);
}

function EditorGroup({ title, children }) {
  return (
    <div className="kb-group">
      <h4 className="kb-group-title">{title}</h4>
      <div className="kb-group-body">{children}</div>
    </div>
  );
}

function BackgroundEditor({ background, modes, onChange, onGestureStart, onGestureEnd, t }) {
  const mode = background?.mode || "solid";
  return (
    <EditorGroup title={t("builder.background")}>
      <div className="kb-chip-row" role="group" aria-label={t("builder.backgroundModeAria")}>
        {modes.map((item) => (
          <button
            key={item}
            type="button"
            className={`kb-chip ${mode === item ? "active" : ""}`}
            onClick={() => {
              const next = { ...background, mode: item };
              if (item === "gradient" && !next.color2) next.color2 = "#0F172A";
              onChange(next);
            }}
          >
            {modeLabel(item, t)}
          </button>
        ))}
      </div>
      {mode === "solid" ? (
        <ColorField
          label={t("builder.backgroundColor")}
          value={background?.color || "#2563EB"}
          onChange={(color, meta) => onChange({ ...background, mode: "solid", color }, meta)}
          onGestureStart={onGestureStart}
          onGestureEnd={onGestureEnd}
        />
      ) : null}
      {mode === "gradient" ? (
        <GradientField
          background={background}
          onChange={onChange}
          onGestureStart={onGestureStart}
          onGestureEnd={onGestureEnd}
        />
      ) : null}
    </EditorGroup>
  );
}

function KioskBuilderEditor({ session, groupId, initial, onNavigate }) {
  const { t } = useTranslation("kiosk");
  const kioskBehavior = initial.kioskBehavior || { mode: "card" };
  const groupType = initial.groupType === "structured" ? "structured" : "standard";
  const kioskMode =
    groupType === "structured"
      ? "card"
      : kioskBehavior.mode === "input"
        ? "input"
        : "card";
  const availableSections = useMemo(
    () => kioskEditorSections({ mode: kioskMode, groupType }),
    [kioskMode, groupType],
  );
  const filesRef = useRef(new Map());
  const [savedLogoUrl, setSavedLogoUrl] = useState(
    () => resolveKioskMediaUrl(initial.header_logo_url),
  );
  const [savedFooterLogoUrl, setSavedFooterLogoUrl] = useState(
    () => resolveKioskMediaUrl(initial.footer_logo_url),
  );
  const [savedBgUrl, setSavedBgUrl] = useState(
    () => resolveKioskMediaUrl(initial.main_background_image_url),
  );
  const [groupName] = useState(initial.groupName || t("builder.groupFallback"));
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState("header");
  const [editorMinimized, setEditorMinimized] = useState(false);
  const [fakeParticipantCount, setFakeParticipantCount] = useState(
    DEFAULT_FAKE_PARTICIPANT_COUNT,
  );
  const {
    config,
    media,
    dirty,
    canUndo,
    canRedo,
    commit,
    beginGesture,
    updateLive,
    endGesture,
    undo,
    redo,
    referencedMediaKeys,
  } = useEditorHistory({
    config: initial.config,
    media: EMPTY_MEDIA,
  });

  useEffect(() => {
    return () => {
      filesRef.current.forEach((entry) => URL.revokeObjectURL(entry.url));
      filesRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!dirty) return undefined;
    function onBeforeUnload(event) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const skipLeaveConfirmRef = useRef(false);

  useEffect(() => {
    setWorkspaceLeaveChecker(() => {
      if (skipLeaveConfirmRef.current) return true;
      if (!dirty) return true;
      return window.confirm(t("builder.leaveConfirm"));
    });
    return () => setWorkspaceLeaveChecker(null);
  }, [dirty]);

  useEffect(() => {
    if (!availableSections.includes(activeSection)) {
      setActiveSection("header");
    }
  }, [activeSection, availableSections]);

  const rememberFile = useCallback((file) => {
    const key = `${file.name}-${file.size}-${Date.now()}`;
    const url = URL.createObjectURL(file);
    filesRef.current.set(key, { file, url });
    const keep = referencedMediaKeys();
    keep.add(key);
    if (filesRef.current.size > FILE_SESSION_CAP) {
      for (const [oldKey, entry] of filesRef.current) {
        if (filesRef.current.size <= FILE_SESSION_CAP) break;
        if (keep.has(oldKey)) continue;
        URL.revokeObjectURL(entry.url);
        filesRef.current.delete(oldKey);
      }
    }
    return key;
  }, [referencedMediaKeys]);

  function previewLogoUrl() {
    if (media.logoKey && filesRef.current.get(media.logoKey)) {
      return resolveKioskMediaUrl(filesRef.current.get(media.logoKey).url, {
        allowBlob: true,
      });
    }
    if (media.removeLogo) return "";
    return resolveKioskMediaUrl(savedLogoUrl);
  }

  function previewFooterLogoUrl() {
    if (media.footerLogoKey && filesRef.current.get(media.footerLogoKey)) {
      return resolveKioskMediaUrl(filesRef.current.get(media.footerLogoKey).url, {
        allowBlob: true,
      });
    }
    if (media.removeFooterLogo) return "";
    return resolveKioskMediaUrl(savedFooterLogoUrl);
  }

  function previewBgUrl() {
    if (media.bgKey && filesRef.current.get(media.bgKey)) {
      return resolveKioskMediaUrl(filesRef.current.get(media.bgKey).url, {
        allowBlob: true,
      });
    }
    if (media.removeBg) return "";
    return resolveKioskMediaUrl(savedBgUrl);
  }

  function apply(mutator, meta) {
    const next = {
      config: cloneConfig(config),
      media: { ...media },
    };
    mutator(next);
    next.config.header = { ...(next.config.header || {}), enabled: true };
    next.config.footer = { ...(next.config.footer || {}), enabled: true };
    if (meta?.previewOnly) {
      beginGesture();
      updateLive(next);
      return;
    }
    commit(next);
  }

  function onLiveConfig(nextConfig) {
    const forced = cloneConfig(nextConfig);
    forced.header = { ...(forced.header || {}), enabled: true };
    forced.footer = { ...(forced.footer || {}), enabled: true };
    updateLive({ config: forced, media });
  }

  function pickImage(kind, file) {
    const check = isAllowedImageFile(file);
    if (!check.ok) {
      setSaveError(check.error);
      return;
    }
    setSaveError("");
    const key = rememberFile(file);
    apply((next) => {
      if (kind === "logo") {
        next.media.logoKey = key;
        next.media.removeLogo = false;
        next.config = ensureHeaderLogo(next.config);
      } else if (kind === "footerLogo") {
        next.media.footerLogoKey = key;
        next.media.removeFooterLogo = false;
        if (!next.config.footer.logo) {
          next.config.footer.logo = { alignment: "left", size: 0.75 };
        }
      } else {
        next.media.bgKey = key;
        next.media.removeBg = false;
        next.config.main.background.mode = "image";
      }
    });
  }

  async function onSave() {
    const saveConfig = cloneConfig(config);
    saveConfig.header = { ...(saveConfig.header || {}), enabled: true };
    saveConfig.footer = { ...(saveConfig.footer || {}), enabled: true };
    const issues = validateWorkingConfig(saveConfig);
    if (issues.length) {
      setSaveError(issues[0]);
      return;
    }
    setSaving(true);
    setSaveError("");
    const formData = new FormData();
    formData.append("config", JSON.stringify(saveConfig));
    if (media.logoKey) {
      formData.append("header_logo", filesRef.current.get(media.logoKey).file);
    } else if (media.removeLogo) {
      formData.append("remove_header_logo", "true");
    }
    if (media.footerLogoKey) {
      formData.append("footer_logo", filesRef.current.get(media.footerLogoKey).file);
    } else if (media.removeFooterLogo) {
      formData.append("remove_footer_logo", "true");
    }
    if (media.bgKey) {
      formData.append("main_background_image", filesRef.current.get(media.bgKey).file);
    } else if (media.removeBg) {
      formData.append("remove_main_background_image", "true");
    }
    try {
      const result = await api.updateGroupKioskDesign(session, groupId, formData);
      const data = result.data;
      setSavedLogoUrl(resolveKioskMediaUrl(data.header_logo_url));
      setSavedFooterLogoUrl(resolveKioskMediaUrl(data.footer_logo_url));
      setSavedBgUrl(resolveKioskMediaUrl(data.main_background_image_url));
      filesRef.current.forEach((entry) => URL.revokeObjectURL(entry.url));
      filesRef.current.clear();
      skipLeaveConfirmRef.current = true;
      skipNextWorkspaceLeaveCheck();
      onNavigate({ name: "group-detail", groupId });
    } catch (error) {
      setSaveError(formatApiError(error));
    } finally {
      setSaving(false);
    }
  }

  function onCancel() {
    if (dirty && !window.confirm(t("builder.discardConfirm"))) return;
    skipLeaveConfirmRef.current = true;
    skipNextWorkspaceLeaveCheck();
    onNavigate({ name: "group-detail", groupId });
  }

  const design = {
    config: {
      ...config,
      header: { ...(config.header || {}), enabled: true },
      footer: { ...(config.footer || {}), enabled: true },
    },
    header_logo_url: previewLogoUrl(),
    footer_logo_url: previewFooterLogoUrl(),
    main_background_image_url: previewBgUrl(),
  };

  const header = design.config.header;
  const main = design.config.main;
  const footer = design.config.footer;
  const footerLine =
    Array.isArray(footer.text?.lines) && footer.text.lines[0]
      ? footer.text.lines[0]
      : "";
  const headerAlign = ["left", "center", "right"].includes(header.alignment)
    ? header.alignment
    : "left";
  const headerLogoSize = Number(header.logo?.size);
  const headerLogoSizeSafe = Number.isFinite(headerLogoSize)
    ? Math.min(1, Math.max(0.35, headerLogoSize))
    : 0.75;
  const footerLogoAlign = ["left", "center", "right"].includes(footer.logo?.alignment)
    ? footer.logo.alignment
    : "left";
  const footerLogoSize = Number(footer.logo?.size);
  const footerLogoSizeSafe = Number.isFinite(footerLogoSize)
    ? Math.min(1, Math.max(0.35, footerLogoSize))
    : 0.75;

  return (
    <div className="kb-fullscreen">
      <div className="kb-canvas" data-tutorial-target="kiosk-design-preview">
        <KioskBuilderPreview
          design={design}
          config={design.config}
          kioskBehavior={kioskBehavior}
          groupType={groupType}
          fakeParticipantCount={fakeParticipantCount}
          onLiveConfig={onLiveConfig}
          onBeginGesture={beginGesture}
          onEndGesture={endGesture}
          activeSection={activeSection}
        />
      </div>

      <div className="kb-chrome">
        <FloatingEditorWindow
          groupName={groupName}
          sections={availableSections}
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          minimized={editorMinimized}
          onMinimize={() => setEditorMinimized(true)}
          onRestore={() => setEditorMinimized(false)}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={undo}
          onRedo={redo}
          dirty={dirty}
          saving={saving}
          saveError={saveError}
          onCancel={onCancel}
          onSave={onSave}
        >
              {activeSection === "header" ? (
                <section className="kb-panel">
                  <BackgroundEditor
                    background={header.background}
                    modes={["solid", "gradient"]}
                    onChange={(background, meta) =>
                      apply((next) => {
                        next.config.header.background = background;
                      }, meta)
                    }
                    onGestureStart={beginGesture}
                    onGestureEnd={endGesture}
                    t={t}
                  />
                  <EditorGroup title={t("builder.contentAlignment")}>
                    <div className="kb-chip-row" role="group" aria-label={t("builder.headerAlignmentAria")}>
                      {["left", "center", "right"].map((alignment) => (
                        <button
                          key={alignment}
                          type="button"
                          className={`kb-chip ${headerAlign === alignment ? "active" : ""}`}
                          aria-pressed={headerAlign === alignment}
                          onClick={() =>
                            apply((next) => {
                              next.config.header.alignment = alignment;
                            })
                          }
                        >
                          {alignmentLabel(alignment, t)}
                        </button>
                      ))}
                    </div>
                    <p className="kb-hint">
                      {t("builder.alignmentHint")}
                    </p>
                  </EditorGroup>
                  <EditorGroup title={t("builder.content")}>
                    <label className="kb-label">
                      {t("builder.title")}
                      <input
                        type="text"
                        maxLength={150}
                        placeholder={t("builder.optionalHeaderTitle")}
                        value={header.title?.text || ""}
                        onFocus={beginGesture}
                        onChange={(event) =>
                          apply((next) => {
                            next.config.header.title.text = event.target.value;
                          }, { previewOnly: true })
                        }
                        onBlur={endGesture}
                      />
                    </label>
                  </EditorGroup>
                  <TextStyleEditor
                    label={t("builder.titleStyle")}
                    text={header.title}
                    onChange={(text, meta) =>
                      apply((next) => {
                        next.config.header.title = { ...next.config.header.title, ...text };
                      }, meta)
                    }
                    onGestureStart={beginGesture}
                    onGestureEnd={endGesture}
                    t={t}
                  />
                  <EditorGroup title={t("builder.logo")}>
                    {previewLogoUrl() ? (
                      <img className="kb-media-thumb" src={previewLogoUrl()} alt="" />
                    ) : (
                      <p className="kb-hint">{t("builder.noLogo")}</p>
                    )}
                    <div className="kb-chip-row">
                      <label className="kb-file-btn">
                        {previewLogoUrl() ? t("builder.replaceLogo") : t("builder.uploadLogo")}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/gif,image/webp"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            if (file) pickImage("logo", file);
                          }}
                        />
                      </label>
                      {previewLogoUrl() ? (
                        <button
                          type="button"
                          className="kb-chip"
                          onClick={() =>
                            apply((next) => {
                              next.media.logoKey = null;
                              next.media.removeLogo = true;
                              next.config.header.logo = null;
                            })
                          }
                        >
                          {t("builder.removeLogo")}
                        </button>
                      ) : null}
                    </div>
                    {previewLogoUrl() ? (
                      <div className="kb-slider-field">
                        <div className="kb-slider-head">
                          <span className="kb-slider-label">{t("builder.logoSize")}</span>
                          <span className="kb-slider-value">
                            {Math.round(headerLogoSizeSafe * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0.35"
                          max="1"
                          step="0.05"
                          value={headerLogoSizeSafe}
                          aria-label={t("builder.headerLogoSizeAria")}
                          onPointerDown={beginGesture}
                          onChange={(event) =>
                            apply((next) => {
                              next.config.header.logo = {
                                ...(next.config.header.logo || {}),
                                size: Number(event.target.value),
                              };
                            }, { previewOnly: true })
                          }
                          onPointerUp={endGesture}
                        />
                      </div>
                    ) : null}
                  </EditorGroup>
                </section>
              ) : null}

              {activeSection === "main" ? (
                <section className="kb-panel">
                  <BackgroundEditor
                    background={main.background}
                    modes={["solid", "gradient", "image"]}
                    onChange={(background, meta) =>
                      apply((next) => {
                        next.config.main.background = background;
                      }, meta)
                    }
                    onGestureStart={beginGesture}
                    onGestureEnd={endGesture}
                    t={t}
                  />
                  {main.background?.mode === "image" ? (
                    <EditorGroup title={t("builder.backgroundImage")}>
                      {previewBgUrl() ? (
                        <img className="kb-media-thumb wide" src={previewBgUrl()} alt="" />
                      ) : (
                        <p className="kb-hint">{t("builder.noBackgroundImage")}</p>
                      )}
                      <div className="kb-chip-row">
                        <label className="kb-file-btn">
                          {previewBgUrl() ? t("builder.replaceImage") : t("builder.uploadImage")}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/gif,image/webp"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              event.target.value = "";
                              if (file) pickImage("bg", file);
                            }}
                          />
                        </label>
                        {previewBgUrl() ? (
                          <button
                            type="button"
                            className="kb-chip"
                            onClick={() =>
                              apply((next) => {
                                next.media.bgKey = null;
                                next.media.removeBg = true;
                                next.config.main.background.mode = "solid";
                              })
                            }
                          >
                            {t("builder.removeImage")}
                          </button>
                        ) : null}
                      </div>
                      {previewBgUrl() ? (
                        <>
                          <p className="kb-hint">
                            {t("builder.panHint")}
                          </p>
                          <div className="kb-slider-field">
                            <div className="kb-slider-head">
                              <span className="kb-slider-label">{t("builder.backgroundZoom")}</span>
                              <span className="kb-slider-value">
                                {(Number(main.image_transform?.zoom) || 1).toFixed(2)}×
                              </span>
                            </div>
                            <input
                              type="range"
                              min="1"
                              max="5"
                              step="0.05"
                              value={main.image_transform?.zoom || 1}
                              aria-label={t("builder.backgroundZoomAria")}
                              onPointerDown={beginGesture}
                              onPointerUp={endGesture}
                              onChange={(event) =>
                                apply((next) => {
                                  next.config.main.image_transform = {
                                    ...next.config.main.image_transform,
                                    zoom: Number(event.target.value),
                                  };
                                }, { previewOnly: true })
                              }
                            />
                          </div>
                          <div className="kb-slider-field">
                            <div className="kb-slider-head">
                              <span className="kb-slider-label">{t("builder.horizontalPosition")}</span>
                              <span className="kb-slider-value">
                                {Math.round((main.image_transform?.focal_x ?? 0.5) * 100)}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.01"
                              value={main.image_transform?.focal_x ?? 0.5}
                              aria-label={t("builder.horizontalPositionAria")}
                              onPointerDown={beginGesture}
                              onPointerUp={endGesture}
                              onChange={(event) =>
                                apply((next) => {
                                  next.config.main.image_transform = {
                                    ...next.config.main.image_transform,
                                    focal_x: Number(event.target.value),
                                  };
                                }, { previewOnly: true })
                              }
                            />
                          </div>
                          <div className="kb-slider-field">
                            <div className="kb-slider-head">
                              <span className="kb-slider-label">{t("builder.verticalPosition")}</span>
                              <span className="kb-slider-value">
                                {Math.round((main.image_transform?.focal_y ?? 0.5) * 100)}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.01"
                              value={main.image_transform?.focal_y ?? 0.5}
                              aria-label={t("builder.verticalPositionAria")}
                              onPointerDown={beginGesture}
                              onPointerUp={endGesture}
                              onChange={(event) =>
                                apply((next) => {
                                  next.config.main.image_transform = {
                                    ...next.config.main.image_transform,
                                    focal_y: Number(event.target.value),
                                  };
                                }, { previewOnly: true })
                              }
                            />
                          </div>
                        </>
                      ) : null}
                    </EditorGroup>
                  ) : null}
                  <EditorGroup title={t("builder.overlay")}>
                    <div className="kb-slider-field">
                      <div className="kb-slider-head">
                        <span className="kb-slider-label">{t("builder.overlayStrength")}</span>
                        <span className="kb-slider-value">
                          {Number(main.overlay ?? 0) === 0
                            ? t("builder.overlayNone")
                            : Number(main.overlay) < 0
                              ? t("builder.overlayDarker", { percent: Math.round(Math.abs(main.overlay) * 100) })
                              : t("builder.overlayLighter", { percent: Math.round(Number(main.overlay) * 100) })}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-1"
                        max="1"
                        step="0.05"
                        value={main.overlay ?? 0}
                        aria-label={t("builder.overlayStrengthAria")}
                        onPointerDown={beginGesture}
                        onPointerUp={endGesture}
                        onChange={(event) =>
                          apply((next) => {
                            next.config.main.overlay = Number(event.target.value);
                          }, { previewOnly: true })
                        }
                      />
                      <p className="kb-hint">{t("builder.overlayHint")}</p>
                    </div>
                  </EditorGroup>
                  <EditorGroup title={t("builder.mainTitle")}>
                    <label className="kb-label">
                      {t("builder.titleText")}
                      <input
                        type="text"
                        maxLength={150}
                        placeholder={t("builder.optionalMainTitle")}
                        value={main.title?.text || ""}
                        onFocus={beginGesture}
                        onChange={(event) =>
                          apply((next) => {
                            next.config.main.title.text = event.target.value;
                          }, { previewOnly: true })
                        }
                        onBlur={endGesture}
                      />
                    </label>
                    <div className="kb-subfield">
                      <span className="kb-subfield-label">{t("builder.alignment")}</span>
                      <div className="kb-chip-row" role="group" aria-label={t("builder.mainTitleAlignmentAria")}>
                        {[
                          { id: "left", label: t("builder.left") },
                          { id: "center", label: t("builder.center") },
                          { id: "right", label: t("builder.right") },
                        ].map((item) => {
                          const current = main.title?.alignment || "center";
                          return (
                            <button
                              key={item.id}
                              type="button"
                              className={`kb-chip ${current === item.id ? "active" : ""}`}
                              aria-pressed={current === item.id}
                              onClick={() =>
                                apply((next) => {
                                  next.config.main.title.alignment = item.id;
                                })
                              }
                            >
                              {item.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </EditorGroup>
                  <TextStyleEditor
                    label={t("builder.titleStyle")}
                    text={main.title}
                    onChange={(text, meta) =>
                      apply((next) => {
                        next.config.main.title = { ...next.config.main.title, ...text };
                      }, meta)
                    }
                    onGestureStart={beginGesture}
                    onGestureEnd={endGesture}
                    t={t}
                  />
                </section>
              ) : null}

              {activeSection === "cards" ? (
                <section className="kb-panel">
                  <EditorGroup title={t("builder.testParticipants")}>
                    <p className="kb-hint">
                      {t("builder.fakeParticipantsHint")}
                    </p>
                    <div
                      className="kb-chip-row"
                      role="group"
                      aria-label={t("builder.fakeCountAria")}
                    >
                      {FAKE_PARTICIPANT_COUNTS.map((count) => (
                        <button
                          key={count}
                          type="button"
                          className={`kb-chip ${fakeParticipantCount === count ? "active" : ""}`}
                          aria-pressed={fakeParticipantCount === count}
                          onClick={() => setFakeParticipantCount(count)}
                        >
                          {count}
                        </button>
                      ))}
                    </div>
                  </EditorGroup>
                  <CardTemplatePicker
                    value={resolveCardTemplate(main)}
                    onChange={(id) =>
                      apply((next) => {
                        next.config.main = patchMainWithCardTemplate(next.config.main, id);
                      })
                    }
                  />
                </section>
              ) : null}

              {activeSection === "input" ? (
                <section className="kb-panel">
                  <InputTemplatePicker
                    value={resolveInputTemplate(main)}
                    onChange={(id) =>
                      apply((next) => {
                        next.config.main = patchMainWithInputTemplate(next.config.main, id);
                      })
                    }
                  />
                </section>
              ) : null}

              {activeSection === "footer" ? (
                <section className="kb-panel">
                  <BackgroundEditor
                    background={footer.background}
                    modes={["solid", "gradient"]}
                    onChange={(background, meta) =>
                      apply((next) => {
                        next.config.footer.background = background;
                      }, meta)
                    }
                    onGestureStart={beginGesture}
                    onGestureEnd={endGesture}
                    t={t}
                  />
                  <EditorGroup title={t("builder.footerText")}>
                    <label className="kb-label">
                      {t("builder.text")}
                      <input
                        type="text"
                        maxLength={200}
                        placeholder={t("builder.optionalFooterText")}
                        value={footerLine}
                        onFocus={beginGesture}
                        onChange={(event) =>
                          apply((next) => {
                            const value = event.target.value.replace(/[\r\n]+/g, " ");
                            next.config.footer.text.lines = value ? [value] : [];
                          }, { previewOnly: true })
                        }
                        onBlur={endGesture}
                      />
                    </label>
                    <div className="kb-subfield">
                      <span className="kb-subfield-label">{t("builder.alignment")}</span>
                      <div className="kb-chip-row" role="group" aria-label={t("builder.footerAlignmentAria")}>
                        {["left", "center", "right"].map((alignment) => (
                          <button
                            key={alignment}
                            type="button"
                            className={`kb-chip ${footer.text?.alignment === alignment ? "active" : ""}`}
                            onClick={() =>
                              apply((next) => {
                                next.config.footer.text.alignment = alignment;
                              })
                            }
                          >
                            {alignmentLabel(alignment, t)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </EditorGroup>
                  <TextStyleEditor
                    label={t("builder.textStyle")}
                    text={footer.text}
                    onChange={(text, meta) =>
                      apply((next) => {
                        next.config.footer.text = { ...next.config.footer.text, ...text };
                      }, meta)
                    }
                    onGestureStart={beginGesture}
                    onGestureEnd={endGesture}
                    t={t}
                  />
                  <EditorGroup title={t("builder.footerImage")}>
                    {previewFooterLogoUrl() ? (
                      <img className="kb-media-thumb" src={previewFooterLogoUrl()} alt="" />
                    ) : (
                      <p className="kb-hint">{t("builder.noFooterImage")}</p>
                    )}
                    <div className="kb-chip-row">
                      <label className="kb-file-btn">
                        {previewFooterLogoUrl() ? t("builder.replaceImage") : t("builder.uploadImage")}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/gif,image/webp"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            if (file) pickImage("footerLogo", file);
                          }}
                        />
                      </label>
                      {previewFooterLogoUrl() ? (
                        <button
                          type="button"
                          className="kb-chip"
                          onClick={() =>
                            apply((next) => {
                              next.media.footerLogoKey = null;
                              next.media.removeFooterLogo = true;
                              next.config.footer.logo = null;
                            })
                          }
                        >
                          {t("builder.removeImage")}
                        </button>
                      ) : null}
                    </div>
                    {previewFooterLogoUrl() ? (
                      <>
                        <div className="kb-subfield">
                          <span className="kb-subfield-label">{t("builder.imagePosition")}</span>
                          <div className="kb-chip-row" role="group" aria-label={t("builder.footerImagePositionAria")}>
                            {["left", "center", "right"].map((alignment) => (
                              <button
                                key={alignment}
                                type="button"
                                className={`kb-chip ${footerLogoAlign === alignment ? "active" : ""}`}
                                onClick={() =>
                                  apply((next) => {
                                    next.config.footer.logo = {
                                      ...(next.config.footer.logo || {}),
                                      alignment,
                                      size: next.config.footer.logo?.size ?? 0.75,
                                    };
                                  })
                                }
                              >
                                {alignmentLabel(alignment, t)}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="kb-slider-field">
                          <div className="kb-slider-head">
                            <span className="kb-slider-label">{t("builder.imageSize")}</span>
                            <span className="kb-slider-value">
                              {Math.round(footerLogoSizeSafe * 100)}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0.35"
                            max="1"
                            step="0.05"
                            value={footerLogoSizeSafe}
                            aria-label={t("builder.footerImageSizeAria")}
                            onPointerDown={beginGesture}
                            onChange={(event) =>
                              apply((next) => {
                                next.config.footer.logo = {
                                  ...(next.config.footer.logo || { alignment: "left" }),
                                  size: Number(event.target.value),
                                };
                              }, { previewOnly: true })
                            }
                            onPointerUp={endGesture}
                          />
                        </div>
                      </>
                    ) : null}
                  </EditorGroup>
                </section>
              ) : null}
        </FloatingEditorWindow>
      </div>
    </div>
  );
}

export default function KioskBuilderScreen({ session, groupId, onNavigate }) {
  const { t } = useTranslation("kiosk");
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [initial, setInitial] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!groupId) {
      setError(t("builder.missingGroupId"));
      setStatus("error");
      return undefined;
    }
    Promise.all([
      api.getGroupKioskDesign(session, groupId),
      api.getGroup(session, groupId),
      api.getGroupKioskSettings(session, groupId).catch(() => ({ data: null })),
    ])
      .then(([designResult, groupResult, settingsResult]) => {
        if (cancelled) return;
        const data = designResult.data;
        if (!data || typeof data.config !== "object" || data.config === null) {
          setError(t("builder.missingConfig"));
          setStatus("error");
          return;
        }
        const settings = settingsResult.data || {};
        const config = normalizeDesignMediaConfig(data.config);

        const inputFields =
          settings.mode === "input"
            ? settings.input_field_count === 2
              ? ["participant_code", settings.input_second_field].filter(Boolean)
              : ["participant_code"]
            : [];

        setInitial({
          ...data,
          config,
          header_logo_url: resolveKioskMediaUrl(data.header_logo_url),
          footer_logo_url: resolveKioskMediaUrl(data.footer_logo_url),
          main_background_image_url: resolveKioskMediaUrl(data.main_background_image_url),
          groupName: groupResult.data?.name || t("builder.groupFallback"),
          groupType: groupResult.data?.group_type === "structured" ? "structured" : "standard",
          kioskBehavior: {
            mode:
              groupResult.data?.group_type === "structured"
                ? "card"
                : settings.mode === "input"
                  ? "input"
                  : "card",
            use_pin: Boolean(settings.use_pin),
            input_field_count: settings.input_field_count || 1,
            input_second_field: settings.input_second_field || null,
            input_fields: inputFields,
            card_show_name: settings.card_show_name !== false,
            card_show_participant_code: settings.card_show_participant_code !== false,
            card_show_email: Boolean(settings.card_show_email),
            card_display: {
              show_name: settings.card_show_name !== false,
              show_participant_code: settings.card_show_participant_code !== false,
              show_email: Boolean(settings.card_show_email),
            },
          },
        });
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(formatApiError(err) || t("builder.loadFailed"));
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [session, groupId, t]);

  if (status === "loading") {
    return (
      <div className="kb-fullscreen kb-boot">
        <LoadingState label={t("builder.loading")} />
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="kb-fullscreen kb-boot">
        <p className="kb-save-error">{error}</p>
        <button type="button" className="kb-tool-btn" onClick={() => onNavigate({ name: "group-detail", groupId })}>
          {t("builder.backToGroup")}
        </button>
      </div>
    );
  }
  return (
    <BuilderRenderError groupId={groupId} onNavigate={onNavigate}>
      <KioskBuilderEditor
        key={initial.id}
        session={session}
        groupId={groupId}
        initial={initial}
        onNavigate={onNavigate}
      />
    </BuilderRenderError>
  );
}

class BuilderRenderError extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="kb-fullscreen kb-boot">
        <p className="kb-save-error">{this.state.error.message || String(this.state.error)}</p>
        <button
          type="button"
          className="kb-tool-btn"
          onClick={() => this.props.onNavigate({ name: "group-detail", groupId: this.props.groupId })}
        >
          {t("builder.backToGroup")}
        </button>
      </div>
    );
  }
}

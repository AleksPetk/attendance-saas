import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import { Redirect, useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import {
  Alert as NativeAlert,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, endpoints, fieldErrorsFromBody } from "@checkstation/api";
import { canManageGroupConfiguration } from "@checkstation/domain";
import { Alert, Button, Field, LoadingState, Screen } from "../../../../src/components/ui";
import { useApp } from "../../../../src/lib/AppProvider";
import { loadAuthenticatedMediaDataUri } from "../../../../src/lib/authenticatedMedia";
import {
  CARD_TEMPLATE_IDS,
  INPUT_TEMPLATE_IDS,
  normalizeKioskDesignDocument,
  patchKioskDesignConfig,
  patchMainWithCardTemplate,
  patchMainWithInputTemplate,
  type KioskDesignDocument,
  type KioskVisualDesign,
} from "../../../../src/lib/kioskVisualDesign";
import { KioskWebLivePreview, KioskWebTemplatePicker } from "../../../../src/lib/kioskWebPreview/KioskWebPreview";
import {
  clampEditorPanelPosition,
  kioskEditorPanelMetrics,
  kioskPreviewGridColumns,
  kioskSafeInsetsForViewport,
  kioskViewportProfile,
  preferredKioskEditorPanelPosition,
  snapPhoneEditorPanelPosition,
} from "../../../../src/lib/kioskEditorLayout";
import { colors, space } from "../../../../src/theme/tokens";

type EditorSection = "header" | "main" | "footer" | "cards" | "input";
type KioskDesignConfig = KioskVisualDesign;
type PresetMeta = { label?: string; description?: string; layout?: string; card?: string; button?: string; input?: string };
type PresetCatalog = Record<"main_layouts" | "button_styles" | "input_styles" | "card_styles" | "card_templates" | "input_templates" | "fonts", Record<string, PresetMeta>>;
type MediaSelection = { uri: string; name: string; mimeType?: string };
type MediaState = {
  headerLogo: MediaSelection | null;
  footerLogo: MediaSelection | null;
  background: MediaSelection | null;
  removeHeaderLogo: boolean;
  removeFooterLogo: boolean;
  removeBackground: boolean;
};

const EMPTY_MEDIA: MediaState = {
  headerLogo: null,
  footerLogo: null,
  background: null,
  removeHeaderLogo: false,
  removeFooterLogo: false,
  removeBackground: false,
};

const EMPTY_PRESET_LABELS: Record<string, PresetMeta> = {};

const COLOR_SWATCHES = [
  "#FFFFFF", "#F8FAFC", "#E2E8F0", "#94A3B8", "#1E293B", "#0F172A", "#000000",
  "#2563EB", "#3B82F6", "#22C55E", "#16A34A", "#F59E0B", "#EF4444", "#A855F7",
];

const SAMPLE_PEOPLE = [
  ["Ada Lovelace", "G12-1001", "ada@example.com"],
  ["Alex Chen", "G12-1002", "alex@example.com"],
  ["Grace Hopper", "G12-1005", "grace@example.com"],
  ["Jordan Lee", "G12-1025", "jordan@example.com"],
  ["Li Wei", "G12-2210", "li@example.com"],
  ["Maya Smith", "G12-1024", "maya@example.com"],
];

function normalizeHex(raw: string): string | null {
  const value = raw.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(value)) return `#${value.split("").map((character) => character + character).join("")}`.toUpperCase();
  if (/^[0-9a-fA-F]{6}$/.test(value)) return `#${value}`.toUpperCase();
  return null;
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function forceSectionsEnabled(config: KioskDesignConfig): KioskDesignConfig {
  return {
    ...config,
    header: { ...config.header, enabled: true },
    footer: { ...config.footer, enabled: true },
  };
}

export default function KioskDesignScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, authState, t } = useApp();
  const navigation = useNavigation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const viewportProfile = kioskViewportProfile(width, height);
  const kioskPreviewInsets = useMemo(
    () => kioskSafeInsetsForViewport(viewportProfile, insets),
    [insets.bottom, insets.left, insets.right, insets.top, viewportProfile],
  );
  const allowNextNavigation = useRef(false);
  const [design, setDesign] = useState<KioskDesignDocument | null>(null);
  const [catalog, setCatalog] = useState<PresetCatalog | null>(null);
  const [groupName, setGroupName] = useState("");
  const [history, setHistory] = useState<KioskDesignConfig[]>([]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [media, setMedia] = useState<MediaState>(EMPTY_MEDIA);
  const [mode, setMode] = useState<"card" | "input">("card");
  const [sampleCount, setSampleCount] = useState(12);
  const [baseline, setBaseline] = useState("");
  const [activeSection, setActiveSection] = useState<EditorSection>("header");
  const [minimized, setMinimized] = useState(false);
  const [phoneEditorOpen, setPhoneEditorOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState({ x: 16, y: 72 });
  const [panelSize, setPanelSize] = useState({ width: 320, height: 420 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [resolvedPreviewMedia, setResolvedPreviewMedia] = useState<{
    headerLogoUrl?: string;
    footerLogoUrl?: string;
    backgroundUrl?: string;
  }>({});
  const panelInitialized = useRef(false);
  const previousPanelLayout = useRef("");
  const config = history[historyIndex] || null;
  const mediaDirty = Boolean(
    media.headerLogo || media.footerLogo || media.background
    || media.removeHeaderLogo || media.removeFooterLogo || media.removeBackground,
  );
  const dirty = Boolean(config && baseline && (JSON.stringify(config) !== baseline || mediaDirty));
  const safeBounds = useMemo(() => ({
    width,
    height,
    left: insets.left,
    top: insets.top,
    right: insets.right,
    bottom: insets.bottom,
  }), [height, insets.bottom, insets.left, insets.right, insets.top, width]);
  const panelMetrics = useMemo(() => kioskEditorPanelMetrics(safeBounds), [safeBounds]);
  const panelWidth = panelMetrics.width;
  const panelMaxHeight = panelMetrics.maxHeight;
  const panelLayoutKey = `${panelMetrics.isPhone ? "phone" : "tablet"}:${panelMetrics.orientation}`;
  const gridColumns = kioskPreviewGridColumns(width, height);

  const clampPosition = useCallback((x: number, y: number, panelW: number, panelH: number) => {
    return clampEditorPanelPosition(x, y, panelW, panelH, safeBounds);
  }, [safeBounds]);

  const snapPosition = useCallback((x: number, y: number, panelW: number, panelH: number) => {
    return snapPhoneEditorPanelPosition(x, y, panelW, panelH, safeBounds);
  }, [safeBounds]);

  useEffect(() => {
    setPanelPosition((current) => {
      const effectiveHeight = Math.min(panelSize.height, panelMaxHeight);
      if (!panelInitialized.current) {
        panelInitialized.current = true;
        previousPanelLayout.current = panelLayoutKey;
        return preferredKioskEditorPanelPosition(panelMetrics, effectiveHeight, safeBounds);
      }
      if (previousPanelLayout.current !== panelLayoutKey) {
        previousPanelLayout.current = panelLayoutKey;
        return snapPosition(current.x, current.y, panelWidth, effectiveHeight);
      }
      return clampPosition(current.x, current.y, panelWidth, panelSize.height);
    });
  }, [clampPosition, panelLayoutKey, panelMaxHeight, panelMetrics, panelSize.height, panelWidth, safeBounds, snapPosition]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [designData, presetData, group, settings] = await Promise.all([
        api.get<KioskDesignDocument>(endpoints.kioskDesign(id)),
        api.get<PresetCatalog>(endpoints.kioskPresets()).catch(() => null),
        api.get<{ group_type?: string; name?: string }>(endpoints.group(id)),
        api.get<{ mode?: string }>(endpoints.kioskSettings(id)).catch(() => null),
      ]);
      const normalizedDocument = normalizeKioskDesignDocument(designData);
      const next = forceSectionsEnabled(normalizedDocument.config);
      setDesign({ ...normalizedDocument, config: next });
      setCatalog(presetData);
      setGroupName(String(group.name || "").trim());
      setHistory([next]);
      setHistoryIndex(0);
      setMedia(EMPTY_MEDIA);
      setMode(group.group_type === "structured" ? "card" : settings?.mode === "input" ? "input" : "card");
      setActiveSection("header");
      setBaseline(JSON.stringify(next));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [api, id, t]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => navigation.addListener("beforeRemove", (event) => {
    if (!dirty || saving || allowNextNavigation.current) {
      allowNextNavigation.current = false;
      return;
    }
    event.preventDefault();
    NativeAlert.alert(t("kiosk.unsavedDesignTitle"), t("kiosk.unsavedDesignMessage"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("kiosk.discardChanges"),
        style: "destructive",
        onPress: () => {
          allowNextNavigation.current = true;
          navigation.dispatch(event.data.action);
        },
      },
    ]);
  }), [dirty, navigation, saving, t]);

  const commit = useCallback((mutator: (next: KioskDesignConfig) => void) => {
    setHistory((current) => {
      const base = current[historyIndex];
      if (!base) return current;
      const next = forceSectionsEnabled(JSON.parse(JSON.stringify(base)) as KioskDesignConfig);
      mutator(next);
      next.header.enabled = true;
      next.footer.enabled = true;
      if (JSON.stringify(next) === JSON.stringify(base)) return current;
      const updated = [...current.slice(0, historyIndex + 1), next].slice(-60);
      setHistoryIndex(updated.length - 1);
      return updated;
    });
  }, [historyIndex]);

  const patch = useCallback((path: string, value: unknown) => {
    setHistory((current) => {
      const base = current[historyIndex];
      if (!base) return current;
      const next = forceSectionsEnabled(patchKioskDesignConfig(base, path, value));
      if (JSON.stringify(next) === JSON.stringify(base)) return current;
      const updated = [...current.slice(0, historyIndex + 1), next].slice(-60);
      setHistoryIndex(updated.length - 1);
      return updated;
    });
  }, [historyIndex]);

  const previewPeople = useMemo(
    () =>
      Array.from({ length: sampleCount }, (_, index) => {
        const person = SAMPLE_PEOPLE[index % SAMPLE_PEOPLE.length];
        return {
          name: person[0],
          code: `${person[1]}-${Math.floor(index / SAMPLE_PEOPLE.length) + 1}`,
          email: person[2],
        };
      }),
    [sampleCount],
  );
  useEffect(() => {
    let cancelled = false;
    setResolvedPreviewMedia({});
    void (async () => {
      const resolve = async (
        selection: MediaSelection | null,
        removed: boolean,
        savedUrl: string | null | undefined,
      ) => {
        if (removed) return undefined;
        try {
          if (selection) return await selectedMediaDataUri(selection);
          if (!savedUrl) return undefined;
          return await loadAuthenticatedMediaDataUri(api, savedUrl, expoFetch as typeof fetch);
        } catch {
          return undefined;
        }
      };
      const [headerLogoUrl, footerLogoUrl, backgroundUrl] = await Promise.all([
        resolve(media.headerLogo, media.removeHeaderLogo, design?.header_logo_url),
        resolve(media.footerLogo, media.removeFooterLogo, design?.footer_logo_url),
        resolve(media.background, media.removeBackground, design?.main_background_image_url),
      ]);
      if (!cancelled) setResolvedPreviewMedia({ headerLogoUrl, footerLogoUrl, backgroundUrl });
    })();
    return () => { cancelled = true; };
  }, [api, design?.footer_logo_url, design?.header_logo_url, design?.main_background_image_url, media]);

  if (!canManageGroupConfiguration(authState.session)) return <Redirect href="/(app)/(tabs)/groups" />;
  if (loading) {
    return (
      <Screen style={styles.fullscreen}>
        <LoadingState label={t("kiosk.designLoading")} />
      </Screen>
    );
  }

  async function save() {
    if (!config) return;
    setSaving(true);
    setError("");
    try {
      const payload = forceSectionsEnabled(config);
      const body = new FormData();
      body.append("config", JSON.stringify(payload));
      appendMedia(body, "header_logo", media.headerLogo, "remove_header_logo", media.removeHeaderLogo);
      appendMedia(body, "footer_logo", media.footerLogo, "remove_footer_logo", media.removeFooterLogo);
      appendMedia(body, "main_background_image", media.background, "remove_main_background_image", media.removeBackground);
      const result = await api.request<KioskDesignDocument>(endpoints.kioskDesign(id), { method: "PUT", formData: body });
      const normalizedDocument = normalizeKioskDesignDocument(result);
      const saved = forceSectionsEnabled(normalizedDocument.config);
      setDesign({ ...normalizedDocument, config: saved });
      setHistory([saved]);
      setHistoryIndex(0);
      setMedia(EMPTY_MEDIA);
      setBaseline(JSON.stringify(saved));
      NativeAlert.alert(t("common.saved"), t("kiosk.designSaved"));
    } catch (caught) {
      if (caught instanceof ApiError) {
        const fields = fieldErrorsFromBody(caught.data);
        setError(fields.config || caught.message);
      } else setError(t("common.error"));
    } finally {
      setSaving(false);
    }
  }

  if (!config) {
    return (
      <Screen style={styles.fullscreen}>
        <Alert message={error || t("common.error")} />
        <Button label={t("common.back")} variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  const header = config.header;
  const main = config.main;
  const footer = config.footer;
  const presentation: EditorSection = mode === "input" ? "input" : "cards";
  const sections: Array<{ value: EditorSection; label: string }> = [
    { value: "header", label: t("kiosk.header") },
    { value: "main", label: t("kiosk.main") },
    { value: "footer", label: t("kiosk.footer") },
    { value: presentation, label: t(mode === "card" ? "kiosk.cards" : "kiosk.input") },
  ];
  const cardTemplateLabels = catalog?.card_templates || EMPTY_PRESET_LABELS;
  const inputTemplateLabels = catalog?.input_templates || EMPTY_PRESET_LABELS;

  return (
    <View pointerEvents="box-none" style={styles.builderRoot} testID="kiosk-design-fullscreen">
      <View
        style={[
          styles.previewLayer,
          viewportProfile === "tablet" ? {
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
            paddingLeft: insets.left,
            paddingRight: insets.right,
          } : null,
        ]}
        testID="kiosk-design-live-preview"
      >
        <KioskWebLivePreview
          config={config}
          mode={mode}
          media={resolvedPreviewMedia}
          people={previewPeople}
          helperText={mode === "card" ? t("kiosk.live.participants.tapCard") : ""}
          continueLabel={t("auth.continue")}
          participantCodeLabel={t("kiosk.participantCode")}
          gridColumns={gridColumns}
          viewportProfile={viewportProfile}
          safeInsets={kioskPreviewInsets}
        />
      </View>

      {(panelMetrics.isPhone ? !phoneEditorOpen : minimized) ? (
        <Pressable
          accessibilityLabel={t("kiosk.editor")}
          onPress={() => {
            if (panelMetrics.isPhone) setPhoneEditorOpen(true);
            else setMinimized(false);
          }}
          style={[
            styles.restoreButton,
            { top: insets.top + 12, right: insets.right + 12 },
            panelMetrics.isPhone && styles.phoneEditorGear,
          ]}
          testID="kiosk-design-restore"
        >
          <Text style={styles.restoreButtonText}>{panelMetrics.isPhone ? `⚙ ${t("common.edit")}` : `✎ ${t("kiosk.editor")}`}</Text>
        </Pressable>
      ) : null}
      <FloatingPanel
          hidden={panelMetrics.isPhone ? !phoneEditorOpen : minimized}
          isPhone={panelMetrics.isPhone}
          title={t("kiosk.editor")}
          subtitle={groupName || t("kiosk.design")}
          width={panelWidth}
          maxHeight={panelMaxHeight}
          position={panelPosition}
          onPosition={(next) => setPanelPosition(clampPosition(next.x, next.y, panelWidth, panelSize.height))}
          onDragEnd={(next) => setPanelPosition(snapPosition(next.x, next.y, panelWidth, panelSize.height))}
          onLayoutSize={(size) => {
            if (size.width > 0 && size.height > 0) setPanelSize(size);
          }}
          onMinimize={() => setMinimized(true)}
          onPhoneClose={() => router.back()}
          onPhonePreview={() => setPhoneEditorOpen(false)}
          safeInsets={{ top: insets.top, right: insets.right, bottom: insets.bottom, left: insets.left }}
          section={activeSection}
          sections={sections}
          onSection={setActiveSection}
          footer={(
            <View style={styles.panelFooter}>
              <View style={styles.historyActions}>
                <Pressable
                  accessibilityRole="button"
                  disabled={historyIndex === 0}
                  onPress={() => setHistoryIndex((value) => Math.max(0, value - 1))}
                  style={[styles.panelChip, historyIndex === 0 && styles.panelChipDisabled]}
                >
                  <Text style={styles.panelChipText}>↩ {t("kiosk.undo")}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={historyIndex >= history.length - 1}
                  onPress={() => setHistoryIndex((value) => Math.min(history.length - 1, value + 1))}
                  style={[styles.panelChip, historyIndex >= history.length - 1 && styles.panelChipDisabled]}
                >
                  <Text style={styles.panelChipText}>↪ {t("kiosk.redo")}</Text>
                </Pressable>
                <Text style={[styles.dirtyHint, dirty && styles.dirtyHintActive]}>
                  {saving ? t("kiosk.savingDesign") : dirty ? t("kiosk.unsaved") : t("kiosk.saved")}
                </Text>
              </View>
              <View style={styles.panelActions}>
                <Pressable
                  accessibilityRole="button"
                  disabled={saving}
                  onPress={() => router.back()}
                  style={[styles.panelChip, saving && styles.panelChipDisabled]}
                >
                  <Text style={styles.panelChipText}>{t("common.cancel")}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={saving || !dirty}
                  onPress={() => void save()}
                  style={[styles.panelPrimary, (saving || !dirty) && styles.panelChipDisabled]}
                >
                  <Text style={styles.panelPrimaryText}>{saving ? t("kiosk.savingDesign") : t("kiosk.saveDesign")}</Text>
                </Pressable>
              </View>
            </View>
          )}
        >
          <Alert message={error} />
          {activeSection === "header" ? (
            <View style={styles.editorStack} testID="kiosk-design-header-section">
              <BackgroundEditor background={header.background} label={t("kiosk.background")} onChange={(value) => patch("header.background", value)} t={t} />
              <OptionPicker label={t("kiosk.alignment")} value={header.alignment} options={alignmentOptions(t)} onChange={(value) => patch("header.alignment", value)} />
              <Field label={t("kiosk.headerTitle")} maxLength={150} onChangeText={(value) => patch("header.title.text", value)} placeholder={t("kiosk.optionalTitle")} value={header.title.text} />
              <TextStyleEditor path="header.title" text={header.title} catalog={catalog} patch={patch} t={t} />
              <MediaPicker
                label={t("kiosk.logo")}
                current={Boolean(media.headerLogo || (!media.removeHeaderLogo && design?.header_logo_url))}
                onPick={(value) => {
                  setMedia((current) => ({ ...current, headerLogo: value, removeHeaderLogo: false }));
                  commit((next) => { next.header.logo ||= { size: 0.75 }; });
                }}
                onRemove={() => {
                  setMedia((current) => ({ ...current, headerLogo: null, removeHeaderLogo: true }));
                  commit((next) => { next.header.logo = null; });
                }}
                t={t}
              />
              {header.logo ? (
                <RangeStepper
                  label={t("kiosk.logoSize")}
                  value={Number(header.logo.size) || 0.75}
                  min={0.35}
                  max={1}
                  step={0.05}
                  format={(value) => `${Math.round(value * 100)}%`}
                  onChange={(size) => commit((next) => { next.header.logo = { ...(next.header.logo || {}), size }; })}
                  t={t}
                />
              ) : null}
            </View>
          ) : null}

          {activeSection === "main" ? (
            <View style={styles.editorStack} testID="kiosk-design-main-section">
              <BackgroundEditor
                background={main.background}
                imageAvailable
                label={t("kiosk.background")}
                onChange={(value) => patch("main.background", value)}
                t={t}
              />
              {main.background.mode === "image" ? (
                <>
                  <MediaPicker
                    label={t("kiosk.backgroundImage")}
                    current={Boolean(media.background || (!media.removeBackground && design?.main_background_image_url))}
                    onPick={(value) => {
                      setMedia((current) => ({ ...current, background: value, removeBackground: false }));
                      patch("main.background.mode", "image");
                    }}
                    onRemove={() => {
                      setMedia((current) => ({ ...current, background: null, removeBackground: true }));
                      patch("main.background.mode", "solid");
                    }}
                    t={t}
                  />
                  {media.background || (!media.removeBackground && design?.main_background_image_url) ? (
                    <>
                      <RangeStepper label={t("kiosk.backgroundZoom")} value={main.image_transform.zoom} min={1} max={5} step={0.05} format={(value) => `${value.toFixed(2)}×`} onChange={(zoom) => patch("main.image_transform.zoom", zoom)} t={t} />
                      <RangeStepper label={t("kiosk.horizontalPosition")} value={main.image_transform.focal_x} min={0} max={1} step={0.01} format={(value) => `${Math.round(value * 100)}%`} onChange={(focal_x) => patch("main.image_transform.focal_x", focal_x)} t={t} />
                      <RangeStepper label={t("kiosk.verticalPosition")} value={main.image_transform.focal_y} min={0} max={1} step={0.01} format={(value) => `${Math.round(value * 100)}%`} onChange={(focal_y) => patch("main.image_transform.focal_y", focal_y)} t={t} />
                    </>
                  ) : null}
                </>
              ) : null}
              <RangeStepper
                label={t("kiosk.overlay")}
                value={main.overlay}
                min={-1}
                max={1}
                step={0.05}
                format={(value) => (value === 0 ? t("kiosk.none") : `${value < 0 ? t("kiosk.darker") : t("kiosk.lighter")} ${Math.round(Math.abs(value) * 100)}%`)}
                onChange={(overlay) => patch("main.overlay", overlay)}
                t={t}
              />
              <Field label={t("kiosk.mainTitle")} maxLength={150} onChangeText={(value) => patch("main.title.text", value)} placeholder={t("kiosk.optionalTitle")} value={main.title.text} />
              <OptionPicker label={t("kiosk.alignment")} value={main.title.alignment} options={alignmentOptions(t)} onChange={(value) => patch("main.title.alignment", value)} />
              <TextStyleEditor path="main.title" text={main.title} catalog={catalog} patch={patch} t={t} />
            </View>
          ) : null}

          {activeSection === "footer" ? (
            <View style={styles.editorStack} testID="kiosk-design-footer-section">
              <BackgroundEditor background={footer.background} label={t("kiosk.background")} onChange={(value) => patch("footer.background", value)} t={t} />
              <Field
                label={t("kiosk.footerText")}
                maxLength={200}
                onChangeText={(value) => {
                  const line = value.replace(/[\r\n]+/g, " ");
                  patch("footer.text.lines", line ? [line] : []);
                }}
                placeholder={t("kiosk.optionalFooterText")}
                value={footer.text.lines[0] || ""}
              />
              <OptionPicker label={t("kiosk.alignment")} value={footer.text.alignment} options={alignmentOptions(t)} onChange={(value) => patch("footer.text.alignment", value)} />
              <TextStyleEditor path="footer.text" text={footer.text} catalog={catalog} patch={patch} t={t} />
              <MediaPicker
                label={t("kiosk.footerImage")}
                current={Boolean(media.footerLogo || (!media.removeFooterLogo && design?.footer_logo_url))}
                onPick={(value) => {
                  setMedia((current) => ({ ...current, footerLogo: value, removeFooterLogo: false }));
                  commit((next) => { next.footer.logo ||= { alignment: "left", size: 0.75 }; });
                }}
                onRemove={() => {
                  setMedia((current) => ({ ...current, footerLogo: null, removeFooterLogo: true }));
                  commit((next) => { next.footer.logo = null; });
                }}
                t={t}
              />
              {footer.logo ? (
                <>
                  <OptionPicker
                    label={t("kiosk.imagePosition")}
                    value={footer.logo.alignment || "left"}
                    options={alignmentOptions(t)}
                    onChange={(alignment) => commit((next) => { next.footer.logo = { ...(next.footer.logo || {}), alignment }; })}
                  />
                  <RangeStepper
                    label={t("kiosk.imageSize")}
                    value={Number(footer.logo.size) || 0.75}
                    min={0.35}
                    max={1}
                    step={0.05}
                    format={(value) => `${Math.round(value * 100)}%`}
                    onChange={(size) => commit((next) => { next.footer.logo = { ...(next.footer.logo || {}), size }; })}
                    t={t}
                  />
                </>
              ) : null}
            </View>
          ) : null}

          <View
            pointerEvents={activeSection === "cards" ? "auto" : "none"}
            style={activeSection === "cards" ? styles.editorStack : styles.sectionHidden}
            testID="kiosk-design-cards-section"
          >
              <Text style={styles.helperText}>{t("kiosk.fakeParticipantsHint")}</Text>
              <OptionPicker
                label={t("kiosk.testParticipants")}
                value={String(sampleCount)}
                options={[6, 12, 20, 50, 100].map((count) => ({ value: String(count), label: String(count) }))}
                onChange={(value) => setSampleCount(Number(value))}
              />
              <Text style={styles.controlLabel}>{t("kiosk.cardTemplate")}</Text>
              <KioskWebTemplatePicker
                kind="cards"
                ids={CARD_TEMPLATE_IDS}
                selected={main.card_template}
                labels={cardTemplateLabels}
                height={Math.min(420, Math.max(280, height * 0.42))}
                onSelect={(templateId) => commit((next) => { next.main = patchMainWithCardTemplate(next.main, templateId); })}
              />
          </View>

          <View
            pointerEvents={activeSection === "input" ? "auto" : "none"}
            style={activeSection === "input" ? styles.editorStack : styles.sectionHidden}
            testID="kiosk-design-input-section"
          >
              <Text style={styles.controlLabel}>{t("kiosk.inputTemplate")}</Text>
              <KioskWebTemplatePicker
                kind="input"
                ids={INPUT_TEMPLATE_IDS}
                selected={main.input_template}
                labels={inputTemplateLabels}
                height={Math.min(420, Math.max(280, height * 0.42))}
                onSelect={(templateId) => commit((next) => { next.main = patchMainWithInputTemplate(next.main, templateId); })}
              />
          </View>
        </FloatingPanel>
    </View>
  );
}

function FloatingPanel({
  hidden,
  isPhone,
  title,
  subtitle,
  width,
  maxHeight,
  position,
  onPosition,
  onDragEnd,
  onLayoutSize,
  onMinimize,
  onPhoneClose,
  onPhonePreview,
  safeInsets,
  section,
  sections,
  onSection,
  footer,
  children,
}: {
  hidden: boolean;
  isPhone: boolean;
  title: string;
  subtitle: string;
  width: number;
  maxHeight: number;
  position: { x: number; y: number };
  onPosition: (position: { x: number; y: number }) => void;
  onDragEnd: (position: { x: number; y: number }) => void;
  onLayoutSize: (size: { width: number; height: number }) => void;
  onMinimize: () => void;
  onPhoneClose: () => void;
  onPhonePreview: () => void;
  safeInsets: { top: number; right: number; bottom: number; left: number };
  section: EditorSection;
  sections: Array<{ value: EditorSection; label: string }>;
  onSection: (section: EditorSection) => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  const { t } = useApp();
  const dragOrigin = useRef(position);
  const positionRef = useRef(position);
  const onPositionRef = useRef(onPosition);
  const onDragEndRef = useRef(onDragEnd);
  positionRef.current = position;
  onPositionRef.current = onPosition;
  onDragEndRef.current = onDragEnd;

  // Stable PanResponder — recreating on every position update broke iPad drag mid-gesture.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_: GestureResponderEvent, gesture: PanResponderGestureState) =>
        Math.abs(gesture.dx) > 3 || Math.abs(gesture.dy) > 3,
      onMoveShouldSetPanResponderCapture: (_: GestureResponderEvent, gesture: PanResponderGestureState) =>
        Math.abs(gesture.dx) > 3 || Math.abs(gesture.dy) > 3,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => {
        dragOrigin.current = { x: positionRef.current.x, y: positionRef.current.y };
      },
      onPanResponderMove: (_: GestureResponderEvent, gesture: PanResponderGestureState) => {
        const next = {
          x: dragOrigin.current.x + gesture.dx,
          y: dragOrigin.current.y + gesture.dy,
        };
        positionRef.current = next;
        onPositionRef.current(next);
      },
      onPanResponderRelease: () => onDragEndRef.current(positionRef.current),
      onPanResponderTerminate: () => onDragEndRef.current(positionRef.current),
    }),
  ).current;

  if (isPhone) {
    return (
      <View
        pointerEvents={hidden ? "none" : "auto"}
        style={[
          styles.phoneEditorScreen,
          {
            paddingTop: safeInsets.top,
            paddingRight: safeInsets.right,
            paddingBottom: safeInsets.bottom,
            paddingLeft: safeInsets.left,
          },
          hidden && styles.floatingPanelHidden,
        ]}
        testID="kiosk-design-phone-editor"
      >
        <View style={styles.phoneEditorTopBar}>
          <Pressable
            accessibilityRole="button"
            onPress={onPhoneClose}
            style={styles.phoneEditorTopAction}
            testID="kiosk-design-phone-close"
          >
            <Text style={styles.phoneEditorTopActionText}>{t("common.close")}</Text>
          </Pressable>
          <View style={styles.phoneEditorTitleWrap}>
            <Text numberOfLines={1} style={styles.phoneEditorTitle}>{title}</Text>
            <Text numberOfLines={1} style={styles.phoneEditorSubtitle}>{subtitle}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onPhonePreview}
            style={styles.phoneEditorPreviewAction}
            testID="kiosk-design-phone-preview"
          >
            <Text style={styles.phoneEditorPreviewActionText}>{t("kiosk.livePreview")}</Text>
          </Pressable>
        </View>
        <EditorSectionTabs section={section} sections={sections} onSection={onSection} />
        <ScrollView
          bounces
          contentContainerStyle={styles.phoneEditorBody}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          showsVerticalScrollIndicator
          style={styles.phoneEditorBodyScroll}
          testID="kiosk-design-phone-scroll"
        >
          {children}
        </ScrollView>
        <View style={styles.phoneEditorFoot}>{footer}</View>
      </View>
    );
  }

  return (
    <View
      onLayout={(event) => {
        const { width: layoutWidth, height: layoutHeight } = event.nativeEvent.layout;
        onLayoutSize({ width: layoutWidth, height: layoutHeight });
      }}
      pointerEvents={hidden ? "none" : "auto"}
      style={[
        styles.floatingPanel,
        { width, left: position.x, top: position.y, maxHeight },
        hidden && styles.floatingPanelHidden,
      ]}
      testID="kiosk-design-floating-panel"
    >
      <View style={styles.panelHead}>
        <View {...panResponder.panHandlers} style={styles.panelDragZone} testID="kiosk-design-drag-handle">
          <Text style={styles.panelGrip}>⋮⋮</Text>
          <View style={styles.panelHeadCopy}>
            <Text numberOfLines={1} style={styles.panelTitle}>{title}</Text>
            <Text numberOfLines={1} style={styles.panelSubtitle}>{subtitle}</Text>
          </View>
        </View>
        <Pressable
          accessibilityLabel={t("kiosk.minimize")}
          hitSlop={8}
          onPress={onMinimize}
          style={styles.minimizeButton}
          testID="kiosk-design-minimize"
        >
          <Text style={styles.minimizeButtonText}>{t("kiosk.minimize")}</Text>
        </Pressable>
      </View>
      <EditorSectionTabs section={section} sections={sections} onSection={onSection} />
      <ScrollView
        bounces
        contentContainerStyle={styles.panelBody}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        showsVerticalScrollIndicator
        style={styles.panelBodyScroll}
        testID="kiosk-design-editor-scroll"
      >
        {children}
      </ScrollView>
      <View style={styles.panelFoot}>{footer}</View>
    </View>
  );
}

function EditorSectionTabs({
  section,
  sections,
  onSection,
}: {
  section: EditorSection;
  sections: Array<{ value: EditorSection; label: string }>;
  onSection: (section: EditorSection) => void;
}) {
  return (
    <View accessibilityRole="tablist" style={styles.sectionTabs}>
      {sections.map((item) => {
        const selected = section === item.value;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={item.value}
            onPress={() => onSection(item.value)}
            style={[styles.sectionTab, selected && styles.sectionTabActive]}
          >
            <Text adjustsFontSizeToFit minimumFontScale={0.8} numberOfLines={1} style={[styles.sectionTabText, selected && styles.sectionTabTextActive]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function alignmentOptions(t: (key: string) => string) {
  return ["left", "center", "right"].map((value) => ({ value, label: t(`kiosk.${value}`) }));
}

function SettingSwitch({ label, value, onValueChange }: { label: string; value: boolean; onValueChange: (value: boolean) => void }) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        ios_backgroundColor={colors.borderStrong}
        onValueChange={onValueChange}
        thumbColor={colors.surface}
        trackColor={{ false: colors.borderStrong, true: colors.blue }}
        value={value}
      />
    </View>
  );
}

function OptionPicker({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return (
    <View style={styles.controlGroup}>
      <Text style={styles.controlLabel}>{label}</Text>
      <View accessibilityRole="radiogroup" style={styles.optionRow}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              key={option.value}
              onPress={() => onChange(option.value)}
              style={[styles.option, selected && styles.optionActive]}
            >
              <Text style={[styles.optionText, selected && styles.optionTextActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function MediaPicker({ label, current, onPick, onRemove, t }: { label: string; current: boolean; onPick: (value: MediaSelection) => void; onRemove: () => void; t: (key: string) => string }) {
  const [busy, setBusy] = useState(false);
  async function pick() {
    setBusy(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return;
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 });
      const asset = result.canceled ? null : result.assets[0];
      if (!asset) return;
      if (asset.fileSize && asset.fileSize > 10 * 1024 * 1024) {
        NativeAlert.alert(t("common.error"), t("kiosk.imageSizeError"));
        return;
      }
      onPick({ uri: asset.uri, name: asset.fileName || asset.uri.split("/").pop() || "image.jpg", mimeType: asset.mimeType || undefined });
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={styles.controlGroup}>
      <Text style={styles.controlLabel}>{label}</Text>
      <Button label={current ? t("kiosk.replaceImage") : t("kiosk.uploadImage")} loading={busy} variant="secondary" onPress={() => void pick()} />
      {current ? <Button label={t("kiosk.removeImage")} variant="danger" onPress={onRemove} /> : null}
    </View>
  );
}

function BackgroundEditor({
  label,
  background,
  onChange,
  t,
  imageAvailable = false,
}: {
  label: string;
  background: KioskVisualDesign["main"]["background"];
  onChange: (value: KioskVisualDesign["main"]["background"]) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  imageAvailable?: boolean;
}) {
  const modes = imageAvailable ? ["solid", "gradient", "image"] : ["solid", "gradient"];
  return (
    <View style={styles.editorStack}>
      <OptionPicker
        label={label}
        value={background.mode}
        options={modes.map((value) => ({ value, label: t(`kiosk.background.${value}`) }))}
        onChange={(mode) => onChange({ ...background, mode, color2: mode === "gradient" ? background.color2 || "#22D3EE" : background.color2 })}
      />
      {background.mode !== "image" ? (
        <>
          <ColorControl
            label={background.mode === "gradient" ? t("kiosk.primaryColor") : t("kiosk.backgroundColor")}
            value={background.color}
            onChange={(color) => onChange({ ...background, color })}
            t={t}
          />
          {background.mode === "gradient" ? (
            <>
              <ColorControl label={t("kiosk.secondaryColor")} value={background.color2 || "#22D3EE"} onChange={(color2) => onChange({ ...background, color2 })} t={t} />
              <OptionPicker
                label={t("kiosk.gradientAngle")}
                value={String(background.gradient_angle)}
                options={[0, 45, 90, 135, 180].map((angle) => ({ value: String(angle), label: `${angle}°` }))}
                onChange={(value) => onChange({ ...background, gradient_angle: Number(value) })}
              />
            </>
          ) : null}
        </>
      ) : (
        <Text style={styles.helperText}>{t("kiosk.savedImageHint")}</Text>
      )}
    </View>
  );
}

function ColorControl({ label, value, onChange, t }: { label: string; value: string; onChange: (value: string) => void; t: (key: string) => string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const invalid = Boolean(draft && !normalizeHex(draft));
  return (
    <View style={styles.controlGroup}>
      <View style={styles.colorLabelRow}>
        <Text style={styles.controlLabel}>{label}</Text>
        <View style={[styles.currentColor, { backgroundColor: value }]} />
      </View>
      <View accessibilityRole="radiogroup" style={styles.swatches}>
        {COLOR_SWATCHES.map((color) => (
          <Pressable
            accessibilityLabel={color}
            accessibilityRole="radio"
            accessibilityState={{ checked: value.toUpperCase() === color }}
            key={color}
            onPress={() => onChange(color)}
            style={[styles.swatch, { backgroundColor: color }, value.toUpperCase() === color && styles.swatchActive]}
          />
        ))}
      </View>
      <Field
        autoCapitalize="characters"
        autoCorrect={false}
        error={invalid ? t("kiosk.invalidHex") : undefined}
        label={t("kiosk.customColor")}
        onChangeText={(next) => {
          setDraft(next);
          const normalized = normalizeHex(next);
          if (normalized) onChange(normalized);
        }}
        placeholder="#2563EB"
        value={draft}
      />
    </View>
  );
}

function TextStyleEditor({
  path,
  text,
  catalog,
  patch,
  t,
}: {
  path: string;
  text: { font: string; size_rem: number; color: string; effects: Record<string, unknown> };
  catalog: PresetCatalog | null;
  patch: (path: string, value: unknown) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const fonts = Object.entries(catalog?.fonts || { [text.font]: { label: humanize(text.font) } });
  return (
    <View style={styles.editorStack}>
      <ColorControl label={t("kiosk.textColor")} value={text.color} onChange={(value) => patch(`${path}.color`, value)} t={t} />
      <View style={styles.controlGroup}>
        <Text style={styles.controlLabel}>{t("kiosk.font")}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetRow}>
          {fonts.map(([fontId, meta]) => {
            const selected = fontId === text.font;
            return (
              <Pressable key={fontId} onPress={() => patch(`${path}.font`, fontId)} style={[styles.fontChip, selected && styles.fontChipActive]}>
                <Text style={[styles.fontChipText, selected && styles.fontChipTextActive]}>{meta.label || humanize(fontId)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <RangeStepper
        label={t("kiosk.textSize")}
        value={text.size_rem}
        min={0.75}
        max={3.5}
        step={0.05}
        format={(value) => `${value.toFixed(2)} rem`}
        onChange={(size_rem) => patch(`${path}.size_rem`, size_rem)}
        t={t}
      />
      <SettingSwitch label={t("kiosk.textShadow")} value={Boolean(text.effects.shadow)} onValueChange={(value) => patch(`${path}.effects`, { ...text.effects, shadow: value })} />
      <SettingSwitch label={t("kiosk.textOutline")} value={Boolean(text.effects.outline)} onValueChange={(value) => patch(`${path}.effects`, { ...text.effects, outline: value })} />
    </View>
  );
}

function RangeStepper({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  t,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
  t: (key: string) => string;
}) {
  const round = (next: number) => Math.round(next / step) * step;
  return (
    <View style={styles.settingRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.settingLabel}>{label}</Text>
        <Text style={styles.helperText}>{format(value)}</Text>
      </View>
      <View style={styles.stepper}>
        <Pressable accessibilityLabel={t("kiosk.decreaseTextSize")} onPress={() => onChange(Math.max(min, round(value - step)))} style={styles.stepperButton}>
          <Text style={styles.stepperButtonText}>−</Text>
        </Pressable>
        <Pressable accessibilityLabel={t("kiosk.increaseTextSize")} onPress={() => onChange(Math.min(max, round(value + step)))} style={styles.stepperButton}>
          <Text style={styles.stepperButtonText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function appendMedia(form: FormData, field: string, selection: MediaSelection | null, removeField: string, remove: boolean) {
  if (selection) form.append(field, new File(selection.uri), selection.name);
  else if (remove) form.append(removeField, "true");
}

async function selectedMediaDataUri(selection: MediaSelection): Promise<string> {
  const encoded = await new File(selection.uri).base64();
  return `data:${selection.mimeType || "image/jpeg"};base64,${encoded}`;
}

const styles = StyleSheet.create({
  fullscreen: { flex: 1, justifyContent: "center", padding: space.lg, gap: space.md },
  builderRoot: { flex: 1, backgroundColor: "#0f172a" },
  previewLayer: { ...StyleSheet.absoluteFill },

  floatingPanel: {
    position: "absolute",
    zIndex: 20,
    flexDirection: "column",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(7,20,38,0.97)",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 16 },
    elevation: 18,
  },
  floatingPanelHidden: {
    display: "none",
  },
  phoneEditorScreen: {
    ...StyleSheet.absoluteFill,
    zIndex: 40,
    flexDirection: "column",
    backgroundColor: "#071426",
  },
  phoneEditorTopBar: {
    minHeight: 56,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.14)",
  },
  phoneEditorTitleWrap: { flex: 1, minWidth: 0, alignItems: "center", gap: 1 },
  phoneEditorTitle: { fontSize: 16, lineHeight: 20, fontWeight: "700", color: "#fff" },
  phoneEditorSubtitle: { fontSize: 11, lineHeight: 14, color: "#94a3b8" },
  phoneEditorTopAction: {
    minWidth: 58,
    minHeight: 38,
    alignItems: "flex-start",
    justifyContent: "center",
    paddingHorizontal: 7,
  },
  phoneEditorTopActionText: { fontSize: 13, fontWeight: "600", color: "#cbd5e1" },
  phoneEditorPreviewAction: {
    minWidth: 74,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 9,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.6)",
    backgroundColor: "rgba(37,99,235,0.18)",
  },
  phoneEditorPreviewActionText: { fontSize: 12, fontWeight: "700", color: "#bfdbfe" },
  phoneEditorBodyScroll: { flex: 1, minHeight: 0 },
  phoneEditorBody: { padding: 12, gap: 10, paddingBottom: 20 },
  phoneEditorFoot: {
    flexShrink: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.14)",
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: "#020617",
  },
  phoneEditorGear: {
    minWidth: 68,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 0,
  },
  panelHead: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.12)",
  },
  panelDragZone: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8 },
  panelGrip: { color: "#94a3b8", fontSize: 16, fontWeight: "700", letterSpacing: -3 },
  panelHeadCopy: { flex: 1, minWidth: 0, gap: 2 },
  panelTitle: { fontSize: 14, fontWeight: "700", color: "#fff" },
  panelSubtitle: { fontSize: 11, color: "#94a3b8" },
  minimizeButton: {
    minHeight: 34,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  minimizeButtonText: { fontSize: 12, fontWeight: "600", color: "#e2e8f0" },
  sectionTabs: {
    flexDirection: "row",
    gap: 5,
    flexShrink: 0,
    paddingHorizontal: 7,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.12)",
  },
  sectionTab: {
    flex: 1,
    minWidth: 0,
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  sectionTabActive: { borderColor: "#3b82f6", backgroundColor: "#2563eb" },
  sectionTabText: { fontSize: 11, fontWeight: "600", lineHeight: 14, color: "#e2e8f0" },
  sectionTabTextActive: { color: "#fff" },
  panelBodyScroll: { flexGrow: 1, flexShrink: 1, minHeight: 0 },
  panelBody: { padding: 10, gap: 8, paddingBottom: 12 },
  panelFoot: {
    flexShrink: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 9,
    paddingVertical: 8,
    backgroundColor: "rgba(2,6,23,0.7)",
  },
  panelFooter: { gap: 7 },
  historyActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  panelActions: { flexDirection: "row", justifyContent: "flex-end", gap: 6 },
  panelChip: {
    minHeight: 34,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  panelChipDisabled: { opacity: 0.38 },
  panelChipText: { fontSize: 12, fontWeight: "600", color: "#e2e8f0" },
  panelPrimary: {
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2563eb",
    backgroundColor: "#2563eb",
  },
  panelPrimaryText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  dirtyHint: { marginLeft: "auto", fontSize: 10, fontWeight: "700", color: "#86efac" },
  dirtyHintActive: { color: "#fbbf24" },
  restoreButton: {
    position: "absolute",
    zIndex: 30,
    minHeight: 42,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "rgba(7,20,38,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  restoreButtonText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  editorStack: { gap: 10 },
  sectionHidden: { display: "none" },
  controlGroup: {
    gap: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.045)",
    padding: 10,
  },
  controlLabel: { fontSize: 11, fontWeight: "600", color: "#cbd5e1" },
  settingRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  settingLabel: { fontSize: 13, color: "#f8fafc", flex: 1 },
  optionRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  option: {
    flexGrow: 1,
    minWidth: 64,
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  optionActive: { borderColor: "#3b82f6", backgroundColor: "#2563eb" },
  optionText: { fontSize: 12, fontWeight: "600", color: "#e2e8f0" },
  optionTextActive: { color: "#fff" },

  colorLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  currentColor: { width: 28, height: 28, borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  swatch: { width: 25, height: 25, borderRadius: 7, borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },
  swatchActive: { borderWidth: 2, borderColor: "#60a5fa" },
  helperText: { fontSize: 11, color: "#94a3b8" },
  stepper: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepperButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  stepperButtonText: { fontSize: 18, lineHeight: 20, color: "#e2e8f0" },
  presetRow: { gap: 6, paddingRight: 8 },
  fontChip: {
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.07)",
    justifyContent: "center",
  },
  fontChipActive: { borderColor: "#3b82f6", backgroundColor: "#2563eb" },
  fontChipText: { fontSize: 12, fontWeight: "600", color: "#e2e8f0" },
  fontChipTextActive: { color: "#fff" },
});

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { Redirect, useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { Alert as NativeAlert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { ApiError, endpoints, fieldErrorsFromBody } from "@checkstation/api";
import { canManageGroupConfiguration } from "@checkstation/domain";
import { Alert, Button, Field, LoadingState, Screen } from "../../../../src/components/ui";
import { AuthenticatedImage } from "../../../../src/components/Avatar";
import { PageHeader, SectionCard } from "../../../../src/components/mobile";
import { useApp } from "../../../../src/lib/AppProvider";
import { normalizeKioskDesignDocument, normalizeKioskVisualDesign, patchKioskDesignConfig, type KioskDesignDocument, type KioskVisualDesign } from "../../../../src/lib/kioskVisualDesign";
import { colors, radii, shadows, space, type } from "../../../../src/theme/tokens";

type EditorSection = "header" | "main" | "footer" | "cards";
type KioskDesignConfig = KioskVisualDesign;
type PresetMeta = { label?: string; description?: string; layout?: string; card?: string; button?: string; input?: string };
type PresetCatalog = Record<"main_layouts" | "button_styles" | "input_styles" | "card_styles" | "card_templates" | "input_templates" | "fonts", Record<string, PresetMeta>>;
type KioskDesignData = KioskDesignDocument;

const COLOR_SWATCHES = [
  "#FFFFFF", "#F8FAFC", "#E2E8F0", "#94A3B8", "#1E293B", "#0F172A", "#000000",
  "#2563EB", "#3B82F6", "#22C55E", "#16A34A", "#F59E0B", "#EF4444", "#A855F7",
];

function normalizeConfig(config: unknown): KioskDesignConfig {
  return normalizeKioskVisualDesign(config);
}

function normalizeHex(raw: string): string | null {
  const value = raw.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(value)) return `#${value.split("").map((character) => character + character).join("")}`.toUpperCase();
  if (/^[0-9a-fA-F]{6}$/.test(value)) return `#${value}`.toUpperCase();
  return null;
}

export default function KioskDesignScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, authState, t } = useApp();
  const navigation = useNavigation();
  const router = useRouter();
  const allowNextNavigation = useRef(false);
  const [design, setDesign] = useState<KioskDesignData | null>(null);
  const [catalog, setCatalog] = useState<PresetCatalog | null>(null);
  const [config, setConfig] = useState<KioskDesignConfig | null>(null);
  const [baseline, setBaseline] = useState("");
  const [activeSection, setActiveSection] = useState<EditorSection>("header");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dirty = Boolean(config && baseline && JSON.stringify(config) !== baseline);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [designData, presetData] = await Promise.all([
        api.get<KioskDesignData>(endpoints.kioskDesign(id)),
        api.get<PresetCatalog>(endpoints.kioskPresets()).catch(() => null),
      ]);
      const normalizedDocument = normalizeKioskDesignDocument(designData);
      const next = normalizedDocument.config;
      setDesign(normalizedDocument);
      setCatalog(presetData);
      setConfig(next);
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

  const patch = useCallback((path: string, value: unknown) => {
    setConfig((current) => {
      if (!current) return current;
      return patchKioskDesignConfig(current, path, value);
    });
  }, []);

  if (!canManageGroupConfiguration(authState.session)) return <Redirect href="/(app)/(tabs)/groups" />;
  if (loading) return <Screen><LoadingState label={t("kiosk.designLoading")} /></Screen>;

  async function save() {
    if (!config) return;
    setSaving(true);
    setError("");
    try {
      const result = await api.put<KioskDesignData>(endpoints.kioskDesign(id), { config });
      const normalizedDocument = normalizeKioskDesignDocument(result);
      const saved = normalizedDocument.config;
      setDesign(normalizedDocument);
      setConfig(saved);
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

  if (!config) return <Screen><Alert message={error || t("common.error")} /></Screen>;
  const header = config.header;
  const main = config.main;
  const footer = config.footer;
  const sections: Array<{ value: EditorSection; label: string }> = [
    { value: "header", label: t("kiosk.header") },
    { value: "main", label: t("kiosk.main") },
    { value: "footer", label: t("kiosk.footer") },
    { value: "cards", label: t("kiosk.cards") },
  ];

  function selectCardTemplate(value: string) {
    const meta = catalog?.card_templates?.[value];
    patch("main.card_template", value);
    if (meta?.layout) patch("main.layout_preset", meta.layout);
    if (meta?.card) patch("main.card_preset", meta.card);
  }
  function selectInputTemplate(value: string) {
    const meta = catalog?.input_templates?.[value];
    patch("main.input_template", value);
    if (meta?.layout) patch("main.layout_preset", meta.layout);
    if (meta?.button) patch("main.button_preset", meta.button);
    if (meta?.input) patch("main.input_preset", meta.input);
  }

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <PageHeader title={t("kiosk.design")} description={t("kiosk.designDescription")} />
        <Alert message={error} />
        <LivePreview config={config} design={design} t={t} />

        <View accessibilityRole="tablist" style={styles.sectionTabs}>
          {sections.map((section) => {
            const selected = activeSection === section.value;
            return (
              <Pressable accessibilityRole="tab" accessibilityState={{ selected }} key={section.value} onPress={() => setActiveSection(section.value)} style={[styles.sectionTab, selected && styles.sectionTabActive]}>
                <Text adjustsFontSizeToFit minimumFontScale={0.85} numberOfLines={1} style={[styles.sectionTabText, selected && styles.sectionTabTextActive]}>{section.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {activeSection === "header" ? (
          <SectionCard title={t("kiosk.header")} description={t("kiosk.headerHint")}>
            <View style={styles.editorStack}>
              <SettingSwitch label={t("kiosk.enabled")} value={header.enabled} onValueChange={(value) => patch("header.enabled", value)} />
              {header.enabled ? <>
                <BackgroundEditor background={header.background} label={t("kiosk.background")} onChange={(value) => patch("header.background", value)} t={t} />
                <OptionPicker label={t("kiosk.alignment")} value={header.alignment} options={alignmentOptions(t)} onChange={(value) => patch("header.alignment", value)} />
                <Field label={t("kiosk.headerTitle")} maxLength={150} onChangeText={(value) => patch("header.title.text", value)} placeholder={t("kiosk.optionalTitle")} value={header.title.text} />
                <TextStyleEditor path="header.title" text={header.title} catalog={catalog} patch={patch} t={t} />
              </> : null}
            </View>
          </SectionCard>
        ) : null}

        {activeSection === "main" ? (
          <SectionCard title={t("kiosk.main")} description={t("kiosk.mainHint")}>
            <View style={styles.editorStack}>
              <BackgroundEditor background={main.background} imageAvailable={Boolean(design?.main_background_image_url)} label={t("kiosk.background")} onChange={(value) => patch("main.background", value)} t={t} />
              <Field label={t("kiosk.mainTitle")} maxLength={150} onChangeText={(value) => patch("main.title.text", value)} placeholder={t("kiosk.optionalTitle")} value={main.title.text} />
              <OptionPicker label={t("kiosk.alignment")} value={main.title.alignment} options={alignmentOptions(t)} onChange={(value) => patch("main.title.alignment", value)} />
              <TextStyleEditor path="main.title" text={main.title} catalog={catalog} patch={patch} t={t} />
              <PresetPicker label={t("kiosk.layout")} value={main.layout_preset} presets={catalog?.main_layouts} onChange={(value) => patch("main.layout_preset", value)} />
            </View>
          </SectionCard>
        ) : null}

        {activeSection === "footer" ? (
          <SectionCard title={t("kiosk.footer")} description={t("kiosk.footerHint")}>
            <View style={styles.editorStack}>
              <SettingSwitch label={t("kiosk.enabled")} value={footer.enabled} onValueChange={(value) => patch("footer.enabled", value)} />
              {footer.enabled ? <>
                <BackgroundEditor background={footer.background} label={t("kiosk.background")} onChange={(value) => patch("footer.background", value)} t={t} />
                <Field label={t("kiosk.footerText")} maxLength={200} onChangeText={(value) => { const line = value.replace(/[\r\n]+/g, " "); patch("footer.text.lines", line ? [line] : []); }} placeholder={t("kiosk.optionalFooterText")} value={footer.text.lines[0] || ""} />
                <OptionPicker label={t("kiosk.alignment")} value={footer.text.alignment} options={alignmentOptions(t)} onChange={(value) => patch("footer.text.alignment", value)} />
                <TextStyleEditor path="footer.text" text={footer.text} catalog={catalog} patch={patch} t={t} />
              </> : null}
            </View>
          </SectionCard>
        ) : null}

        {activeSection === "cards" ? (
          <SectionCard title={t("kiosk.cards")} description={t("kiosk.cardsHint")}>
            <View style={styles.editorStack}>
              <PresetPicker label={t("kiosk.cardTemplate")} value={main.card_template} presets={catalog?.card_templates} onChange={selectCardTemplate} wide />
              <PresetPicker label={t("kiosk.inputTemplate")} value={main.input_template} presets={catalog?.input_templates} onChange={selectInputTemplate} wide />
              <PresetPicker label={t("kiosk.cardStyle")} value={main.card_preset} presets={catalog?.card_styles} onChange={(value) => patch("main.card_preset", value)} />
              <PresetPicker label={t("kiosk.buttonStyle")} value={main.button_preset} presets={catalog?.button_styles} onChange={(value) => patch("main.button_preset", value)} />
              <PresetPicker label={t("kiosk.inputStyle")} value={main.input_preset} presets={catalog?.input_styles} onChange={(value) => patch("main.input_preset", value)} />
            </View>
          </SectionCard>
        ) : null}

        <View style={styles.saveActions}>
          <Button label={saving ? t("kiosk.savingDesign") : t("kiosk.saveDesign")} loading={saving} disabled={saving || !dirty} onPress={() => void save()} />
          <Button label={t("common.cancel")} variant="secondary" disabled={saving} onPress={() => router.back()} />
        </View>
      </ScrollView>
    </Screen>
  );
}

function alignmentOptions(t: (key: string) => string) {
  return ["left", "center", "right"].map((value) => ({ value, label: t(`kiosk.${value}`) }));
}

function SettingSwitch({ label, value, onValueChange }: { label: string; value: boolean; onValueChange: (value: boolean) => void }) {
  return <View style={styles.settingRow}><Text style={styles.settingLabel}>{label}</Text><Switch accessibilityLabel={label} ios_backgroundColor={colors.borderStrong} onValueChange={onValueChange} thumbColor={colors.surface} trackColor={{ false: colors.borderStrong, true: colors.blue }} value={value} /></View>;
}

function OptionPicker({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return (
    <View style={styles.controlGroup}>
      <Text style={styles.controlLabel}>{label}</Text>
      <View accessibilityRole="radiogroup" style={styles.optionRow}>
        {options.map((option) => { const selected = option.value === value; return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} key={option.value} onPress={() => onChange(option.value)} style={[styles.option, selected && styles.optionActive]}><Text style={[styles.optionText, selected && styles.optionTextActive]}>{option.label}</Text></Pressable>; })}
      </View>
    </View>
  );
}

function PresetPicker({ label, value, presets, onChange, wide = false }: { label: string; value: string; presets?: Record<string, PresetMeta>; onChange: (value: string) => void; wide?: boolean }) {
  const options = useMemo(() => { const items = Object.entries(presets || {}); return items.length ? items : [[value, { label: value.replaceAll("_", " ") }] as [string, PresetMeta]]; }, [presets, value]);
  return (
    <View style={styles.controlGroup}>
      <Text style={styles.controlLabel}>{label}</Text>
      <ScrollView horizontal contentContainerStyle={styles.presetRow} showsHorizontalScrollIndicator={false}>
        {options.map(([presetId, meta]) => { const selected = presetId === value; return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} key={presetId} onPress={() => onChange(presetId)} style={[styles.presetCard, wide && styles.presetCardWide, selected && styles.presetCardActive]}><View style={[styles.presetMini, selected && styles.presetMiniActive]}><View style={styles.presetMiniLine} /><View style={styles.presetMiniBlock} /></View><Text numberOfLines={1} style={[styles.presetLabel, selected && styles.presetLabelActive]}>{meta.label || presetId.replaceAll("_", " ")}</Text></Pressable>; })}
      </ScrollView>
    </View>
  );
}

function BackgroundEditor({ label, background, onChange, t, imageAvailable = false }: { label: string; background: KioskVisualDesign["main"]["background"]; onChange: (value: KioskVisualDesign["main"]["background"]) => void; t: (key: string, vars?: Record<string, string | number>) => string; imageAvailable?: boolean }) {
  const modes = imageAvailable ? ["solid", "gradient", "image"] : ["solid", "gradient"];
  return <View style={styles.editorStack}><OptionPicker label={label} value={background.mode} options={modes.map((value) => ({ value, label: t(`kiosk.background.${value}`) }))} onChange={(mode) => onChange({ ...background, mode, color2: mode === "gradient" ? background.color2 || "#22D3EE" : background.color2 })} />{background.mode !== "image" ? <><ColorControl label={background.mode === "gradient" ? t("kiosk.primaryColor") : t("kiosk.backgroundColor")} value={background.color} onChange={(color) => onChange({ ...background, color })} t={t} />{background.mode === "gradient" ? <><ColorControl label={t("kiosk.secondaryColor")} value={background.color2 || "#22D3EE"} onChange={(color2) => onChange({ ...background, color2 })} t={t} /><OptionPicker label={t("kiosk.gradientAngle")} value={String(background.gradient_angle)} options={[0, 45, 90, 135, 180].map((angle) => ({ value: String(angle), label: `${angle}°` }))} onChange={(value) => onChange({ ...background, gradient_angle: Number(value) })} /></> : null}</> : <Text style={styles.helperText}>{t("kiosk.savedImageHint")}</Text>}</View>;
}

function ColorControl({ label, value, onChange, t }: { label: string; value: string; onChange: (value: string) => void; t: (key: string) => string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const invalid = Boolean(draft && !normalizeHex(draft));
  return <View style={styles.controlGroup}><View style={styles.colorLabelRow}><Text style={styles.controlLabel}>{label}</Text><View style={[styles.currentColor, { backgroundColor: value }]} /></View><View accessibilityRole="radiogroup" style={styles.swatches}>{COLOR_SWATCHES.map((color) => <Pressable accessibilityLabel={color} accessibilityRole="radio" accessibilityState={{ checked: value.toUpperCase() === color }} key={color} onPress={() => onChange(color)} style={[styles.swatch, { backgroundColor: color }, value.toUpperCase() === color && styles.swatchActive]} />)}</View><Field autoCapitalize="characters" autoCorrect={false} error={invalid ? t("kiosk.invalidHex") : undefined} label={t("kiosk.customColor")} onChangeText={(next) => { setDraft(next); const normalized = normalizeHex(next); if (normalized) onChange(normalized); }} placeholder="#2563EB" value={draft} /></View>;
}

function TextStyleEditor({ path, text, catalog, patch, t }: { path: string; text: { font: string; size_rem: number; color: string; effects: Record<string, unknown> }; catalog: PresetCatalog | null; patch: (path: string, value: unknown) => void; t: (key: string, vars?: Record<string, string | number>) => string }) {
  return <View style={styles.editorStack}><ColorControl label={t("kiosk.textColor")} value={text.color} onChange={(value) => patch(`${path}.color`, value)} t={t} /><PresetPicker label={t("kiosk.font")} value={text.font} presets={catalog?.fonts} onChange={(value) => patch(`${path}.font`, value)} /><View style={styles.settingRow}><Text style={styles.settingLabel}>{t("kiosk.textSize")}</Text><View style={styles.stepper}><Pressable accessibilityLabel={t("kiosk.decreaseTextSize")} onPress={() => patch(`${path}.size_rem`, Math.max(0.5, Math.round((text.size_rem - 0.125) * 1000) / 1000))} style={styles.stepperButton}><Text style={styles.stepperButtonText}>−</Text></Pressable><Text style={styles.stepperValue}>{text.size_rem.toFixed(2)}</Text><Pressable accessibilityLabel={t("kiosk.increaseTextSize")} onPress={() => patch(`${path}.size_rem`, Math.min(6, Math.round((text.size_rem + 0.125) * 1000) / 1000))} style={styles.stepperButton}><Text style={styles.stepperButtonText}>+</Text></Pressable></View></View><SettingSwitch label={t("kiosk.textShadow")} value={Boolean(text.effects.shadow)} onValueChange={(value) => patch(`${path}.effects`, { ...text.effects, shadow: value })} /><SettingSwitch label={t("kiosk.textOutline")} value={Boolean(text.effects.outline)} onValueChange={(value) => patch(`${path}.effects`, { ...text.effects, outline: value })} /></View>;
}

function BackgroundSurface({ background, imageUrl, style, children }: { background: KioskVisualDesign["main"]["background"]; imageUrl?: string | null; style?: object; children: ReactNode }) {
  if (background.mode === "image" && imageUrl) return <View style={[style, { backgroundColor: background.color, overflow: "hidden" }]}><AuthenticatedImage resizeMode="cover" style={StyleSheet.absoluteFill} url={imageUrl} />{children}</View>;
  if (background.mode === "gradient" && background.color2) return <LinearGradient colors={[background.color, background.color2]} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={style}>{children}</LinearGradient>;
  return <View style={[style, { backgroundColor: background.color }]}>{children}</View>;
}

function LivePreview({ config, design, t }: { config: KioskDesignConfig; design: KioskDesignData | null; t: (key: string) => string }) {
  const cardStyle = config.main.card_preset === "flat" ? styles.previewCardFlat : config.main.card_preset === "bordered" ? styles.previewCardBordered : styles.previewCardElevated;
  const buttonStyle = config.main.button_preset === "pill" ? styles.previewButtonPill : config.main.button_preset === "flat" ? styles.previewButtonFlat : styles.previewButtonRounded;
  return <View style={styles.previewShell}><View style={styles.previewHeading}><Text style={styles.previewHeadingText}>{t("kiosk.livePreview")}</Text><Text style={styles.previewUnsaved}>{t("kiosk.previewUpdatesLive")}</Text></View><View style={styles.previewCanvas}>{config.header.enabled ? <BackgroundSurface background={config.header.background} style={styles.previewHeader}>{design?.header_logo_url ? <AuthenticatedImage style={styles.previewLogo} url={design.header_logo_url} /> : null}<Text numberOfLines={1} style={[styles.previewHeaderText, { color: config.header.title.color, textAlign: config.header.alignment as "left" | "center" | "right" }]}>{config.header.title.text || t("kiosk.previewHeader")}</Text></BackgroundSurface> : null}<BackgroundSurface background={config.main.background} imageUrl={design?.main_background_image_url} style={styles.previewMain}><Text numberOfLines={1} style={[styles.previewMainTitle, { color: config.main.title.color, textAlign: config.main.title.alignment as "left" | "center" | "right" }]}>{config.main.title.text || t("kiosk.previewWelcome")}</Text><View style={[styles.previewCard, cardStyle]}><View style={styles.previewAvatar} /><View style={styles.previewPersonCopy}><Text style={styles.previewPersonName}>{t("kiosk.previewPerson")}</Text><Text style={styles.previewPersonCode}>CS-1024</Text></View></View><View style={[styles.previewButton, buttonStyle]}><Text style={styles.previewButtonText}>{t("kiosk.previewAction")}</Text></View></BackgroundSurface>{config.footer.enabled ? <BackgroundSurface background={config.footer.background} style={styles.previewFooter}>{design?.footer_logo_url ? <AuthenticatedImage style={styles.previewLogo} url={design.footer_logo_url} /> : null}<Text numberOfLines={1} style={[styles.previewFooterText, { color: config.footer.text.color, textAlign: config.footer.text.alignment as "left" | "center" | "right" }]}>{config.footer.text.lines[0] || t("kiosk.previewFooter")}</Text></BackgroundSurface> : null}</View></View>;
}

const styles = StyleSheet.create({
  screen: { padding: 0 }, content: { padding: space.lg, paddingBottom: space.xxxl, gap: space.lg },
  sectionTabs: { flexDirection: "row", padding: 3, borderRadius: radii.md, backgroundColor: colors.surfaceSubtle }, sectionTab: { flex: 1, minWidth: 0, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: radii.sm, paddingHorizontal: 3 }, sectionTabActive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, ...shadows.sm }, sectionTabText: { fontSize: 12, fontWeight: "600", lineHeight: 16, color: colors.textMuted }, sectionTabTextActive: { color: colors.bluePressed },
  editorStack: { gap: space.lg }, controlGroup: { gap: space.sm }, controlLabel: { ...type.label, color: colors.textSecondary },
  settingRow: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, settingLabel: { ...type.body, color: colors.text },
  optionRow: { flexDirection: "row", padding: 3, borderRadius: radii.md, backgroundColor: colors.surfaceSubtle }, option: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: radii.sm, paddingHorizontal: space.sm }, optionActive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, ...shadows.sm }, optionText: { ...type.captionStrong, color: colors.textMuted }, optionTextActive: { color: colors.bluePressed },
  presetRow: { gap: space.sm, paddingRight: space.md }, presetCard: { width: 104, minHeight: 82, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: space.sm, gap: space.xs }, presetCardWide: { width: 122 }, presetCardActive: { borderColor: colors.blue, backgroundColor: colors.blueSoft }, presetMini: { height: 36, borderRadius: 6, backgroundColor: colors.surfaceSubtle, padding: 6, gap: 4 }, presetMiniActive: { backgroundColor: colors.surface }, presetMiniLine: { width: "55%", height: 4, borderRadius: 2, backgroundColor: colors.borderStrong }, presetMiniBlock: { flex: 1, borderRadius: 4, backgroundColor: colors.border }, presetLabel: { ...type.captionStrong, color: colors.textSecondary, textTransform: "capitalize" }, presetLabelActive: { color: colors.bluePressed },
  colorLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, currentColor: { width: 28, height: 28, borderRadius: 8, borderWidth: 1, borderColor: colors.borderStrong }, swatches: { flexDirection: "row", flexWrap: "wrap", gap: space.sm }, swatch: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: colors.borderStrong }, swatchActive: { borderWidth: 3, borderColor: colors.blue }, helperText: { ...type.caption, color: colors.textMuted },
  stepper: { flexDirection: "row", alignItems: "center", gap: space.sm }, stepperButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: radii.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted }, stepperButtonText: { fontSize: 22, lineHeight: 24, color: colors.bluePressed }, stepperValue: { ...type.captionStrong, color: colors.text, minWidth: 42, textAlign: "center" }, saveActions: { gap: space.sm },
  previewShell: { borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: "hidden", ...shadows.md }, previewHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.md, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border }, previewHeadingText: { ...type.captionStrong, color: colors.text }, previewUnsaved: { fontSize: 11, color: colors.textMuted }, previewCanvas: { height: 270, backgroundColor: colors.surfaceMuted }, previewHeader: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: space.sm, justifyContent: "center", paddingHorizontal: space.md }, previewLogo: { width: 34, height: 24 }, previewHeaderText: { ...type.captionStrong, flex: 1 }, previewMain: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.sm, padding: space.md }, previewMainTitle: { ...type.bodyStrong, width: "100%" }, previewCard: { width: "82%", minHeight: 58, flexDirection: "row", alignItems: "center", gap: space.sm, borderRadius: 10, padding: space.sm, backgroundColor: colors.surface }, previewCardElevated: { ...shadows.md }, previewCardFlat: { backgroundColor: colors.surfaceMuted }, previewCardBordered: { borderWidth: 2, borderColor: colors.blue }, previewAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.blueSoft }, previewPersonCopy: { flex: 1 }, previewPersonName: { ...type.captionStrong, color: colors.text }, previewPersonCode: { fontSize: 11, color: colors.textMuted }, previewButton: { minHeight: 32, justifyContent: "center", paddingHorizontal: space.lg, backgroundColor: colors.blue }, previewButtonRounded: { borderRadius: 8 }, previewButtonPill: { borderRadius: 999 }, previewButtonFlat: { borderRadius: 2 }, previewButtonText: { fontSize: 11, fontWeight: "700", color: colors.surface }, previewFooter: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: space.sm, justifyContent: "center", paddingHorizontal: space.md }, previewFooterText: { fontSize: 11, flex: 1 },
});

import { useCallback, useState } from "react";
import { Redirect, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Alert as NativeAlert, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { ApiError, endpoints, fieldErrorsFromBody } from "@checkstation/api";
import { canManageGroupConfiguration } from "@checkstation/domain";
import { Alert, Button, Field, LoadingState, Screen } from "../../../../src/components/ui";
import { PageHeader, SectionCard } from "../../../../src/components/mobile";
import { useApp } from "../../../../src/lib/AppProvider";
import { colors, space, type } from "../../../../src/theme/tokens";

type KioskDesignConfig = {
  version?: number;
  header: {
    enabled: boolean;
    height: number;
    background: { mode: string; color: string; color2: string | null; gradient_angle: number };
    logo: string | null;
    alignment: string;
    title: { text: string; font: string; size_rem: number; color: string; effects: Record<string, unknown> };
  };
  main: {
    background: { mode: string; color: string; color2: string | null; gradient_angle: number };
    image_transform: { focal_x: number; focal_y: number; zoom: number };
    overlay: number;
    layout_preset: string;
    input_template: string;
    card_template: string;
    title: { text: string; font: string; size_rem: number; color: string; alignment: string; effects: Record<string, unknown> };
    button_preset: string;
    input_preset: string;
    card_preset: string;
  };
  footer: {
    enabled: boolean;
    height: number;
    background: { mode: string; color: string; color2: string | null; gradient_angle: number };
    logo: string | null;
    text: { lines: string[]; alignment: string; font: string; size_rem: number; color: string; effects: Record<string, unknown> };
  };
};

type KioskDesignData = {
  id: number;
  config: KioskDesignConfig;
  header_logo_url: string | null;
  footer_logo_url: string | null;
  main_background_image_url: string | null;
  updated_at: string;
};

export default function KioskDesignScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, authState, t } = useApp();
  const [design, setDesign] = useState<KioskDesignData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [config, setConfig] = useState<KioskDesignConfig | null>(null);
  const [headerEnabled, setHeaderEnabled] = useState(true);
  const [footerEnabled, setFooterEnabled] = useState(true);
  const [headerBgColor, setHeaderBgColor] = useState("#2563EB");
  const [mainBgColor, setMainBgColor] = useState("#FFFFFF");
  const [footerBgColor, setFooterBgColor] = useState("#1E293B");
  const [headerTitleText, setHeaderTitleText] = useState("");
  const [headerTitleColor, setHeaderTitleColor] = useState("#FFFFFF");
  const [mainTitleText, setMainTitleText] = useState("");
  const [mainTitleColor, setMainTitleColor] = useState("#111827");
  const [footerText, setFooterText] = useState("");
  const [layoutPreset, setLayoutPreset] = useState("centered");
  const [cardTemplate, setCardTemplate] = useState("clean");
  const [inputTemplate, setInputTemplate] = useState("clean");
  const [buttonPreset, setButtonPreset] = useState("rounded");
  const [cardPreset, setCardPreset] = useState("elevated");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await api.get<KioskDesignData>(endpoints.kioskDesign(id));
      setDesign(data);
      const cfg = data.config;
      setConfig(cfg);
      setHeaderEnabled(cfg.header.enabled);
      setFooterEnabled(cfg.footer.enabled);
      setHeaderBgColor(cfg.header.background.color);
      setMainBgColor(cfg.main.background.color);
      setFooterBgColor(cfg.footer.background.color);
      setHeaderTitleText(cfg.header.title.text);
      setHeaderTitleColor(cfg.header.title.color);
      setMainTitleText(cfg.main.title.text);
      setMainTitleColor(cfg.main.title.color);
      setFooterText(cfg.footer.text.lines?.join("\n") || "");
      setLayoutPreset(cfg.main.layout_preset);
      setCardTemplate(cfg.main.card_template);
      setInputTemplate(cfg.main.input_template);
      setButtonPreset(cfg.main.button_preset);
      setCardPreset(cfg.main.card_preset);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("common.error"));
    } finally { setLoading(false); }
  }, [api, id, t]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (!canManageGroupConfiguration(authState.session)) return <Redirect href="/(app)/(tabs)/groups" />;
  if (loading) return <Screen><LoadingState label={t("kiosk.settingsLoading")} /></Screen>;

  async function save() {
    setSaving(true); setError(""); setFieldErrors({});
    try {
      const cfg: KioskDesignConfig = {
        version: 1,
        header: {
          enabled: headerEnabled,
          height: 0.12,
          background: { mode: "solid", color: headerBgColor, color2: null, gradient_angle: 90 },
          logo: null,
          alignment: "left",
          title: { text: headerTitleText, font: "inter", size_rem: 1.5, color: headerTitleColor, effects: { shadow: false, outline: false } },
        },
        main: {
          background: { mode: "solid", color: mainBgColor, color2: null, gradient_angle: 180 },
          image_transform: { focal_x: 0.5, focal_y: 0.5, zoom: 1.0 },
          overlay: 0.0,
          layout_preset: layoutPreset,
          input_template: inputTemplate,
          card_template: cardTemplate,
          title: { text: mainTitleText, font: "inter", size_rem: 2.0, color: mainTitleColor, alignment: "center", effects: {} },
          button_preset: buttonPreset,
          input_preset: "outlined",
          card_preset: cardPreset,
        },
        footer: {
          enabled: footerEnabled,
          height: 0.06,
          background: { mode: "solid", color: footerBgColor, color2: null, gradient_angle: 90 },
          logo: null,
          text: { lines: footerText.split("\n").filter(Boolean), alignment: "center", font: "inter", size_rem: 0.875, color: "#94A3B8", effects: {} },
        },
      };
      await api.put(endpoints.kioskDesign(id), { config: cfg });
      NativeAlert.alert(t("common.saved") || "Saved", t("kiosk.designSaved") || "Kiosk design updated.");
      void load();
    } catch (caught) {
      if (caught instanceof ApiError) {
        const fields = fieldErrorsFromBody(caught.data);
        setFieldErrors(fields);
        if (!Object.values(fields).some(Boolean)) setError(caught.message);
      } else setError(t("common.error"));
    } finally { setSaving(false); }
  }

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader title={t("kiosk.design") || "Kiosk design"} />
        <Alert message={error} />

        <SectionCard title={t("kiosk.header") || "Header"}>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{t("kiosk.enabled") || "Enabled"}</Text>
            <Text style={styles.toggleValue} onPress={() => setHeaderEnabled(!headerEnabled)}>{headerEnabled ? "ON" : "OFF"}</Text>
          </View>
          {headerEnabled ? (
            <>
              <Field label={t("kiosk.title") || "Title"} value={headerTitleText} onChangeText={setHeaderTitleText} />
              <Field label={t("kiosk.backgroundColor") || "Background color"} value={headerBgColor} onChangeText={setHeaderBgColor} autoCapitalize="none" />
              <Field label={t("kiosk.textColor") || "Text color"} value={headerTitleColor} onChangeText={setHeaderTitleColor} autoCapitalize="none" />
            </>
          ) : null}
        </SectionCard>

        <SectionCard title={t("kiosk.main") || "Main"}>
          <Field label={t("kiosk.backgroundColor") || "Background color"} value={mainBgColor} onChangeText={setMainBgColor} autoCapitalize="none" />
          <Field label={t("kiosk.title") || "Title"} value={mainTitleText} onChangeText={setMainTitleText} />
          <Field label={t("kiosk.textColor") || "Text color"} value={mainTitleColor} onChangeText={setMainTitleColor} autoCapitalize="none" />
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{t("kiosk.layout") || "Layout"}</Text>
            <View style={styles.segRow}>
              <Text style={[styles.seg, layoutPreset === "centered" && styles.segActive]} onPress={() => setLayoutPreset("centered")}>Center</Text>
              <Text style={[styles.seg, layoutPreset === "compact" && styles.segActive]} onPress={() => setLayoutPreset("compact")}>Compact</Text>
            </View>
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{t("kiosk.cardTemplate") || "Card template"}</Text>
            <View style={styles.segRow}>
              <Text style={[styles.seg, cardTemplate === "clean" && styles.segActive]} onPress={() => setCardTemplate("clean")}>Clean</Text>
              <Text style={[styles.seg, cardTemplate === "bold" && styles.segActive]} onPress={() => setCardTemplate("bold")}>Bold</Text>
              <Text style={[styles.seg, cardTemplate === "minimal" && styles.segActive]} onPress={() => setCardTemplate("minimal")}>Minimal</Text>
            </View>
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{t("kiosk.buttonStyle") || "Button style"}</Text>
            <View style={styles.segRow}>
              <Text style={[styles.seg, buttonPreset === "rounded" && styles.segActive]} onPress={() => setButtonPreset("rounded")}>Rounded</Text>
              <Text style={[styles.seg, buttonPreset === "flat" && styles.segActive]} onPress={() => setButtonPreset("flat")}>Flat</Text>
              <Text style={[styles.seg, buttonPreset === "pill" && styles.segActive]} onPress={() => setButtonPreset("pill")}>Pill</Text>
            </View>
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{t("kiosk.cardStyle") || "Card style"}</Text>
            <View style={styles.segRow}>
              <Text style={[styles.seg, cardPreset === "elevated" && styles.segActive]} onPress={() => setCardPreset("elevated")}>Elevated</Text>
              <Text style={[styles.seg, cardPreset === "flat" && styles.segActive]} onPress={() => setCardPreset("flat")}>Flat</Text>
              <Text style={[styles.seg, cardPreset === "bordered" && styles.segActive]} onPress={() => setCardPreset("bordered")}>Bordered</Text>
            </View>
          </View>
        </SectionCard>

        <SectionCard title={t("kiosk.footer") || "Footer"}>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{t("kiosk.enabled") || "Enabled"}</Text>
            <Text style={styles.toggleValue} onPress={() => setFooterEnabled(!footerEnabled)}>{footerEnabled ? "ON" : "OFF"}</Text>
          </View>
          {footerEnabled ? (
            <>
              <Field label={t("kiosk.backgroundColor") || "Background color"} value={footerBgColor} onChangeText={setFooterBgColor} autoCapitalize="none" />
              <Field label={t("kiosk.footerText") || "Footer text"} value={footerText} onChangeText={setFooterText} multiline numberOfLines={3} hint={t("kiosk.footerTextHint") || "One line per row"} />
            </>
          ) : null}
        </SectionCard>

        <Button label={saving ? (t("groups.saving") || "Saving...") : (t("groups.save") || "Save")} loading={saving} disabled={saving} onPress={() => void save()} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 0 },
  content: { padding: space.lg, paddingBottom: space.xxxl, gap: space.lg },
  toggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 44, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  toggleLabel: { ...type.body, color: colors.text, flex: 1 },
  toggleValue: { ...type.bodyStrong, color: colors.blue },
  segRow: { flexDirection: "row", gap: 4 },
  seg: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, ...type.captionStrong, color: colors.textMuted, backgroundColor: colors.surfaceSubtle, overflow: "hidden" },
  segActive: { color: colors.blue, backgroundColor: colors.blueSoft },
});

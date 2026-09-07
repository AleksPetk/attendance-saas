import type { ReactNode } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApp } from "../lib/AppProvider";
import { colors, layout, radii, space, touch, type } from "../theme/tokens";
import { BrandWordmark, Card } from "./ui";

function GlobeIcon() {
  return (
    <View style={styles.globe}>
      <View style={styles.globeLatitude} />
      <View style={styles.globeLongitude} />
    </View>
  );
}

export function AuthScreen({ title, lead, children, footnote }: { title: string; lead?: string; children: ReactNode; footnote?: ReactNode }) {
  const { width } = useWindowDimensions();
  const { locale, setLocale, t } = useApp();
  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={Keyboard.dismiss}
        >
          <View style={styles.authWrap}>
            <BrandWordmark />
            <Card style={[styles.authCard, width >= 768 && styles.authCardTablet]}>
              <View style={styles.titleRow}>
                <Text accessibilityRole="header" style={styles.title}>{title}</Text>
                <Pressable
                  accessibilityLabel={t("auth.languageControl")}
                  accessibilityRole="button"
                  onPress={() => setLocale(locale === "en" ? "ja" : "en")}
                  style={({ pressed }) => [styles.languageButton, pressed && styles.languagePressed]}
                >
                  <GlobeIcon />
                  <Text style={styles.languageCode}>{locale === "en" ? "EN" : "JA"}</Text>
                </Pressable>
              </View>
              {lead ? <Text style={styles.lead}>{lead}</Text> : null}
              {children}
              {footnote ? <View style={styles.footnote}>{footnote}</View> : null}
            </Card>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space.lg, paddingVertical: space.xl },
  authWrap: { width: "100%", maxWidth: layout.authMaxWidth, gap: space.md },
  authCard: { marginBottom: 0, padding: space.xl, gap: space.lg },
  authCardTablet: { padding: space.xxl },
  titleRow: { minHeight: touch.min, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  title: { ...type.title, color: colors.text, flexShrink: 1 },
  lead: { ...type.caption, color: colors.textMuted, lineHeight: 22 },
  languageButton: { minWidth: 58, minHeight: touch.min, paddingHorizontal: space.sm, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: radii.sm },
  languagePressed: { backgroundColor: colors.surfaceMuted },
  languageCode: { ...type.captionStrong, color: colors.textSecondary },
  globe: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: colors.textSecondary, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  globeLatitude: { position: "absolute", width: 16, height: 1.2, backgroundColor: colors.textSecondary },
  globeLongitude: { width: 7, height: 16, borderRadius: 5, borderWidth: 1.2, borderColor: colors.textSecondary },
  footnote: { paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, alignItems: "center" },
});

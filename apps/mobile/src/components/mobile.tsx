import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { colors, radii, shadows, space, touch, type } from "../theme/tokens";

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <View style={styles.pageHeader}>
      <View style={styles.pageHeaderCopy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text> : null}
        <Text accessibilityRole="header" style={styles.pageTitle}>{title}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function AddButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}><Ionicons color={colors.surface} name="add" size={23} /></Pressable>;
}

export function SectionCard({ title, description, children }: { title?: string; description?: string; children: ReactNode }) {
  return (
    <View style={styles.sectionCard}>
      {title || description ? <View style={styles.sectionHeader}>{title ? <Text style={styles.sectionTitle}>{title}</Text> : null}{description ? <Text style={styles.sectionDescription}>{description}</Text> : null}</View> : null}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export function StatCard({ label, value, hint, color, icon, onPress }: { label: string; value: number; hint: string; color: string; icon: keyof typeof Ionicons.glyphMap; onPress?: () => void }) {
  return (
    <Pressable accessibilityRole={onPress ? "button" : undefined} onPress={onPress} style={({ pressed }) => [styles.statCard, pressed && onPress && styles.pressed]}>
      <View style={[styles.statIcon, { backgroundColor: `${color}18` }]}><Ionicons color={color} name={icon} size={20} /></View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      <Text numberOfLines={2} style={styles.statHint}>{hint}</Text>
    </Pressable>
  );
}

export function SearchField({ value, onChangeText, placeholder, onSubmitEditing }: Pick<TextInputProps, "value" | "onChangeText" | "placeholder" | "onSubmitEditing">) {
  return (
    <View style={styles.searchWrap}>
      <Ionicons color={colors.textMuted} name="search" size={19} />
      <TextInput accessibilityLabel={placeholder} autoCapitalize="none" autoCorrect={false} onChangeText={onChangeText} onSubmitEditing={onSubmitEditing} placeholder={placeholder} placeholderTextColor={colors.placeholder} returnKeyType="search" style={styles.searchInput} value={value} />
      {value ? <Pressable accessibilityLabel="Clear search" hitSlop={8} onPress={() => onChangeText?.("")}><Ionicons color={colors.textMuted} name="close-circle" size={20} /></Pressable> : null}
    </View>
  );
}

export function FilterTabs<T extends string>({ value, options, onChange }: { value: T; options: ReadonlyArray<{ value: T; label: string }>; onChange: (value: T) => void }) {
  return <View style={styles.filterTabs}>{options.map((option) => { const active = option.value === value; return <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} key={option.value} onPress={() => onChange(option.value)} style={[styles.filterTab, active && styles.filterTabActive]}><Text style={[styles.filterTabText, active && styles.filterTabTextActive]}>{option.label}</Text></Pressable>; })}</View>;
}

export function StatusPill({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "blue" | "green" | "warning" | "danger" }) {
  const toneStyle = tone === "green" ? styles.pillGreen : tone === "blue" ? styles.pillBlue : tone === "warning" ? styles.pillWarning : tone === "danger" ? styles.pillDanger : styles.pillNeutral;
  return <View style={[styles.pill, toneStyle]}><Text style={[styles.pillText, tone === "green" && styles.pillTextGreen, tone === "blue" && styles.pillTextBlue, tone === "warning" && styles.pillTextWarning, tone === "danger" && styles.pillTextDanger]}>{label}</Text></View>;
}

export function ActionIcon({ action }: { action?: string }) {
  const config = action === "check_in" ? { icon: "log-in-outline" as const, color: colors.green, bg: colors.successSoft } : action === "check_out" ? { icon: "log-out-outline" as const, color: colors.blue, bg: colors.blueSoft } : { icon: "cafe-outline" as const, color: colors.warningText, bg: colors.warningSoft };
  return <View style={[styles.actionIcon, { backgroundColor: config.bg }]}><Ionicons color={config.color} name={config.icon} size={19} /></View>;
}

export function EmptyPanel({ icon = "file-tray-outline", title, body, action }: { icon?: keyof typeof Ionicons.glyphMap; title: string; body: string; action?: ReactNode }) {
  return <View style={styles.empty}><View style={styles.emptyIcon}><Ionicons color={colors.blue} name={icon} size={24} /></View><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyBody}>{body}</Text>{action}</View>;
}

const styles = StyleSheet.create({
  pageHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: space.md },
  pageHeaderCopy: { flex: 1, gap: space.xs }, eyebrow: { ...type.eyebrow, color: colors.blue }, pageTitle: { ...type.title, color: colors.text }, description: { ...type.caption, color: colors.textMuted },
  addButton: { width: touch.min, height: touch.min, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.blue, ...shadows.sm },
  sectionCard: { backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden", ...shadows.sm },
  sectionHeader: { padding: space.lg, paddingBottom: space.md, gap: space.xs }, sectionTitle: { ...type.bodyStrong, color: colors.text }, sectionDescription: { ...type.caption, color: colors.textMuted }, sectionBody: { padding: space.lg, paddingTop: space.sm },
  statCard: { flexGrow: 1, flexBasis: 145, minHeight: 154, backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, ...shadows.sm },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] }, statIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: space.sm }, statValue: { fontSize: 28, fontWeight: "700", lineHeight: 34, color: colors.text }, statLabel: { ...type.label, color: colors.text }, statHint: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  searchWrap: { minHeight: touch.min, flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.sm, backgroundColor: colors.surface }, searchInput: { flex: 1, minHeight: touch.min, fontSize: 16, color: colors.text },
  filterTabs: { flexDirection: "row", padding: 3, borderRadius: radii.sm, backgroundColor: colors.surfaceSubtle }, filterTab: { flex: 1, minHeight: 38, alignItems: "center", justifyContent: "center", borderRadius: 6, paddingHorizontal: space.sm }, filterTabActive: { backgroundColor: colors.surface, ...shadows.sm }, filterTabText: { ...type.captionStrong, color: colors.textMuted }, filterTabTextActive: { color: colors.blue },
  pill: { alignSelf: "flex-start", paddingHorizontal: 9, paddingVertical: 4, borderRadius: radii.pill }, pillNeutral: { backgroundColor: colors.surfaceSubtle }, pillBlue: { backgroundColor: colors.blueSoft }, pillGreen: { backgroundColor: colors.successSoft }, pillWarning: { backgroundColor: colors.warningSoft }, pillDanger: { backgroundColor: colors.dangerSoft }, pillText: { fontSize: 12, fontWeight: "600", color: colors.textSecondary }, pillTextBlue: { color: colors.bluePressed }, pillTextGreen: { color: colors.successText }, pillTextWarning: { color: colors.warningText }, pillTextDanger: { color: colors.dangerText },
  actionIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  empty: { minHeight: 200, alignItems: "center", justifyContent: "center", padding: space.xl, gap: space.sm }, emptyIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft }, emptyTitle: { ...type.bodyStrong, color: colors.text, textAlign: "center" }, emptyBody: { ...type.caption, color: colors.textMuted, textAlign: "center", maxWidth: 290 },
});

import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radii, shadows, space, touch, type } from "../../theme/tokens";
import { localIsoDate } from "./report";

export type PickerOption = { value: string; label: string; detail?: string };

export function SelectField({ label, value, placeholder, options, onChange, disabled = false, searchable = false, t }: {
  label: string;
  value: string;
  placeholder: string;
  options: PickerOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  searchable?: boolean;
  t: (key: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={() => setOpen(true)} style={({ pressed }) => [styles.select, disabled && styles.disabled, pressed && styles.pressed]}>
      <Text numberOfLines={1} style={[styles.selectText, !selected && styles.placeholder]}>{selected?.label || placeholder}</Text>
      <Ionicons color={colors.textMuted} name="chevron-down" size={18} />
    </Pressable>
    <PickerSheet open={open} title={label} options={options} value={value} searchable={searchable} onClose={() => setOpen(false)} onChange={(next) => { onChange(next); setOpen(false); }} t={t} />
  </View>;
}

function PickerSheet({ open, title, options, value, searchable, onClose, onChange, t }: {
  open: boolean;
  title: string;
  options: PickerOption[];
  value: string;
  searchable: boolean;
  onClose: () => void;
  onChange: (value: string) => void;
  t: (key: string) => string;
}) {
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);
  const filtered = options.filter((option) => `${option.label} ${option.detail || ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <Modal animationType="slide" onRequestClose={onClose} transparent visible={open}>
    <Pressable accessibilityRole="button" onPress={onClose} style={styles.scrim} />
    <SafeAreaView style={styles.sheet}>
      <View style={styles.sheetHandle} />
      <View style={styles.sheetHeader}><Text style={styles.sheetTitle}>{title}</Text><Pressable accessibilityLabel={t("common.close")} hitSlop={10} onPress={onClose}><Ionicons color={colors.text} name="close" size={24} /></Pressable></View>
      {searchable ? <View style={styles.search}><Ionicons color={colors.textMuted} name="search" size={18} /><TextInput autoCapitalize="none" autoCorrect={false} onChangeText={setQuery} placeholder={t("history.filterOptions")} placeholderTextColor={colors.placeholder} style={styles.searchInput} value={query} /></View> : null}
      <ScrollView keyboardShouldPersistTaps="handled" style={styles.optionList}>
        {filtered.map((option) => { const selected = option.value === value; return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} key={option.value || "all"} onPress={() => onChange(option.value)} style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}><View style={styles.optionCopy}><Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{option.label}</Text>{option.detail ? <Text style={styles.optionDetail}>{option.detail}</Text> : null}</View>{selected ? <Ionicons color={colors.blue} name="checkmark-circle" size={22} /> : null}</Pressable>; })}
        {!filtered.length ? <Text style={styles.noOptions}>{t("history.noMatchingOptions")}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

export function DateField({ label, value, onChange, t, locale }: { label: string; value: string; onChange: (value: string) => void; t: (key: string) => string; locale: string }) {
  const [open, setOpen] = useState(false);
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={({ pressed }) => [styles.select, pressed && styles.pressed]}>
      <Text style={[styles.selectText, !value && styles.placeholder]}>{value || t("history.selectDate")}</Text>
      <Ionicons color={colors.blue} name="calendar-outline" size={19} />
    </Pressable>
    <CalendarSheet label={label} locale={locale} open={open} value={value} onChange={(next) => { onChange(next); setOpen(false); }} onClose={() => setOpen(false)} t={t} />
  </View>;
}

function CalendarSheet({ label, locale, open, value, onChange, onClose, t }: { label: string; locale: string; open: boolean; value: string; onChange: (value: string) => void; onClose: () => void; t: (key: string) => string }) {
  const selected = value ? new Date(`${value}T12:00:00`) : new Date();
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));
  useEffect(() => {
    if (!open) return;
    const next = value ? new Date(`${value}T12:00:00`) : new Date();
    setVisibleMonth(new Date(next.getFullYear(), next.getMonth(), 1));
  }, [open, value]);
  const cells = useMemo(() => calendarCells(visibleMonth), [visibleMonth]);
  const weekdays = useMemo(() => {
    const monday = new Date(2024, 0, 1);
    return Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index)));
  }, [locale]);
  return <Modal animationType="slide" onRequestClose={onClose} transparent visible={open}>
    <Pressable accessibilityRole="button" onPress={onClose} style={styles.scrim} />
    <SafeAreaView style={styles.sheet}>
      <View style={styles.sheetHandle} />
      <View style={styles.sheetHeader}><View><Text style={styles.sheetTitle}>{label}</Text><Text style={styles.monthTitle}>{new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(visibleMonth)}</Text></View><Pressable accessibilityLabel={t("common.close")} hitSlop={10} onPress={onClose}><Ionicons color={colors.text} name="close" size={24} /></Pressable></View>
      <View style={styles.monthNav}><Pressable accessibilityLabel={t("history.previousMonth")} onPress={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1))} style={styles.monthButton}><Ionicons color={colors.blue} name="chevron-back" size={22} /></Pressable><Pressable accessibilityLabel={t("history.nextMonth")} onPress={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1))} style={styles.monthButton}><Ionicons color={colors.blue} name="chevron-forward" size={22} /></Pressable></View>
      <View style={styles.weekRow}>{weekdays.map((day, index) => <Text key={`${day}-${index}`} style={styles.weekday}>{day}</Text>)}</View>
      <View style={styles.calendarGrid}>{cells.map(({ date, current }) => { const iso = localIsoDate(date); const active = iso === value; return <Pressable accessibilityLabel={iso} accessibilityRole="button" key={iso} onPress={() => onChange(iso)} style={[styles.day, active && styles.dayActive]}><Text style={[styles.dayText, !current && styles.dayOutside, active && styles.dayTextActive]}>{date.getDate()}</Text></Pressable>; })}</View>
      <Pressable onPress={() => { const today = new Date(); setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1)); onChange(localIsoDate(today)); }} style={styles.todayButton}><Text style={styles.todayText}>{t("history.today")}</Text></Pressable>
    </SafeAreaView>
  </Modal>;
}

function calendarCells(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    return { date, current: date.getMonth() === month.getMonth() };
  });
}

const styles = StyleSheet.create({
  field: { gap: space.xs }, label: { ...type.label, color: colors.textSecondary }, select: { minHeight: touch.min, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm, paddingHorizontal: space.md, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.sm, backgroundColor: colors.surface }, selectText: { ...type.body, color: colors.text, flex: 1 }, placeholder: { color: colors.placeholder }, disabled: { opacity: 0.48 }, pressed: { backgroundColor: colors.surfaceMuted },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(7,20,38,0.45)" }, sheet: { position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "82%", borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, backgroundColor: colors.surface, paddingHorizontal: space.lg, paddingBottom: space.lg, ...shadows.md }, sheetHandle: { alignSelf: "center", width: 42, height: 4, marginTop: space.sm, marginBottom: space.md, borderRadius: 2, backgroundColor: colors.borderStrong }, sheetHeader: { minHeight: touch.min, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md }, sheetTitle: { ...type.headline, color: colors.text }, monthTitle: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  search: { minHeight: touch.min, flexDirection: "row", alignItems: "center", gap: space.sm, marginVertical: space.sm, paddingHorizontal: space.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, backgroundColor: colors.surfaceMuted }, searchInput: { flex: 1, minHeight: touch.min, fontSize: 16, color: colors.text }, optionList: { marginTop: space.sm }, option: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingVertical: space.sm }, optionPressed: { backgroundColor: colors.surfaceMuted }, optionCopy: { flex: 1 }, optionLabel: { ...type.body, color: colors.text }, optionLabelSelected: { fontWeight: "700", color: colors.blue }, optionDetail: { ...type.caption, color: colors.textMuted }, noOptions: { ...type.body, color: colors.textMuted, textAlign: "center", padding: space.xl },
  monthNav: { flexDirection: "row", justifyContent: "space-between", marginVertical: space.sm }, monthButton: { width: touch.min, height: touch.min, alignItems: "center", justifyContent: "center", borderRadius: radii.sm, backgroundColor: colors.blueSoft }, weekRow: { flexDirection: "row" }, weekday: { width: `${100 / 7}%`, textAlign: "center", ...type.captionStrong, color: colors.textMuted, paddingVertical: space.sm }, calendarGrid: { flexDirection: "row", flexWrap: "wrap" }, day: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRadius: 999 }, dayActive: { backgroundColor: colors.blue }, dayText: { ...type.body, color: colors.text }, dayOutside: { color: colors.placeholder }, dayTextActive: { color: colors.surface, fontWeight: "700" }, todayButton: { minHeight: touch.min, alignItems: "center", justifyContent: "center", marginTop: space.md, borderRadius: radii.sm, backgroundColor: colors.blueSoft }, todayText: { ...type.label, color: colors.bluePressed },
});

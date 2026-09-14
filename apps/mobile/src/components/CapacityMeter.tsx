import { StyleSheet, Text, View } from "react-native";
import { colors, radii, space, type } from "../theme/tokens";

export function CapacityMeter({
  label,
  count,
  limit,
  remainingLabel,
  unlimitedLabel,
}: {
  label: string;
  count: number;
  limit: number | null;
  remainingLabel?: string;
  unlimitedLabel?: string;
}) {
  const unlimited = limit == null;
  const percentage = unlimited || limit === 0 ? (count > 0 && limit === 0 ? 1 : 0) : Math.min(1, count / limit);
  return (
    <View accessibilityLabel={label} style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{unlimited ? unlimitedLabel || String(count) : `${count} / ${limit}`}</Text>
      </View>
      {!unlimited ? <View style={styles.track}><View style={[styles.fill, { width: `${Math.round(percentage * 100)}%` }]} /></View> : null}
      {remainingLabel ? <Text style={styles.hint}>{remainingLabel}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs, padding: space.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: "row", justifyContent: "space-between", gap: space.md },
  label: { ...type.captionStrong, color: colors.text, flex: 1 },
  value: { ...type.captionStrong, color: colors.textSecondary },
  track: { height: 8, borderRadius: radii.pill, backgroundColor: colors.surfaceSubtle, overflow: "hidden" },
  fill: { height: 8, borderRadius: radii.pill, backgroundColor: colors.blue },
  hint: { ...type.caption, color: colors.textMuted },
});

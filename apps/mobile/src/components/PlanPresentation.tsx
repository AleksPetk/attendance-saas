import { LinearGradient } from "expo-linear-gradient";
import { Platform, StyleSheet, Text, View } from "react-native";
import { planCardPresentation, promotionalHeadlinePresentation } from "../../../../frontend/src/pricingPresentation.js";
import { space } from "../theme/tokens";

type Catalog = Record<string, unknown> | null | undefined;
type CardFlags = { current?: boolean; selectedFuture?: boolean; recommended?: boolean; scheduled?: boolean };

const HEADLINE_SIZE = 22;

export function PlanPromoHeadline({ catalog }: { catalog: Catalog }) {
  const style = promotionalHeadlinePresentation(catalog);
  if (!style.text) return null;
  const shadow = style.shadow
    ? { textShadowColor: style.shadow, textShadowOffset: { width: 0, height: 8 }, textShadowRadius: 16 }
    : null;
  return (
    <Text
      accessibilityRole="text"
      style={[
        styles.headline,
        shadow,
        {
          color: style.color,
          fontWeight: style.fontWeight as "400" | "700" | "800",
          fontStyle: style.fontStyle as "normal" | "italic",
          fontFamily: fontFor(style.font),
          letterSpacing: HEADLINE_SIZE * (style.letterSpacingEm || 0),
          lineHeight: Math.round(HEADLINE_SIZE * (style.lineHeight || 1.25)),
          textTransform: style.textTransform as "none" | "uppercase",
        },
      ]}
    >
      {style.text}
    </Text>
  );
}

export function PlanOptionCard({
  catalog,
  flags,
  title,
  badge,
  recommendedBadge,
  price,
  period,
  listPrice,
  note,
  renews,
  actionLabel,
  wide = false,
}: {
  catalog: Catalog;
  flags: CardFlags;
  title: string;
  badge: string;
  recommendedBadge: boolean;
  price: string;
  period: string;
  listPrice: string;
  note: string;
  renews: string;
  actionLabel: string;
  wide?: boolean;
}) {
  const theme = planCardPresentation(catalog, flags);
  return (
    <View style={[styles.shadow, wide && styles.shadowWide, theme.shadowColor !== "transparent" && { shadowColor: theme.shadowColor, shadowOpacity: 1 }]}>
      <View style={[styles.card, { borderColor: theme.borderColor, borderStyle: theme.borderStyle as "solid" | "dashed" }]}>
        <LinearGradient colors={theme.background as [string, string, ...string[]]} end={theme.ends.end} start={theme.ends.start} style={StyleSheet.absoluteFill} />
        {theme.accent ? <View pointerEvents="none" style={[styles.accent, { backgroundColor: theme.accent }]} /> : null}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.headingColor }]}>{title}</Text>
          {badge ? <Text style={[styles.badge, { color: recommendedBadge ? theme.recommendedBadgeColor : theme.badgeColor }]}>{badge}</Text> : null}
        </View>
        <Text style={[styles.price, { color: theme.headingColor }]}>{price}</Text>
        <Text style={[styles.meta, { color: theme.periodColor }]}>{period}</Text>
        {listPrice ? <Text style={[styles.meta, styles.struck, { color: theme.listPriceColor }]}>{listPrice}</Text> : null}
        {note ? <Text style={[styles.meta, { color: theme.noteColor }]}>{note}</Text> : null}
        {renews ? <Text style={[styles.meta, { color: theme.noteColor }]}>{renews}</Text> : null}
        <View accessibilityRole="button" accessibilityState={{ disabled: true }} style={[styles.action, { borderColor: theme.button.borderColor, opacity: 0.55 }]}>
          <LinearGradient colors={theme.button.colors as [string, string, ...string[]]} end={theme.button.ends.end} start={theme.button.ends.start} style={styles.actionFill}>
            <Text style={[styles.actionLabel, { color: theme.button.textColor }]}>{actionLabel}</Text>
          </LinearGradient>
        </View>
      </View>
    </View>
  );
}

function fontFor(kind: string) {
  if (kind === "serif") return Platform.select({ ios: "Georgia", android: "serif", default: "serif" });
  if (kind === "mono") return Platform.select({ ios: "Courier", android: "monospace", default: "monospace" });
  if (kind === "impact") return Platform.select({ ios: "Impact", android: "sans-serif-condensed", default: undefined });
  return undefined;
}

const styles = StyleSheet.create({
  headline: { fontSize: HEADLINE_SIZE, marginBottom: space.sm },
  shadow: { flexGrow: 1, flexBasis: "100%", minWidth: 0, borderRadius: 16, shadowOffset: { width: 0, height: 8 }, shadowRadius: 20, elevation: 2 },
  shadowWide: { flexBasis: "42%" },
  card: { overflow: "hidden", gap: 6, padding: space.xlg, borderRadius: 16, borderWidth: 1 },
  accent: { position: "absolute", top: -18, right: -12, width: 92, height: 92, borderRadius: 46 },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: space.sm },
  title: { flex: 1, fontSize: 18, lineHeight: 24, fontWeight: "700" },
  badge: { maxWidth: "46%", fontSize: 12, lineHeight: 16, fontWeight: "700", letterSpacing: 0.3, textTransform: "uppercase" },
  price: { fontSize: 28, lineHeight: 34, fontWeight: "700" },
  meta: { fontSize: 14, lineHeight: 20 },
  struck: { textDecorationLine: "line-through" },
  action: { marginTop: space.sm, overflow: "hidden", borderRadius: 8, borderWidth: 1 },
  actionFill: { minHeight: 46, alignItems: "center", justifyContent: "center", paddingHorizontal: space.md, paddingVertical: space.sm },
  actionLabel: { fontSize: 15, lineHeight: 20, fontWeight: "600", textAlign: "center" },
});

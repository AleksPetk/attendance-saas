import { Image, StyleSheet, Text, View } from "react-native";
import { useApp } from "../lib/AppProvider";
import { colors, radii, type } from "../theme/tokens";

function initials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function Avatar({
  url,
  name,
  size = 44,
  fallbackBg,
}: {
  url?: string | null;
  name?: string;
  size?: number;
  fallbackBg?: string;
}) {
  const { api } = useApp();
  const cookie = api.jar.cookieHeader();
  const borderRadius = Math.round(size * 0.32);
  const letterSize = size < 40 ? Math.round(size * 0.45) : Math.round(size * 0.4);

  if (url) {
    return (
      <Image
        source={{ uri: url, headers: cookie ? { Cookie: cookie } : undefined }}
        style={{ width: size, height: size, borderRadius, backgroundColor: colors.surfaceSubtle }}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius,
        backgroundColor: fallbackBg || colors.blueSoft,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontSize: letterSize, fontWeight: "700", color: fallbackBg ? colors.textInverse : colors.bluePressed }}>
        {initials(name || "")}
      </Text>
    </View>
  );
}

export function AvatarRow({
  url,
  name,
  subtitle,
  size = 44,
  fallbackBg,
}: {
  url?: string | null;
  name: string;
  subtitle?: string;
  size?: number;
  fallbackBg?: string;
}) {
  return (
    <View style={styles.row}>
      <Avatar fallbackBg={fallbackBg} name={name} size={size} url={url} />
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.name}>
          {name}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  copy: { flex: 1, gap: 2 },
  name: { ...type.bodyStrong, color: colors.text },
  subtitle: { ...type.caption, color: colors.textMuted },
});

import { useEffect, useState } from "react";
import { Image, Platform, StyleSheet, Text, View, type ImageStyle, type StyleProp } from "react-native";
import { useApp } from "../lib/AppProvider";
import { loadAuthenticatedMediaDataUri, shouldLoadProtectedMediaViaFetch } from "../lib/authenticatedMedia";
import { colors, type } from "../theme/tokens";

function initials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function AvatarFallback({
  name,
  size,
  borderRadius,
  letterSize,
  fallbackBg,
}: {
  name?: string;
  size: number;
  borderRadius: number;
  letterSize: number;
  fallbackBg?: string;
}) {
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

function useProtectedMediaUri(url?: string | null): { uri: string | null; failed: boolean; loading: boolean } {
  const { api } = useApp();
  const useFetch = shouldLoadProtectedMediaViaFetch(Platform.OS);
  const immediateData = Boolean(url && url.startsWith("data:"));
  const [dataUri, setDataUri] = useState<string | null>(immediateData ? url! : null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(Boolean(url && useFetch && !immediateData));

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    if (!url) {
      setDataUri(null);
      setLoading(false);
      return;
    }
    if (!useFetch || url.startsWith("data:")) {
      setDataUri(url);
      setLoading(false);
      return;
    }
    setDataUri(null);
    setLoading(true);
    void (async () => {
      try {
        const loaded = await loadAuthenticatedMediaDataUri(api, url);
        if (!cancelled) {
          setDataUri(loaded);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setFailed(true);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, url, useFetch]);

  if (!url) return { uri: null, failed: false, loading: false };
  if (useFetch) return { uri: failed ? null : dataUri, failed, loading };
  return { uri: url, failed: false, loading: false };
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
  const { uri, failed, loading } = useProtectedMediaUri(url);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [url, uri]);

  if (url && !failed && !imageFailed && uri) {
    const useFetch = shouldLoadProtectedMediaViaFetch(Platform.OS);
    return (
      <Image
        onError={() => setImageFailed(true)}
        source={{
          uri,
          // iOS: Cookie on Image works. Android: uri is already a data: URI from fetch.
          headers: useFetch || !cookie ? undefined : { Cookie: cookie },
        }}
        style={{ width: size, height: size, borderRadius, backgroundColor: colors.surfaceSubtle }}
      />
    );
  }

  // While Android fetch is in flight, keep the subtle placeholder (not initials) to avoid flicker.
  if (url && loading) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius,
          backgroundColor: colors.surfaceSubtle,
        }}
      />
    );
  }

  return (
    <AvatarFallback
      borderRadius={borderRadius}
      fallbackBg={fallbackBg}
      letterSize={letterSize}
      name={name}
      size={size}
    />
  );
}

export function AuthenticatedImage({ url, style, resizeMode = "contain" }: { url?: string | null; style?: StyleProp<ImageStyle>; resizeMode?: "contain" | "cover" }) {
  const { api } = useApp();
  const cookie = api.jar.cookieHeader();
  const { uri, failed, loading } = useProtectedMediaUri(url);
  if (!url || failed || loading || !uri) return null;
  const useFetch = shouldLoadProtectedMediaViaFetch(Platform.OS);
  return (
    <Image
      resizeMode={resizeMode}
      source={{
        uri,
        headers: useFetch || !cookie ? undefined : { Cookie: cookie },
      }}
      style={style}
    />
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

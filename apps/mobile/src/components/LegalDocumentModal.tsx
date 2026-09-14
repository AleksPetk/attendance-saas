import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FullScreenSafeArea, topComfortGap } from "./safeArea";
import { fetchContentDocument, type ContentDocument } from "../features/help/api";
import { MarkdownContent } from "../features/help/MarkdownContent";
import { useApp } from "../lib/AppProvider";
import { legalSlugFromHref } from "../lib/legalDocuments";
import { colors, space, type } from "../theme/tokens";
import { Button } from "./ui";

export function LegalDocumentModal({
  slug,
  onClose,
  onOpenSlug,
}: {
  slug: string | null;
  onClose: () => void;
  onOpenSlug: (slug: string) => void;
}) {
  const { api, locale, t } = useApp();
  const [document, setDocument] = useState<ContentDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!slug) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setDocument(null);
    fetchContentDocument(api, slug, locale, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setDocument(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(t("help.contentError"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api, locale, reload, slug, t]);

  const title = document?.title || (slug === "privacy-policy" ? t("auth.privacy") : t("auth.terms"));

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen" visible={Boolean(slug)}>
      <FullScreenSafeArea style={styles.safe}>
        <View style={styles.header}>
          <Pressable accessibilityLabel={t("common.close")} accessibilityRole="button" hitSlop={{ top: 6, bottom: 12, left: 8, right: 12 }} onPress={onClose} style={styles.close}>
            <Ionicons color={colors.blue} name="chevron-back" size={22} />
            <Text style={styles.closeLabel}>{t("common.close")}</Text>
          </Pressable>
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {loading ? (
            <View style={styles.status}>
              <ActivityIndicator color={colors.blue} />
              <Text style={styles.statusText}>{t("common.loading")}</Text>
            </View>
          ) : null}
          {!loading && error ? (
            <View style={styles.status}>
              <Text style={styles.statusText}>{error}</Text>
              <Button label={t("common.retry")} onPress={() => setReload((value) => value + 1)} variant="secondary" />
            </View>
          ) : null}
          {!loading && document ? (
            <MarkdownContent
              markdown={document.body_markdown}
              onDocument={onOpenSlug}
              onExternal={(href) => {
                const next = legalSlugFromHref(href);
                if (next) onOpenSlug(next);
                else void Linking.openURL(href);
              }}
              title={document.title}
            />
          ) : null}
        </ScrollView>
      </FullScreenSafeArea>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: topComfortGap,
    paddingBottom: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  close: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 2 },
  closeLabel: { ...type.bodyStrong, color: colors.blue },
  title: { ...type.headline, color: colors.text },
  body: { padding: space.lg, paddingBottom: space.xxl, gap: space.md },
  status: { gap: space.md, paddingVertical: space.xl },
  statusText: { ...type.body, color: colors.textSecondary },
});

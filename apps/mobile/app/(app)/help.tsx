import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Alert, Button, Screen } from "../../src/components/ui";
import { EmptyPanel, PageHeader, SectionCard } from "../../src/components/mobile";
import { fetchContentDocuments, type ContentDocumentSummary } from "../../src/features/help/api";
import { useApp } from "../../src/lib/AppProvider";
import { colors, layout, radii, space, touch, type } from "../../src/theme/tokens";

function DocumentRow({ document, onPress }: { document: ContentDocumentSummary; onPress: () => void }) {
  const icon = document.document_type === "legal" ? "shield-checkmark-outline" : document.slug === "faq" ? "help-circle-outline" : document.slug === "support" ? "chatbubble-ellipses-outline" : "document-text-outline";
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
    <View style={styles.icon}><Ionicons color={colors.blue} name={icon} size={21} /></View>
    <View style={styles.rowCopy}><Text style={styles.rowTitle}>{document.title}</Text>{document.description ? <Text numberOfLines={2} style={styles.rowDescription}>{document.description}</Text> : null}</View>
    <Ionicons color={colors.textMuted} name="chevron-forward" size={18} />
  </Pressable>;
}

export default function HelpScreen() {
  const { api, locale, t } = useApp(); const router = useRouter();
  const [documents, setDocuments] = useState<ContentDocumentSummary[]>([]); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState("");
  const load = useCallback(async (refresh = false) => { refresh ? setRefreshing(true) : setLoading(true); setError(""); try { const result = await fetchContentDocuments(api, locale); setDocuments(result.documents || []); } catch { setError(t("help.contentError")); } finally { setLoading(false); setRefreshing(false); } }, [api, locale, t]);
  useEffect(() => { void load(); }, [load]);
  const groups = useMemo(() => { const result = new Map<string, { label: string; rows: ContentDocumentSummary[] }>(); documents.forEach((document) => { const id = document.nav_group || document.document_type || "information"; const group = result.get(id) || { label: document.nav_group_label || t("help.resources"), rows: [] }; group.rows.push(document); result.set(id, group); }); return [...result.entries()].map(([id, group]) => ({ id, label: group.label, rows: group.rows.sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title)) })); }, [documents, t]);
  const openDocument = (slug: string) => router.push({ pathname: "/(app)/help/document/[slug]", params: { slug } });
  return <Screen style={styles.screen}><ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.blue} />}>
    <PageHeader title={t("help.title")} description={t("help.hubDescription")} />
    <SectionCard title={t("help.serviceStatus")} description={t("help.serviceStatusDescription")}><Pressable accessibilityRole="button" onPress={() => router.push("/(app)/help/status")} style={({ pressed }) => [styles.statusRow, pressed && styles.pressed]}><View style={styles.statusIcon}><Ionicons color={colors.successText} name="pulse-outline" size={22} /></View><Text style={styles.statusTitle}>{t("help.openStatus")}</Text><Ionicons color={colors.textMuted} name="chevron-forward" size={18} /></Pressable></SectionCard>
    {error ? <Alert message={error} /> : null}{error && !documents.length ? <Button label={t("common.retry")} onPress={() => void load()} variant="secondary" /> : null}
    {loading ? <Text style={styles.loading}>{t("help.loadingContent")}</Text> : null}
    {!loading && !error && !documents.length ? <SectionCard><EmptyPanel icon="book-outline" title={t("help.emptyTitle")} body={t("help.emptyBody")} /></SectionCard> : null}
    {groups.map((group) => <SectionCard key={group.id} title={group.label}>{group.rows.map((document) => <DocumentRow document={document} key={document.id} onPress={() => openDocument(document.slug)} />)}</SectionCard>)}
  </ScrollView></Screen>;
}
const styles = StyleSheet.create({ screen: { padding: 0 }, content: { width: "100%", maxWidth: layout.pageMaxWidth, alignSelf: "center", padding: space.lg, paddingBottom: space.xxxl, gap: space.lg }, row: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, pressed: { opacity: 0.68 }, icon: { width: touch.min, height: touch.min, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft, borderRadius: radii.md }, rowCopy: { flex: 1, gap: 2 }, rowTitle: { ...type.label, color: colors.text }, rowDescription: { ...type.caption, color: colors.textMuted }, statusRow: { minHeight: touch.min, flexDirection: "row", alignItems: "center", gap: space.md }, statusIcon: { width: touch.min, height: touch.min, alignItems: "center", justifyContent: "center", backgroundColor: colors.successSoft, borderRadius: radii.md }, statusTitle: { ...type.bodyStrong, color: colors.text, flex: 1 }, loading: { ...type.body, color: colors.textMuted, textAlign: "center", padding: space.xl } });

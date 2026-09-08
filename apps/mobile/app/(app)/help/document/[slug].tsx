import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Alert, Button, Screen } from "../../../../src/components/ui";
import { SearchField, StatusPill } from "../../../../src/components/mobile";
import { fetchContentDocument, fetchFaq, type ContentDocument, type FaqResponse } from "../../../../src/features/help/api";
import { MarkdownContent } from "../../../../src/features/help/MarkdownContent";
import { useApp } from "../../../../src/lib/AppProvider";
import { colors, radii, shadows, space, type } from "../../../../src/theme/tokens";

function formatDate(value: string | null, locale: string) {
  if (!value) return "";
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnly ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])) : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "en", { dateStyle: "medium" }).format(date);
}

export default function HelpDocumentScreen() {
  const { slug = "documentation" } = useLocalSearchParams<{ slug: string }>();
  const { api, locale, t } = useApp(); const router = useRouter();
  const [document, setDocument] = useState<ContentDocument | null>(null); const [faq, setFaq] = useState<FaqResponse | null>(null);
  const [query, setQuery] = useState(""); const [category, setCategory] = useState(""); const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState("");
  const navigateDocument = useCallback((nextSlug: string) => router.push({ pathname: "/(app)/help/document/[slug]", params: { slug: nextSlug } }), [router]);
  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true); setError("");
    try { const [documentResult, faqResult] = await Promise.all([fetchContentDocument(api, slug, locale), slug === "faq" ? fetchFaq(api, locale, { category, query }) : Promise.resolve(null)]); setDocument(documentResult); setFaq(faqResult); }
    catch { setError(t("help.articleError")); }
    finally { setLoading(false); setRefreshing(false); }
  }, [api, category, locale, query, slug, t]);
  useEffect(() => { const timer = setTimeout(() => void load(), query ? 250 : 0); return () => clearTimeout(timer); }, [load, query]);

  return <Screen style={styles.screen}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.blue} />}>
    {loading && !document ? <Text style={styles.loading}>{t("help.loadingArticle")}</Text> : null}
    {error ? <><Alert message={error} /><Button label={t("common.retry")} onPress={() => void load()} variant="secondary" /></> : null}
    {document ? <><View style={styles.hero}><Text accessibilityRole="header" style={styles.title}>{document.title}</Text>{document.description ? <Text style={styles.description}>{document.description}</Text> : null}<View style={styles.meta}>{document.version ? <StatusPill label={`${t("help.version")} ${document.version}`} tone="blue" /> : null}<Text style={styles.metaText}>{document.effective_on ? `${t("help.effective")} ${formatDate(document.effective_on, locale)}` : document.updated_at ? `${t("help.updated")} ${formatDate(document.updated_at, locale)}` : ""}</Text></View>{document.fallback ? <Text style={styles.fallback}>{t("help.translationFallback")}</Text> : null}</View>
      <View style={styles.article}><MarkdownContent markdown={document.body_markdown} onDocument={navigateDocument} title={document.title} /></View>
      {slug === "faq" ? <View style={styles.faqSection}><Text style={styles.sectionTitle}>{t("help.faqTitle")}</Text><SearchField onChangeText={setQuery} onSubmitEditing={() => void load()} placeholder={t("help.searchFaq")} value={query} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}><Pressable onPress={() => setCategory("")} style={[styles.category, !category && styles.categoryActive]}><Text style={[styles.categoryText, !category && styles.categoryTextActive]}>{t("help.allCategories")}</Text></Pressable>{faq?.categories.map((item) => <Pressable key={item.id} onPress={() => setCategory(item.id)} style={[styles.category, category === item.id && styles.categoryActive]}><Text style={[styles.categoryText, category === item.id && styles.categoryTextActive]}>{item.label}</Text></Pressable>)}</ScrollView>
        {!loading && !faq?.entries.length ? <Text style={styles.empty}>{t("help.noFaqResults")}</Text> : null}
        {faq?.entries.map((entry) => { const expanded = open === entry.id; return <View key={entry.id} style={styles.faqCard}><Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setOpen(expanded ? null : entry.id)} style={styles.question}><Text style={styles.questionText}>{entry.question}</Text><Ionicons color={colors.blue} name={expanded ? "chevron-up" : "chevron-down"} size={19} /></Pressable>{expanded ? <View style={styles.answer}><MarkdownContent markdown={entry.answer_markdown} onDocument={navigateDocument} />{entry.related_document_slug ? <Pressable onPress={() => navigateDocument(entry.related_document_slug!)} style={styles.related}><Text style={styles.relatedText}>{t("help.openRelatedGuide")}</Text><Ionicons color={colors.blue} name="arrow-forward" size={16} /></Pressable> : null}</View> : null}</View>; })}
      </View> : null}</> : null}
  </ScrollView></Screen>;
}

const styles = StyleSheet.create({ screen: { padding: 0 }, content: { width: "100%", maxWidth: 820, alignSelf: "center", padding: space.lg, paddingBottom: space.xxxl, gap: space.lg }, loading: { ...type.body, color: colors.textMuted, textAlign: "center", padding: space.xl }, hero: { gap: space.sm }, title: { ...type.title, color: colors.text }, description: { ...type.body, color: colors.textSecondary }, meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm }, metaText: { ...type.caption, color: colors.textMuted }, fallback: { ...type.caption, color: colors.warningText }, article: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: space.lg, ...shadows.sm }, faqSection: { gap: space.md }, sectionTitle: { ...type.headline, color: colors.text }, categories: { gap: space.sm, paddingRight: space.lg }, category: { minHeight: 38, justifyContent: "center", paddingHorizontal: space.md, borderRadius: radii.pill, backgroundColor: colors.surfaceSubtle, borderWidth: 1, borderColor: colors.border }, categoryActive: { backgroundColor: colors.blue, borderColor: colors.blue }, categoryText: { ...type.captionStrong, color: colors.textSecondary }, categoryTextActive: { color: colors.textInverse }, faqCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, overflow: "hidden", ...shadows.sm }, question: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: space.md, padding: space.lg }, questionText: { ...type.bodyStrong, color: colors.text, flex: 1 }, answer: { borderTopWidth: 1, borderTopColor: colors.border, padding: space.lg, gap: space.lg }, related: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: space.sm }, relatedText: { ...type.label, color: colors.blue }, empty: { ...type.body, color: colors.textMuted, textAlign: "center", padding: space.xl } });

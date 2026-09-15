import { useEffect, useMemo, useState } from "react";
import {
  Keyboard,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ApiError, endpoints, fieldErrorsFromBody } from "@checkstation/api";
import {
  HONEYPOT_FIELD,
  MESSAGE_MAX,
  MESSAGE_MIN,
  SUBJECT_MAX,
  SUBJECT_MIN,
  publicFaqUrl,
  suggestedSubject,
} from "@checkstation/domain";
import { Alert, Button, Field, LoadingState } from "../../components/ui";
import { SectionCard } from "../../components/mobile";
import { SelectField } from "../history/HistoryPicker";
import { MarkdownContent } from "./MarkdownContent";
import { contactCatalogLabel } from "./contactCatalogLabels";
import {
  getContactCategories,
  getContactSuggestions,
  submitWorkspaceContact,
  type ContactCategory,
  type ContactSuggestion,
  type WorkspaceContactResult,
} from "./helpContact";
import { useApp } from "../../lib/AppProvider";
import { loadMobileConfig } from "../../lib/config";
import { colors, layout, radii, space, type } from "../../theme/tokens";

type SuccessState = Pick<WorkspaceContactResult, "reference" | "message" | "delivered">;

function formatContactError(caught: unknown, fallback: string): string {
  if (caught instanceof ApiError) {
    if (typeof caught.data?.detail === "string" && caught.data.detail.trim()) return caught.data.detail;
    if (Array.isArray(caught.data?.detail) && caught.data.detail.length) return String(caught.data.detail[0]);
    if (caught.message) return caught.message;
  }
  if (caught instanceof Error && caught.message) return caught.message;
  return fallback;
}

export function MobileHelpContact({ emailHint = "" }: { emailHint?: string }) {
  const { api, locale, t } = useApp();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tablet = width >= 768;
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const [categories, setCategories] = useState<ContactCategory[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([]);
  const [openSlug, setOpenSlug] = useState("");
  const [email, setEmail] = useState(String(emailHint || "").trim());
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [subjectTouched, setSubjectTouched] = useState(false);
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [catalogRetry, setCatalogRetry] = useState(0);

  const faqBase = useMemo(() => publicFaqUrl(loadMobileConfig().docsBaseUrl), []);
  const contentBottomPad = space.xxxl + (keyboardHeight > 0 ? keyboardHeight + Math.max(insets.bottom, space.md) : 0);

  const category = useMemo(
    () => categories.find((item) => item.id === categoryId) || null,
    [categories, categoryId],
  );
  const subcategory = useMemo(
    () => (category?.subcategories || []).find((item) => item.id === subcategoryId) || null,
    [category, subcategoryId],
  );
  const classified = Boolean(category && subcategory);

  const categoryOptions = useMemo(
    () =>
      categories.map((item) => ({
        value: item.id,
        label: contactCatalogLabel(locale, item.id, item.label),
      })),
    [categories, locale],
  );
  const subcategoryOptions = useMemo(
    () =>
      (category?.subcategories || []).map((item) => ({
        value: item.id,
        label: contactCatalogLabel(locale, item.id, item.label),
      })),
    [category, locale],
  );

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(Math.max(0, event.endCoordinates?.height || 0));
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingCatalog(true);
    setFormError("");
    void getContactCategories(api)
      .then((result) => {
        if (!cancelled) setCategories(result.categories || []);
      })
      .catch((caught) => {
        if (!cancelled) {
          setCategories([]);
          setFormError(formatContactError(caught, t("help.contact.loadError")));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCatalog(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, catalogRetry, t]);

  useEffect(() => {
    const hint = String(emailHint || "").trim();
    if (hint) {
      setEmail(hint);
      return;
    }
    let cancelled = false;
    void api
      .get<{ email?: string }>(endpoints.account())
      .then((account) => {
        if (!cancelled) setEmail(String(account?.email || "").trim());
      })
      .catch(() => {
        /* shell identity hint is enough when account is unavailable */
      });
    return () => {
      cancelled = true;
    };
  }, [api, emailHint]);

  useEffect(() => {
    if (!categoryId || !subcategoryId) {
      setSuggestions([]);
      setOpenSlug("");
      setSuggestionsError("");
      setLoadingSuggestions(false);
      return undefined;
    }
    let cancelled = false;
    setLoadingSuggestions(true);
    setSuggestionsError("");
    void getContactSuggestions(api, categoryId, subcategoryId, locale)
      .then((result) => {
        if (!cancelled) setSuggestions(result.items || []);
      })
      .catch((caught) => {
        if (!cancelled) {
          setSuggestions([]);
          setSuggestionsError(formatContactError(caught, t("help.contact.suggestionsError")));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSuggestions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, categoryId, subcategoryId, locale, t]);

  useEffect(() => {
    if (!subjectTouched && category && subcategory) {
      setSubject(
        suggestedSubject(
          contactCatalogLabel(locale, category.id, category.label),
          contactCatalogLabel(locale, subcategory.id, subcategory.label),
        ),
      );
    }
  }, [category, subcategory, subjectTouched, locale]);

  function resetForm() {
    setCategoryId("");
    setSubcategoryId("");
    setSuggestions([]);
    setOpenSlug("");
    setName("");
    setSubject("");
    setSubjectTouched(false);
    setMessage("");
    setHoneypot("");
    setErrors({});
    setFormError("");
    setSuggestionsError("");
  }

  async function handleSubmit() {
    if (loading) return;
    setLoading(true);
    setFormError("");
    setErrors({});
    try {
      const result = await submitWorkspaceContact(api, {
        category: categoryId,
        subcategory: subcategoryId,
        name,
        subject,
        message,
        page_path: "/help/contact",
        locale,
        [HONEYPOT_FIELD]: honeypot,
      });
      setSuccess({
        reference: result.reference,
        message: result.message,
        delivered: result.delivered,
      });
      resetForm();
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (caught.status === 429) {
          setFormError(t("help.contact.rateLimited"));
        } else {
          const next = fieldErrorsFromBody(caught.data);
          setErrors(next);
          const detail = caught.data?.detail;
          if (typeof detail === "string" && detail.trim()) setFormError(detail);
          else if (Array.isArray(detail) && detail.length) setFormError(String(detail[0]));
          else setFormError(formatContactError(caught, t("common.error")));
        }
      } else {
        setFormError(formatContactError(caught, t("common.error")));
      }
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SectionCard>
          <View accessibilityLiveRegion="polite" style={styles.success}>
            <Text style={styles.successTitle}>
              {success.delivered === false
                ? t("help.contact.successSaved")
                : t("help.contact.successSent")}
            </Text>
            <Text style={styles.successBody}>{success.message || t("help.contact.successDefault")}</Text>
            {success.reference ? (
              <Text style={styles.reference}>{t("help.contact.reference", { reference: success.reference })}</Text>
            ) : null}
            <Button label={t("help.contact.sendAnother")} onPress={() => setSuccess(null)} variant="secondary" />
          </View>
        </SectionCard>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: contentBottomPad }]}
      keyboardDismissMode="none"
      keyboardShouldPersistTaps="handled"
      style={styles.flex}
    >
      <SectionCard title={t("help.contact.topicTitle")} description={t("help.contact.topicLead")}>
        {loadingCatalog ? (
          <LoadingState label={t("common.loading")} />
        ) : formError && !categories.length ? (
          <View style={styles.errorBlock}>
            <Alert message={formError} />
            <Button label={t("common.retry")} onPress={() => setCatalogRetry((n) => n + 1)} variant="secondary" />
          </View>
        ) : (
          <View style={[styles.topicGrid, tablet && styles.topicGridTablet]} testID="help-contact-topic">
            <View style={tablet ? styles.topicCol : undefined}>
              <SelectField
                label={t("help.contact.categoryLabel")}
                options={categoryOptions}
                placeholder={t("help.contact.categoryPlaceholder")}
                t={t}
                value={categoryId}
                onChange={(next) => {
                  setCategoryId(next);
                  setSubcategoryId("");
                  setSubjectTouched(false);
                }}
              />
            </View>
            <View style={tablet ? styles.topicCol : undefined}>
              <SelectField
                disabled={!category}
                label={t("help.contact.subcategoryLabel")}
                options={subcategoryOptions}
                placeholder={
                  category ? t("help.contact.subcategoryPlaceholder") : t("help.contact.chooseCategoryFirst")
                }
                t={t}
                value={subcategoryId}
                onChange={(next) => {
                  setSubcategoryId(next);
                  setSubjectTouched(false);
                }}
              />
            </View>
            {errors.category ? <Text style={styles.fieldError}>{errors.category}</Text> : null}
            {errors.subcategory ? <Text style={styles.fieldError}>{errors.subcategory}</Text> : null}
          </View>
        )}
      </SectionCard>

      {classified ? (
        <SectionCard title={t("help.contact.helpTitle")} description={t("help.contact.helpLead")}>
          {loadingSuggestions ? (
            <LoadingState label={t("common.loading")} />
          ) : suggestionsError ? (
            <Alert message={suggestionsError} />
          ) : suggestions.length ? (
            <View style={styles.helpList} testID="help-contact-suggestions">
              {suggestions.map((item) => {
                const open = openSlug === item.slug;
                return (
                  <View key={item.slug} style={[styles.faqCard, open && styles.faqCardOpen]}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded: open }}
                      onPress={() => setOpenSlug((current) => (current === item.slug ? "" : item.slug))}
                      style={styles.question}
                    >
                      <Text style={styles.questionText}>{item.question}</Text>
                      <Ionicons color={colors.blue} name={open ? "chevron-up" : "chevron-down"} size={19} />
                    </Pressable>
                    {open ? (
                      <View style={styles.answer}>
                        <MarkdownContent
                          markdown={item.answer_markdown || ""}
                          onDocument={() => undefined}
                          onExternal={(href) => {
                            void Linking.openURL(href);
                          }}
                        />
                        {faqBase ? (
                          <Pressable
                            onPress={() =>
                              void Linking.openURL(
                                `${faqBase}?q=${encodeURIComponent(item.question || "")}`,
                              )
                            }
                            style={styles.related}
                          >
                            <Text style={styles.relatedText}>{t("help.contact.openInFaq")}</Text>
                            <Ionicons color={colors.blue} name="open-outline" size={16} />
                          </Pressable>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={styles.empty}>{t("help.contact.helpEmpty")}</Text>
          )}
        </SectionCard>
      ) : null}

      {classified ? (
        <SectionCard title={t("help.contact.messageTitle")} description={t("help.contact.messageLead")}>
          {formError ? <Alert message={formError} /> : null}
          <View style={styles.form}>
            <View style={[styles.identityGrid, tablet && styles.identityGridTablet]}>
              <View style={tablet ? styles.topicCol : undefined}>
                <Field
                  editable={false}
                  label={t("help.contact.emailLabel")}
                  testID="help-contact-email"
                  value={email}
                  autoComplete="email"
                  keyboardType="email-address"
                />
              </View>
              <View style={tablet ? styles.topicCol : undefined}>
                <Field
                  autoComplete="name"
                  label={t("help.contact.nameLabel")}
                  maxLength={80}
                  value={name}
                  onChangeText={setName}
                />
              </View>
            </View>
            <Field
              error={errors.subject}
              label={t("help.contact.subjectLabel")}
              maxLength={SUBJECT_MAX}
              testID="help-contact-subject"
              value={subject}
              onChangeText={(value) => {
                setSubjectTouched(true);
                setSubject(value);
              }}
            />
            <View style={styles.messageField}>
              <Text style={styles.label}>{t("help.contact.messageLabel")}</Text>
              <TextInput
                accessibilityLabel={t("help.contact.messageLabel")}
                maxLength={MESSAGE_MAX}
                multiline
                placeholderTextColor={colors.placeholder}
                selectionColor={colors.blue}
                style={[styles.textarea, Boolean(errors.message) && styles.textareaError]}
                testID="help-contact-message"
                textAlignVertical="top"
                value={message}
                onChangeText={setMessage}
              />
              {errors.message ? <Text style={styles.fieldError}>{errors.message}</Text> : null}
              <Text style={styles.hint}>
                {MESSAGE_MIN}–{MESSAGE_MAX}
              </Text>
            </View>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.honeypot}>
              <Text>{t("help.contact.honeypotLabel")}</Text>
              <TextInput
                autoComplete="off"
                value={honeypot}
                onChangeText={setHoneypot}
              />
            </View>
            <Button
              disabled={loading || !email || subject.trim().length < SUBJECT_MIN || message.trim().length < MESSAGE_MIN}
              label={loading ? t("help.contact.submitting") : t("help.contact.submit")}
              loading={loading}
              onPress={() => void handleSubmit()}
            />
          </View>
        </SectionCard>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: layout.pageMaxWidth,
    alignSelf: "center",
    padding: space.lg,
    gap: space.lg,
  },
  topicGrid: { gap: space.md },
  topicGridTablet: { flexDirection: "row", alignItems: "flex-start" },
  topicCol: { flex: 1, minWidth: 0 },
  identityGrid: { gap: space.md },
  identityGridTablet: { flexDirection: "row" },
  errorBlock: { gap: space.md },
  helpList: { gap: space.sm },
  faqCard: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    overflow: "hidden",
  },
  faqCardOpen: { borderColor: colors.blueSoft },
  question: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  questionText: { ...type.bodyStrong, color: colors.text, flex: 1 },
  answer: { borderTopWidth: 1, borderTopColor: colors.border, padding: space.md, gap: space.md },
  related: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: space.sm },
  relatedText: { ...type.label, color: colors.blue },
  empty: { ...type.body, color: colors.textMuted },
  form: { gap: space.md },
  messageField: { gap: space.xs },
  label: { ...type.label, color: colors.textSecondary },
  textarea: {
    minHeight: 140,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
  },
  textareaError: { borderColor: colors.danger },
  fieldError: { ...type.caption, color: colors.dangerText },
  hint: { ...type.caption, color: colors.textMuted },
  honeypot: { position: "absolute", opacity: 0, height: 0, width: 0, overflow: "hidden" },
  success: { gap: space.md },
  successTitle: { ...type.headline, color: colors.text },
  successBody: { ...type.body, color: colors.textSecondary },
  reference: { ...type.captionStrong, color: colors.textMuted },
});

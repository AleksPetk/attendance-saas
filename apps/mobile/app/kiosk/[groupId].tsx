import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Dimensions, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { endpoints } from "@checkstation/api";
import { getValidActionsForState, type ActionType } from "@checkstation/domain";
import { LoadingState } from "../../src/components/ui";
import { Avatar } from "../../src/components/Avatar";
import { useApp } from "../../src/lib/AppProvider";
import { colors, space, type } from "../../src/theme/tokens";

type KioskConfig = {
  kiosk_mode: "card" | "input";
  theme: string;
  title: string;
  welcome_text: string;
  confirmation: {
    template: string;
    check_in_message: string;
    check_out_message: string;
    break_start_message: string;
    break_end_message: string;
    return_seconds: number;
    sound_enabled: boolean;
    vibration_enabled: boolean;
  };
  card_display: {
    show_name: boolean;
    show_participant_code: boolean;
    show_email: boolean;
  };
  input_fields: string[];
  structured: boolean;
  require_class_pin: boolean;
  participant_code_label: string;
};

type KioskVisualDesign = {
  header: {
    enabled: boolean;
    height: number;
    background: { mode: string; color: string; color2: string | null; gradient_angle: number };
    logo: string | null;
    alignment: string;
    title: { text: string; font: string; size_rem: number; color: string; effects: { shadow: boolean; outline: boolean } };
  };
  main: {
    background: { mode: string; color: string; color2: string | null; gradient_angle: number };
    image_transform: { focal_x: number; focal_y: number; zoom: number };
    overlay: number;
    layout_preset: string;
    input_template: string;
    card_template: string;
    title: { text: string; font: string; size_rem: number; color: string; alignment: string; effects: Record<string, unknown> };
    button_preset: string;
    input_preset: string;
    card_preset: string;
  };
  footer: {
    enabled: boolean;
    height: number;
    background: { mode: string; color: string; color2: string | null; gradient_angle: number };
    logo: string | null;
    text: { lines: string[]; alignment: string; font: string; size_rem: number; color: string; effects: Record<string, unknown> };
  };
};

type KioskPerson = {
  membership_id?: number;
  group_only_participant_id?: number;
  participant_kind: "member" | "group_only_participant";
  name: string;
  email: string;
  group_participant_code: string;
  photo_url: string | null;
  requires_pin: boolean;
};

type KioskClass = {
  id: number;
  name: string;
  participant_count: number;
  has_class_pin: boolean;
};

type ParticipantState = {
  is_checked_in: boolean;
  is_on_break: boolean;
  break_count: number;
};

type IdentifyResult = {
  code: string;
  participant: {
    id: number;
    name: string;
    group_participant_code: string;
    photo_url: string | null;
    email: string;
  };
  attendance_state: ParticipantState;
  allowed_actions: ActionType[];
};

type PerformResult = {
  code: string;
  action_record: Record<string, unknown>;
  confirmation: {
    template: string;
    message: string;
    return_delay_seconds: number;
    sound_enabled: boolean;
    vibration_enabled: boolean;
    action: string;
  };
  success_message: string;
  return_delay_seconds: number;
  attendance_state: ParticipantState;
  allowed_actions: ActionType[];
};

export default function KioskScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { api, auth, t } = useApp();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;

  const [loading, setLoading] = useState(true);
  const [kiosk, setKiosk] = useState<Record<string, unknown> | null>(null);
  const [visualDesign, setVisualDesign] = useState<KioskVisualDesign | null>(null);
  const [kioskConfig, setKioskConfig] = useState<KioskConfig | null>(null);
  const [people, setPeople] = useState<KioskPerson[]>([]);
  const [classes, setClasses] = useState<KioskClass[]>([]);
  const [selectedClass, setSelectedClass] = useState<KioskClass | null>(null);
  const [classPin, setClassPin] = useState("");
  const [classPinBusy, setClassPinBusy] = useState(false);
  const [classPinError, setClassPinError] = useState("");

  const [identifier, setIdentifier] = useState("");
  const [pin, setPin] = useState("");
  const [exitCode, setExitCode] = useState("");
  const [participant, setParticipant] = useState<IdentifyResult["participant"] | null>(null);
  const [attendanceState, setAttendanceState] = useState<ParticipantState>({ is_checked_in: false, is_on_break: false, break_count: 0 });
  const [allowedActions, setAllowedActions] = useState<ActionType[]>([]);
  const [message, setMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [showExit, setShowExit] = useState(false);
  const [cardPin, setCardPin] = useState("");
  const [cardPinBusy, setCardPinBusy] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await api.post(endpoints.kiosk(groupId), {});
        const data = await api.get<Record<string, unknown>>(endpoints.kiosk(groupId));
        if (!cancelled) {
          setKiosk(data);
          const vd = (data as any).visual_design as KioskVisualDesign | undefined;
          setVisualDesign(vd || null);
          const kc: KioskConfig = {
            kiosk_mode: (data as any).kiosk_mode || "card",
            theme: (data as any).theme || "classic",
            title: (data as any).title || "",
            welcome_text: (data as any).welcome_text || "",
            confirmation: (data as any).confirmation || { template: "clean", return_seconds: 3, sound_enabled: true, vibration_enabled: false, check_in_message: "", check_out_message: "", break_start_message: "", break_end_message: "" },
            card_display: (data as any).card_display || { show_name: true, show_participant_code: true, show_email: false },
            input_fields: (data as any).input_fields || ["name"],
            structured: Boolean((data as any).structured),
            require_class_pin: Boolean((data as any).require_class_pin),
            participant_code_label: (data as any).participant_code_label || "Code",
          };
          setKioskConfig(kc);
          if ((data as any).people) setPeople((data as any).people as KioskPerson[]);
          if ((data as any).classes) setClasses((data as any).classes as KioskClass[]);
        }
      } catch (err) {
        if (!cancelled) setMessage(err instanceof Error ? err.message : t("common.error"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [api, groupId, t]);

  const groupFlags = useMemo(
    () => ({
      check_in_enabled: Boolean((kiosk as any)?.group?.check_in_enabled ?? true),
      check_out_enabled: Boolean((kiosk as any)?.group?.check_out_enabled ?? true),
      breaks_enabled: Boolean((kiosk as any)?.group?.breaks_enabled ?? false),
      max_breaks: Number((kiosk as any)?.group?.max_breaks ?? 0),
    }),
    [kiosk],
  );

  const actions = participant ? getValidActionsForState(groupFlags, attendanceState) : [];

  const bgColor = visualDesign?.main.background.color || "#FFFFFF";
  const headerBgColor = visualDesign?.header.background.color || "#2563EB";
  const footerBgColor = visualDesign?.footer.background.color || "#1E293B";
  const headerTextColor = visualDesign?.header.title.color || "#FFFFFF";
  const mainTextColor = visualDesign?.main.title.color || "#111827";
  const buttonBg = visualDesign?.main.button_preset === "flat" ? "transparent" : visualDesign?.main.button_preset === "pill" ? colors.blue : colors.blue;
  const cardBorder = visualDesign?.main.card_preset === "bordered" ? colors.border : "transparent";
  const cardShadow = visualDesign?.main.card_preset === "elevated" ? 0.08 : 0;
  const cardBg = visualDesign?.main.card_preset === "flat" ? "transparent" : colors.surface;
  const headerEnabled = visualDesign?.header.enabled ?? true;
  const footerEnabled = visualDesign?.footer.enabled ?? true;
  const headerTitle = visualDesign?.header.title.text || "";
  const mainTitle = visualDesign?.main.title.text || "";
  const footerLines = visualDesign?.footer.text.lines || [];
  const showMainTitle = kioskConfig?.welcome_text || mainTitle;

  const fadeIn = () => {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  };

  useEffect(() => { if (participant) fadeIn(); }, [participant]);

  const cardWidth = useMemo(() => {
    const gap = 12;
    const cols = landscape ? 4 : width > 400 ? 3 : 2;
    return Math.floor((width - gap * (cols + 1)) / cols);
  }, [width, landscape]);

  async function selectPerson(person: KioskPerson) {
    if (person.requires_pin) {
      setCardPinBusy(true);
      setMessage("");
      try {
        const data = await api.post<IdentifyResult>(endpoints.kioskIdentify(groupId), {
          participant_kind: person.participant_kind,
          membership_id: person.membership_id,
          group_only_participant_id: person.group_only_participant_id,
        });
        setParticipant(data.participant);
        setAttendanceState(data.attendance_state);
        setAllowedActions(data.allowed_actions);
        if (data.attendance_state.is_checked_in) setMessage(`Already checked in (${data.participant.name})`);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : t("common.error"));
      } finally { setCardPinBusy(false); }
    } else {
      setBusy(true); setMessage("");
      try {
        const data = await api.post<IdentifyResult>(endpoints.kioskIdentify(groupId), {
          participant_kind: person.participant_kind,
          membership_id: person.membership_id,
          group_only_participant_id: person.group_only_participant_id,
        });
        setParticipant(data.participant);
        setAttendanceState(data.attendance_state);
        setAllowedActions(data.allowed_actions);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : t("common.error"));
      } finally { setBusy(false); }
    }
  }

  async function identifyInput() {
    setBusy(true); setMessage(""); setSuccessMessage("");
    try {
      const data = await api.post<IdentifyResult>(endpoints.kioskIdentify(groupId), {
        participant_code: identifier.trim().toUpperCase(),
        pin: pin.trim() || undefined,
      });
      setParticipant(data.participant);
      setAttendanceState(data.attendance_state);
      setAllowedActions(data.allowed_actions);
    } catch (err) {
      setParticipant(null);
      setMessage(err instanceof Error ? err.message : t("common.error"));
    } finally { setBusy(false); }
  }

  async function perform(action: ActionType) {
    setBusy(true); setMessage(""); setSuccessMessage("");
    try {
      const data = await api.post<PerformResult>(endpoints.kioskPerform(groupId), {
        action_type: action,
        participant_code: identifier.trim().toUpperCase(),
        pin: pin.trim() || undefined,
      });
      setAttendanceState(data.attendance_state);
      setAllowedActions(data.allowed_actions);
      setSuccessMessage(data.confirmation?.message || data.success_message || `${action} recorded`);
      if (data.confirmation?.return_delay_seconds) {
        setTimeout(() => setSuccessMessage(""), data.confirmation.return_delay_seconds * 1000);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t("common.error"));
    } finally { setBusy(false); }
  }

  async function performCardAction(action: ActionType) {
    setBusy(true); setMessage(""); setSuccessMessage("");
    try {
      const data = await api.post<PerformResult>(endpoints.kioskPerform(groupId), {
        action_type: action,
        participant_kind: participant?.id ? "member" : "group_only_participant",
        membership_id: participant?.id,
      });
      setAttendanceState(data.attendance_state);
      setAllowedActions(data.allowed_actions);
      setSuccessMessage(data.confirmation?.message || data.success_message || `${action} recorded`);
      if (data.confirmation?.return_delay_seconds) {
        setTimeout(() => setSuccessMessage(""), data.confirmation.return_delay_seconds * 1000);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t("common.error"));
    } finally { setBusy(false); }
  }

  async function exitKiosk() {
    setBusy(true);
    try {
      await api.post(endpoints.kioskExit(), { group_id: Number(groupId), exit_code: exitCode.trim() });
      await auth.bootstrap();
      router.replace("/(app)/(tabs)/home");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t("common.error"));
    } finally { setBusy(false); }
  }

  async function verifyClassPin() {
    setClassPinBusy(true); setClassPinError("");
    try {
      await api.post(endpoints.kioskIdentify(groupId).replace("/identify/", `/classes/${selectedClass!.id}/verify-pin/`), { pin: classPin.trim() });
      setClassPin("");
    } catch (err) {
      setClassPinError(err instanceof Error ? err.message : t("common.error"));
    } finally { setClassPinBusy(false); }
  }

  function returnToKiosk() {
    setParticipant(null);
    setAttendanceState({ is_checked_in: false, is_on_break: false, break_count: 0 });
    setAllowedActions([]);
    setIdentifier("");
    setPin("");
    setCardPin("");
    setSuccessMessage("");
    setMessage("");
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: bgColor }}>
        <LoadingState label={t("common.loading")} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: bgColor }}>
      <StatusBar barStyle="light-content" hidden />
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        {headerEnabled ? (
          <View style={[styles.header, { backgroundColor: headerBgColor }]}>
            <Text style={[styles.headerTitle, { color: headerTextColor }]}>
              {headerTitle || (kiosk as any)?.group?.name || t("kiosk.title")}
            </Text>
            <Pressable onPress={() => setShowExit(!showExit)} style={styles.headerExit}>
              <Text style={[styles.headerExitText, { color: headerTextColor }]}>✕</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Main content */}
        <ScrollView
          contentContainerStyle={styles.mainContent}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
        >
          {showMainTitle ? (
            <Text style={[styles.welcomeTitle, { color: mainTextColor }]}>
              {showMainTitle}
            </Text>
          ) : null}

          {successMessage ? (
            <View style={styles.confirmation}>
              <Text style={[styles.confirmationText, { color: mainTextColor }]}>{successMessage}</Text>
            </View>
          ) : null}

          {message ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{message}</Text>
            </View>
          ) : null}

          {kioskConfig?.structured && !selectedClass && classes.length > 0 ? (
            <View style={styles.classGrid}>
              <Text style={[styles.sectionTitle, { color: mainTextColor }]}>
                {t("kiosk.selectClass") || "Select a class"}
              </Text>
              {classes.map((cls) => (
                <Pressable
                  key={cls.id}
                  onPress={() => setSelectedClass(cls)}
                  style={({ pressed }) => [styles.classCard, pressed && { opacity: 0.8 }]}
                >
                  <Text style={[styles.className, { color: mainTextColor }]}>{cls.name}</Text>
                  <Text style={styles.classCount}>{cls.participant_count} {t("groups.participants", { count: cls.participant_count })}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {kioskConfig?.structured && selectedClass && kioskConfig.require_class_pin && !classPinError ? (
            <View style={styles.inputSection}>
              <Text style={[styles.sectionTitle, { color: mainTextColor }]}>
                {selectedClass.name} — {t("kiosk.enterClassPin") || "Enter class PIN"}
              </Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, { color: mainTextColor, borderColor: colors.border }]}
                  value={classPin}
                  onChangeText={setClassPin}
                  secureTextEntry
                  placeholder="PIN"
                  placeholderTextColor={colors.placeholder}
                />
                <Pressable
                  onPress={() => void verifyClassPin()}
                  disabled={classPinBusy || !classPin.trim()}
                  style={[styles.actionButton, { backgroundColor: buttonBg }]}
                >
                  <Text style={styles.actionButtonText}>{t("kiosk.verify") || "Verify"}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {!participant && !successMessage && !kioskConfig?.structured ? (
            <>
              {kioskConfig?.kiosk_mode === "card" && people.length > 0 ? (
                <View style={styles.cardGrid}>
                  {people.map((person, idx) => (
                    <Pressable
                      key={person.membership_id || person.group_only_participant_id || idx}
                      onPress={() => void selectPerson(person)}
                      disabled={cardPinBusy || busy}
                      style={({ pressed }) => [
                        styles.personCard,
                        {
                          backgroundColor: cardBg,
                          borderColor: cardBorder,
                          width: cardWidth,
                          shadowOpacity: cardShadow,
                        },
                        pressed && { transform: [{ scale: 0.97 }] },
                      ]}
                    >
                      {kioskConfig?.card_display.show_participant_code ? (
                        <Text style={[styles.cardCode, { color: mainTextColor }]}>
                          {person.group_participant_code}
                        </Text>
                      ) : null}
                      <Avatar name={person.name} size={cardWidth * 0.35} url={person.photo_url} />
                      {kioskConfig?.card_display.show_name ? (
                        <Text numberOfLines={2} style={[styles.cardName, { color: mainTextColor }]}>
                          {person.name}
                        </Text>
                      ) : null}
                      {kioskConfig?.card_display.show_email && person.email ? (
                        <Text numberOfLines={1} style={[styles.cardEmail, { color: colors.textMuted }]}>
                          {person.email}
                        </Text>
                      ) : null}
                      {person.requires_pin ? (
                        <Text style={styles.cardPinBadge}>PIN</Text>
                      ) : null}
                    </Pressable>
                  ))}
                </View>
              ) : null}

              {kioskConfig?.kiosk_mode === "input" || (kioskConfig?.kiosk_mode === "card" && people.length === 0) ? (
                <View style={styles.inputSection}>
                  <Text style={[styles.sectionTitle, { color: mainTextColor }]}>
                    {kioskConfig?.title || t("kiosk.identify")}
                  </Text>
                  <View style={styles.inputRow}>
                    <TextInput
                      style={[styles.input, { color: mainTextColor, borderColor: colors.border }]}
                      value={identifier}
                      onChangeText={setIdentifier}
                      autoCapitalize="characters"
                      placeholder={kioskConfig?.participant_code_label || t("kiosk.code") || "Code"}
                      placeholderTextColor={colors.placeholder}
                    />
                    {kioskConfig?.input_fields.includes("pin") ? (
                      <TextInput
                        style={[styles.input, { color: mainTextColor, borderColor: colors.border }]}
                        value={pin}
                        onChangeText={setPin}
                        secureTextEntry
                        placeholder="PIN"
                        placeholderTextColor={colors.placeholder}
                      />
                    ) : null}
                    <Pressable
                      onPress={() => void identifyInput()}
                      disabled={busy || !identifier.trim()}
                      style={[styles.actionButton, { backgroundColor: buttonBg }]}
                    >
                      <Text style={styles.actionButtonText}>{t("kiosk.identify")}</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </>
          ) : null}

          {participant && !successMessage ? (
            <Animated.View style={[styles.identifiedSection, { opacity: fadeAnim }]}>
              <Avatar name={participant.name} size={64} url={participant.photo_url} />
              <Text style={[styles.identifiedName, { color: mainTextColor }]}>{participant.name}</Text>
              <Text style={styles.identifiedCode}>{participant.group_participant_code}</Text>

              <View style={styles.actionsRow}>
                {actions.map((action) => (
                  <Pressable
                    key={action}
                    onPress={() => void performCardAction(action)}
                    disabled={busy}
                    style={({ pressed }) => [
                      styles.actionButton,
                      { backgroundColor: buttonBg, minWidth: 100 },
                      pressed && { opacity: 0.8 },
                    ]}
                  >
                    <Text style={styles.actionButtonText}>
                      {action === "check_in" ? (t("kiosk.checkIn") || "Check in") :
                       action === "check_out" ? (t("kiosk.checkOut") || "Check out") :
                       action === "break_start" ? (t("kiosk.breakStart") || "Break start") :
                       (t("kiosk.breakEnd") || "Break end")}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Pressable onPress={returnToKiosk} style={styles.backLink}>
                <Text style={styles.backLinkText}>{t("kiosk.back") || "Back to kiosk"}</Text>
              </Pressable>
            </Animated.View>
          ) : null}
        </ScrollView>

        {/* Footer */}
        {footerEnabled && footerLines.length > 0 ? (
          <View style={[styles.footer, { backgroundColor: footerBgColor }]}>
            {footerLines.map((line, i) => (
              <Text key={i} style={[styles.footerText, { color: visualDesign?.footer.text.color || "#94A3B8" }]}>
                {line}
              </Text>
            ))}
          </View>
        ) : null}

        {/* Exit modal */}
        {showExit ? (
          <View style={styles.exitOverlay}>
            <View style={styles.exitPanel}>
              <Text style={styles.exitTitle}>{t("kiosk.exit") || "Exit kiosk"}</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, width: "100%" }]}
                value={exitCode}
                onChangeText={setExitCode}
                secureTextEntry
                placeholder={t("kiosk.exitCode") || "Exit code"}
                placeholderTextColor={colors.placeholder}
              />
              <View style={styles.exitActions}>
                <Pressable
                  onPress={() => { setShowExit(false); setExitCode(""); }}
                  style={[styles.actionButton, { backgroundColor: colors.surfaceMuted, flex: 1 }]}
                >
                  <Text style={[styles.actionButtonText, { color: colors.text }]}>{t("common.cancel") || "Cancel"}</Text>
                </Pressable>
                <Pressable
                  onPress={() => void exitKiosk()}
                  disabled={busy || !exitCode.trim()}
                  style={[styles.actionButton, { backgroundColor: colors.danger, flex: 1 }]}
                >
                  <Text style={styles.actionButtonText}>{t("kiosk.exit") || "Exit"}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

const { width } = Dimensions.get("window");

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 56 },
  headerTitle: { fontSize: 18, fontWeight: "700", flex: 1 },
  headerExit: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headerExitText: { fontSize: 18, fontWeight: "600" },
  mainContent: { padding: space.lg, gap: space.lg, paddingBottom: space.xxxl },
  welcomeTitle: { fontSize: 22, fontWeight: "700", textAlign: "center", paddingVertical: space.md },
  sectionTitle: { fontSize: 17, fontWeight: "600", textAlign: "center" },
  cardGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "center" },
  personCard: { borderRadius: 14, padding: space.md, alignItems: "center", gap: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, elevation: 3, borderWidth: 1 },
  cardCode: { fontSize: 12, fontWeight: "700", opacity: 0.6 },
  cardName: { fontSize: 14, fontWeight: "600", textAlign: "center" },
  cardEmail: { fontSize: 11, textAlign: "center" },
  cardPinBadge: { fontSize: 10, fontWeight: "700", color: colors.warningText, backgroundColor: colors.warningSoft, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: "hidden" },
  inputSection: { gap: space.md },
  inputRow: { gap: space.sm },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, fontSize: 16, backgroundColor: "rgba(255,255,255,0.9)" },
  actionButton: { minHeight: 48, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: space.xl },
  actionButtonText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  identifiedSection: { alignItems: "center", gap: space.md, paddingVertical: space.xl },
  identifiedName: { fontSize: 22, fontWeight: "700" },
  identifiedCode: { fontSize: 14, color: colors.textMuted },
  actionsRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, justifyContent: "center", marginTop: space.md },
  backLink: { paddingVertical: space.md },
  backLinkText: { fontSize: 14, fontWeight: "600", color: colors.blue, textDecorationLine: "underline" },
  classGrid: { gap: space.md },
  classCard: { backgroundColor: colors.surface, borderRadius: 14, padding: space.xlg, borderWidth: 1, borderColor: colors.border },
  className: { fontSize: 17, fontWeight: "600" },
  classCount: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  confirmation: { backgroundColor: "rgba(34, 197, 94, 0.15)", borderRadius: 14, padding: space.xl, alignItems: "center" },
  confirmationText: { fontSize: 18, fontWeight: "700", textAlign: "center" },
  errorBanner: { backgroundColor: "rgba(220, 38, 38, 0.12)", borderRadius: 10, padding: space.md },
  errorText: { fontSize: 14, color: colors.danger, textAlign: "center" },
  exitOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: space.xl },
  exitPanel: { backgroundColor: colors.surface, borderRadius: 20, padding: space.xl, width: "100%", maxWidth: 360, gap: space.md, alignItems: "center" },
  exitTitle: { fontSize: 20, fontWeight: "700", color: colors.text },
  exitActions: { flexDirection: "row", gap: space.sm, width: "100%" },
  footer: { paddingHorizontal: space.lg, paddingVertical: space.sm, alignItems: "center" },
  footerText: { fontSize: 12, textAlign: "center" },
});

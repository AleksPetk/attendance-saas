import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, BackHandler, Platform, type AppStateStatus, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { endpoints, isMissingCredentialsError } from "@checkstation/api";
import { type ActionType } from "@checkstation/domain";
import { kioskActionPayload, kioskIdentityPayload, type KioskIdentity } from "../../src/lib/kioskRequests";
import { LoadingState } from "../../src/components/ui";
import { AuthenticatedImage } from "../../src/components/Avatar";
import { useApp } from "../../src/lib/AppProvider";
import { loadAuthenticatedMediaDataUri } from "../../src/lib/authenticatedMedia";
import {
  isKioskRefreshIdle,
  KIOSK_SOFT_REFRESH_MS,
  resolveStructuredClassAfterRefresh,
  shouldRefreshOnForeground,
  shouldRunPeriodicRefresh,
} from "../../src/lib/kioskLiveRefresh";
import {
  createKioskInactivityTimer,
  hasNonEmptyKioskInput,
  shouldArmKioskInactivity,
} from "../../src/lib/kioskInactivityTimeout";
import {
  clearAllKioskExitTokens,
  clearKioskExitToken,
  loadKioskExitToken,
  saveKioskExitToken,
} from "../../src/lib/kioskExitCredential";
import { resolveKioskAndroidBack } from "../../src/lib/kioskAndroidBack";
import { kioskPreviewGridColumns, kioskSafeInsetsForViewport, kioskViewportProfile, phoneKioskPresentation } from "../../src/lib/kioskEditorLayout";
import { KioskWebLivePreview } from "../../src/lib/kioskWebPreview/KioskWebPreview";
import { kioskOverlayColor, normalizeKioskDesignDocument, type KioskDesignDocument } from "../../src/lib/kioskVisualDesign";
import { colors, space } from "../../src/theme/tokens";
import { fetch as expoFetch } from "expo/fetch";

function actionLabel(action: ActionType, t: (key: string, vars?: Record<string, string | number>) => string) {
  if (action === "check_in") return t("kiosk.checkIn") || "Check-in";
  if (action === "check_out") return t("kiosk.checkOut") || "Check-out";
  if (action === "break_start") return t("kiosk.breakStart") || "Break start";
  return t("kiosk.breakEnd") || "Break end";
}
type KioskConfig = {
  kiosk_mode: "card" | "input";
  use_pin: boolean;
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

type KioskPerson = {
  membership_id?: number;
  group_only_participant_id?: number;
  participant_kind: "member" | "group_only_participant";
  name: string;
  email: string;
  participant_code: string;
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
  participant: KioskIdentity & {
    id?: number;
    name: string;
    participant_code: string;
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
  const { api, auth, authState, t } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const gridColumns = kioskPreviewGridColumns(width, height);
  const viewportProfile = kioskViewportProfile(width, height);
  const phonePresentation = phoneKioskPresentation(viewportProfile, height);
  const kioskInsets = useMemo(
    () => kioskSafeInsetsForViewport(viewportProfile, insets),
    [insets.bottom, insets.left, insets.right, insets.top, viewportProfile],
  );
  const workspaceMediaKey = String(authState.session?.workspace?.id ?? groupId ?? "unknown");

  const [loading, setLoading] = useState(true);
  const [kiosk, setKiosk] = useState<Record<string, unknown> | null>(null);
  const [design, setDesign] = useState<KioskDesignDocument | null>(null);
  const [kioskConfig, setKioskConfig] = useState<KioskConfig | null>(null);
  const [people, setPeople] = useState<KioskPerson[]>([]);
  const [classes, setClasses] = useState<KioskClass[]>([]);
  const [classReady, setClassReady] = useState(false);
  const [pendingPerson, setPendingPerson] = useState<KioskPerson | null>(null);
  const [secondValue, setSecondValue] = useState("");
  const performLock = useRef(false);
  const returnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshInFlight = useRef(false);
  const pendingSoftRefresh = useRef(false);
  const lastRefreshAtRef = useRef<number | null>(null);
  const wasBackgroundedRef = useRef(false);
  const appActiveRef = useRef(AppState.currentState === "active");
  const selectedClassRef = useRef<KioskClass | null>(null);
  const idleSnapshotRef = useRef({
    busy: false,
    performLocked: false,
    hasParticipant: false,
    hasPendingPerson: false,
    hasSuccessMessage: false,
    showExit: false,
    classPinBusy: false,
    sessionExpired: false,
    refreshInFlight: false,
  });
  useEffect(() => () => { if (returnTimer.current) clearTimeout(returnTimer.current); }, []);
  const [selectedClass, setSelectedClass] = useState<KioskClass | null>(null);
  const [classPin, setClassPin] = useState("");
  const [classPinBusy, setClassPinBusy] = useState(false);
  const [classPinError, setClassPinError] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);

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
  const [resolvedPhotos, setResolvedPhotos] = useState<Record<string, string>>({});
  const [resolvedKioskMedia, setResolvedKioskMedia] = useState<{
    headerLogoUrl?: string;
    footerLogoUrl?: string;
    backgroundUrl?: string;
  }>({});
  const [resolvedParticipantPhoto, setResolvedParticipantPhoto] = useState<string | null>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof createKioskInactivityTimer> | null>(null);
  const resetInactivityRef = useRef(() => {});
  const [inactivityRemaining, setInactivityRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      const action = resolveKioskAndroidBack({
        exitOpen: showExit,
        sessionExpired,
      });
      if (action === "open_exit") {
        setShowExit(true);
        return true;
      }
      if (action === "close_exit") {
        setShowExit(false);
        setExitCode("");
        return true;
      }
      return true; // ignore — keep overlay
    });
    return () => sub.remove();
  }, [showExit, sessionExpired]);

  selectedClassRef.current = selectedClass;
  idleSnapshotRef.current = {
    busy,
    performLocked: performLock.current,
    hasParticipant: Boolean(participant),
    hasPendingPerson: Boolean(pendingPerson),
    hasSuccessMessage: Boolean(successMessage),
    showExit,
    classPinBusy,
    sessionExpired,
    refreshInFlight: refreshInFlight.current,
  };

  const inputProgress = hasNonEmptyKioskInput({
    identifier,
    pin,
    secondValue,
    cardPin,
  });
  const onClassPinScreen = Boolean(
    kioskConfig?.structured
    && selectedClass
    && kioskConfig.require_class_pin
    && !classReady,
  );
  const participantSensitive = Boolean(participant)
    || Boolean(pendingPerson)
    || onClassPinScreen
    || (kioskConfig?.kiosk_mode === "input" && inputProgress && !successMessage);

  function noteParticipantText(setter: (value: string) => void) {
    return (value: string) => {
      inactivityTimerRef.current?.noteActivity();
      setter(value);
    };
  }
  const interactionBusy = busy || performLock.current;
  const inactivityArmed = shouldArmKioskInactivity({
    participantSensitive,
    interactionBusy,
    successVisible: Boolean(successMessage),
    exitOpen: showExit,
    sessionExpired,
    loading,
  });

  const markSessionExpired = useCallback(() => {
    setSessionExpired(true);
    setBusy(false);
    performLock.current = false;
    setPendingPerson(null);
    setParticipant(null);
    setSuccessMessage("");
    setMessage("");
  }, []);

  const applyKioskPayload = useCallback(async (data: Record<string, unknown>) => {
    const saved = (data.kiosk_settings || data.kiosk || {}) as Partial<KioskConfig>;
    const kc: KioskConfig = {
      use_pin: saved.use_pin ?? false,
      kiosk_mode: saved.kiosk_mode || "card",
      theme: saved.theme || "classic",
      title: saved.title || "",
      welcome_text: saved.welcome_text || "",
      confirmation: saved.confirmation || { template: "clean", return_seconds: 3, sound_enabled: true, vibration_enabled: false, check_in_message: "", check_out_message: "", break_start_message: "", break_end_message: "" },
      card_display: { show_name: true, show_participant_code: true, show_email: false, ...saved.card_display },
      input_fields: saved.input_fields || ["participant_code"],
      structured: Boolean(saved.structured),
      require_class_pin: Boolean(saved.require_class_pin),
      participant_code_label: saved.participant_code_label || "Code",
    };
    const nextClasses = ((data as { classes?: KioskClass[] }).classes || []) as KioskClass[];
    const classResolution = resolveStructuredClassAfterRefresh(selectedClassRef.current, nextClasses);

    setKiosk(data);
    setDesign(normalizeKioskDesignDocument((data as { visual_design?: unknown }).visual_design));
    setKioskConfig(kc);
    setClasses(nextClasses);

    if (kc.structured) {
      setSelectedClass(classResolution.selected);
      setClassReady(classResolution.classReady);
      if (classResolution.clearPeople) {
        setPeople([]);
      } else if (classResolution.selected) {
        try {
          const classPeople = await api.get<{ people: KioskPerson[] }>(
            `${endpoints.kiosk(groupId)}classes/${classResolution.selected.id}/people/`,
          );
          setPeople(classPeople.people || []);
        } catch (err) {
          if (isMissingCredentialsError(err)) {
            markSessionExpired();
            return;
          }
        }
      }
    } else if ((data as { people?: KioskPerson[] }).people) {
      setPeople((data as { people: KioskPerson[] }).people);
    }
  }, [api, groupId, markSessionExpired]);

  const refreshKiosk = useCallback(async (opts?: { soft?: boolean; force?: boolean }) => {
    const soft = Boolean(opts?.soft);
    const force = Boolean(opts?.force);
    if (sessionExpired && soft) return;
    if (refreshInFlight.current) {
      pendingSoftRefresh.current = true;
      return;
    }
    if (!force && soft && !isKioskRefreshIdle({
      ...idleSnapshotRef.current,
      performLocked: performLock.current,
      refreshInFlight: refreshInFlight.current,
    })) {
      pendingSoftRefresh.current = true;
      return;
    }

    refreshInFlight.current = true;
    try {
      if (!soft) {
        const start = await api.post<{ kiosk_exit_token?: string }>(endpoints.kiosk(groupId), {});
        const issued = String(start?.kiosk_exit_token || "").trim();
        if (issued) {
          await saveKioskExitToken(groupId, issued);
        }
      }
      const data = await api.get<Record<string, unknown>>(endpoints.kiosk(groupId));
      await applyKioskPayload(data);
      lastRefreshAtRef.current = Date.now();
      if (!soft) setLoading(false);
    } catch (err) {
      if (isMissingCredentialsError(err)) {
        markSessionExpired();
        if (!soft) setLoading(false);
        return;
      }
      if (!soft) {
        setMessage(err instanceof Error ? err.message : t("common.error"));
        setLoading(false);
      }
      // Soft refresh failures keep last successful kiosk content.
    } finally {
      refreshInFlight.current = false;
      if (
        pendingSoftRefresh.current
        && isKioskRefreshIdle({
          ...idleSnapshotRef.current,
          performLocked: performLock.current,
          refreshInFlight: false,
          sessionExpired,
        })
        && !sessionExpired
      ) {
        pendingSoftRefresh.current = false;
        void refreshKiosk({ soft: true });
      }
    }
  }, [api, applyKioskPayload, groupId, markSessionExpired, sessionExpired, t]);

  useFocusEffect(useCallback(() => {
    void refreshKiosk({ soft: false, force: true });
    return () => {};
  }, [refreshKiosk]));

  useEffect(() => {
    const onAppState = (next: AppStateStatus) => {
      if (next === "active") {
        const should = shouldRefreshOnForeground({
          wasBackgrounded: wasBackgroundedRef.current,
          now: Date.now(),
          lastRefreshAt: lastRefreshAtRef.current,
        });
        appActiveRef.current = true;
        wasBackgroundedRef.current = false;
        if (should) void refreshKiosk({ soft: true });
      } else if (next === "background" || next === "inactive") {
        appActiveRef.current = false;
        wasBackgroundedRef.current = true;
      }
    };
    const sub = AppState.addEventListener("change", onAppState);
    return () => sub.remove();
  }, [refreshKiosk]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!shouldRunPeriodicRefresh({
        now: Date.now(),
        lastRefreshAt: lastRefreshAtRef.current,
        appActive: appActiveRef.current,
      })) {
        return;
      }
      void refreshKiosk({ soft: true });
    }, KIOSK_SOFT_REFRESH_MS);
    return () => clearInterval(timer);
  }, [refreshKiosk]);

  useEffect(() => {
    if (
      pendingSoftRefresh.current
      && isKioskRefreshIdle({
        ...idleSnapshotRef.current,
        performLocked: performLock.current,
        refreshInFlight: refreshInFlight.current,
      })
      && !sessionExpired
      && !refreshInFlight.current
    ) {
      pendingSoftRefresh.current = false;
      void refreshKiosk({ soft: true });
    }
  }, [
    busy,
    participant,
    pendingPerson,
    successMessage,
    showExit,
    classPinBusy,
    sessionExpired,
    refreshKiosk,
  ]);

  // The production server owns action availability, including check-out-only Groups.
  const actions = participant ? allowedActions : [];

  const visualDesign = design?.config;
  const bgColor = visualDesign?.main.background.color ?? "#FFFFFF";
  const headerTextColor = visualDesign?.header.title.color ?? "#FFFFFF";
  const mainTextColor = visualDesign?.main.title.color ?? "#111827";
  const buttonBg = colors.blue;
  const buttonRadius = visualDesign?.main.button_preset === "pill" ? 999 : visualDesign?.main.button_preset === "flat" ? 2 : 10;
  const inputAppearance = visualDesign?.main.input_preset === "minimal" ? { backgroundColor: "transparent", borderWidth: 0, borderBottomWidth: 2, borderRadius: 0 } : visualDesign?.main.input_preset === "filled" ? { backgroundColor: "rgba(241,245,249,0.94)", borderWidth: 0 } : { backgroundColor: "rgba(255,255,255,0.94)", borderWidth: 1 };
  const headerEnabled = visualDesign?.header.enabled ?? true;
  const footerEnabled = visualDesign?.footer.enabled ?? true;
  const headerTitle = visualDesign?.header.title.text ?? "";
  const mainTitle = visualDesign?.main.title.text ?? "";
  const footerLines = visualDesign?.footer.text.lines ?? [];
  const showMainTitle = kioskConfig?.welcome_text || mainTitle;
  const phoneScale = viewportProfile === "phone-landscape" ? 0.82 : 0.88;
  const configuredHeaderTitleSize = (visualDesign?.header.title.size_rem ?? 1.5) * 16;
  const configuredMainTitleSize = (visualDesign?.main.title.size_rem ?? 1.75) * 16;
  const configuredFooterTextSize = (visualDesign?.footer.text.size_rem ?? 0.875) * 16;
  const headerTitleSize = phonePresentation
    ? Math.min(phonePresentation.headerTitleMax, Math.max(12, configuredHeaderTitleSize * phoneScale))
    : Math.max(14, configuredHeaderTitleSize);
  const mainTitleSize = phonePresentation
    ? Math.min(phonePresentation.mainTitleMax, Math.max(13, configuredMainTitleSize * phoneScale))
    : Math.max(16, configuredMainTitleSize);
  const footerTextSize = phonePresentation
    ? Math.min(phonePresentation.footerTextMax, Math.max(9, configuredFooterTextSize * phoneScale))
    : configuredFooterTextSize;
  const showWebCardBrowse = Boolean(
    visualDesign
    && kioskConfig?.kiosk_mode === "card"
    && !participant
    && !successMessage
    && !pendingPerson
    && (!kioskConfig.structured || (Boolean(selectedClass) && classReady))
    && people.length > 0,
  );
  const showWebInputIdentify = Boolean(
    visualDesign
    && kioskConfig?.kiosk_mode === "input"
    && !participant
    && !successMessage
    && (!kioskConfig.structured || (Boolean(selectedClass) && classReady)),
  );
  const showWebFlowPanel = Boolean(visualDesign && (participant || successMessage) && !pendingPerson);
  const webFlowMode = kioskConfig?.kiosk_mode === "input" ? "input" : "card";
  const webActionChoices = useMemo(
    () => actions.map((action) => ({ id: action, label: actionLabel(action, t) })),
    [actions, t],
  );
  const webActionParticipant = useMemo(() => {
    if (!participant) return null;
    return {
      name: participant.name || "",
      code: participant.participant_code || "",
      email: participant.email || "",
      photoUrl: resolvedParticipantPhoto,
    };
  }, [participant, resolvedParticipantPhoto]);
  const inputSecondField = kioskConfig?.input_fields.find((field) => field === "name" || field === "email");
  const inputShowPin = Boolean(kioskConfig?.use_pin || kioskConfig?.input_fields.includes("pin"));
  const webPeople = useMemo(
    () =>
      people.map((person) => {
        const id = kioskPersonPreviewId(person);
        return {
          id,
          name: person.name || "",
          code: person.participant_code || "",
          email: person.email || "",
          photoUrl: resolvedPhotos[id] || null,
        };
      }),
    [people, resolvedPhotos],
  );
  const backToClassesLabel = t("classes.back");
  const clearSelectedClass = () => {
    returnToKiosk();
    setSelectedClass(null);
    setClassReady(false);
    setPeople([]);
  };
  const classGridGap = space.md;
  const classGridHorizontalPad = phonePresentation
    ? phonePresentation.horizontalPadding * 2 + kioskInsets.left + kioskInsets.right
    : space.lg * 2;
  const classCardWidth = Math.max(
    120,
    (width - classGridHorizontalPad - classGridGap * (gridColumns - 1)) / gridColumns,
  );
  useEffect(() => {
    let cancelled = false;
    setResolvedKioskMedia({});
    void (async () => {
      const resolve = async (url: string | null | undefined) => {
        if (!url) return undefined;
        try {
          return await loadAuthenticatedMediaDataUri(api, url, {
            workspaceKey: workspaceMediaKey,
            fetchImpl: expoFetch as typeof fetch,
          });
        } catch {
          return undefined;
        }
      };
      const [headerLogoUrl, footerLogoUrl, backgroundUrl] = await Promise.all([
        resolve(design?.header_logo_url),
        resolve(design?.footer_logo_url),
        resolve(design?.main_background_image_url),
      ]);
      if (!cancelled) setResolvedKioskMedia({ headerLogoUrl, footerLogoUrl, backgroundUrl });
    })();
    return () => { cancelled = true; };
  }, [api, design?.footer_logo_url, design?.header_logo_url, design?.main_background_image_url, workspaceMediaKey]);

  useEffect(() => {
    let cancelled = false;
    const targets = people
      .map((person) => ({ id: kioskPersonPreviewId(person), url: person.photo_url }))
      .filter((entry) => Boolean(entry.url));
    if (!targets.length) {
      setResolvedPhotos({});
      return () => { cancelled = true; };
    }
    void (async () => {
      const next: Record<string, string> = {};
      await Promise.all(targets.map(async (entry) => {
        try {
          next[entry.id] = await loadAuthenticatedMediaDataUri(api, entry.url, {
            workspaceKey: workspaceMediaKey,
            fetchImpl: expoFetch as typeof fetch,
          });
        } catch {
          /* keep initials fallback when media fails */
        }
      }));
      if (!cancelled) setResolvedPhotos(next);
    })();
    return () => { cancelled = true; };
  }, [api, people, workspaceMediaKey]);

  useEffect(() => {
    let cancelled = false;
    const url = participant?.photo_url;
    if (!url) {
      setResolvedParticipantPhoto(null);
      return () => { cancelled = true; };
    }
    void (async () => {
      try {
        const uri = await loadAuthenticatedMediaDataUri(api, url, {
          workspaceKey: workspaceMediaKey,
          fetchImpl: expoFetch as typeof fetch,
        });
        if (!cancelled) setResolvedParticipantPhoto(uri);
      } catch {
        if (!cancelled) setResolvedParticipantPhoto(null);
      }
    })();
    return () => { cancelled = true; };
  }, [api, participant?.photo_url, workspaceMediaKey]);

  async function selectPerson(person: KioskPerson, pinValue?: string) {
    if (sessionExpired) return;
    if ((person.requires_pin || kioskConfig?.use_pin) && pinValue === undefined) {
      setPendingPerson(person); setCardPin(""); setMessage(""); return;
    }
    setBusy(true); setMessage("");
    try {
      const data = await api.post<IdentifyResult>(endpoints.kioskIdentify(groupId), {
        ...kioskIdentityPayload(person), ...(pinValue ? { pin: pinValue } : {}),
      });
      setParticipant(data.participant);
      setAttendanceState(data.attendance_state);
      setAllowedActions(data.allowed_actions);
      setPendingPerson(null);
    } catch (err) {
      if (isMissingCredentialsError(err)) { markSessionExpired(); return; }
      setMessage(err instanceof Error ? err.message : t("common.error"));
    }
    finally { setBusy(false); }
  }

  async function identifyInput(values?: { identifier?: string; second?: string; pin?: string }) {
    if (sessionExpired) return;
    const nextIdentifier = String(values?.identifier ?? identifier).trim();
    const nextSecond = String(values?.second ?? secondValue).trim();
    const nextPin = String(values?.pin ?? pin).trim();
    if (values) {
      setIdentifier(nextIdentifier);
      setSecondValue(nextSecond);
      setPin(nextPin);
    }
    setBusy(true); setMessage(""); setSuccessMessage("");
    try {
      const data = await api.post<IdentifyResult>(endpoints.kioskIdentify(groupId), {
        participant_code: nextIdentifier.toUpperCase(),
        pin: nextPin || undefined,
        ...(kioskConfig?.input_fields.includes("email") ? { email: nextSecond } : {}),
        ...(kioskConfig?.input_fields.includes("name") ? { name: nextSecond } : {}),
      });
      setParticipant(data.participant);
      setAttendanceState(data.attendance_state);
      setAllowedActions(data.allowed_actions);
    } catch (err) {
      if (isMissingCredentialsError(err)) { markSessionExpired(); return; }
      setParticipant(null);
      setMessage(err instanceof Error ? err.message : t("common.error"));
    } finally { setBusy(false); }
  }

  async function perform(action: ActionType) {
    if (sessionExpired || !participant || performLock.current) return;
    performLock.current = true; setBusy(true); setMessage(""); setSuccessMessage("");
    try {
      const data = await api.post<PerformResult>(endpoints.kioskPerform(groupId), kioskActionPayload(
        participant, action, kioskConfig?.kiosk_mode === "card" ? cardPin : pin,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      ));
      setAttendanceState(data.attendance_state); setAllowedActions(data.allowed_actions);
      setSuccessMessage(data.confirmation?.message || data.success_message || t("kiosk.recorded"));
      if (returnTimer.current) clearTimeout(returnTimer.current);
      const delay = data.confirmation?.return_delay_seconds ?? data.return_delay_seconds;
      if (typeof delay === "number") returnTimer.current = setTimeout(() => {
        returnToKiosk();
        if (kioskConfig?.structured) { setSelectedClass(null); setClassReady(false); setPeople([]); }
      }, Math.max(0, delay) * 1000);
    } catch (err) {
      if (isMissingCredentialsError(err)) { markSessionExpired(); return; }
      setMessage(err instanceof Error ? err.message : t("common.error"));
    }
    finally { performLock.current = false; setBusy(false); }
  }

  async function loadClassPeople(section: KioskClass) {
    if (sessionExpired) return;
    setClassPinBusy(true); setClassPinError("");
    try {
      const data = await api.get<{ people: KioskPerson[] }>(endpoints.kiosk(groupId) + "classes/" + section.id + "/people/");
      setPeople(data.people); setClassReady(true);
    } catch (err) {
      if (isMissingCredentialsError(err)) { markSessionExpired(); return; }
      setClassPinError(err instanceof Error ? err.message : t("common.error"));
    }
    finally { setClassPinBusy(false); }
  }
  function openClass(section: KioskClass) {
    if (sessionExpired) return;
    setSelectedClass(section); setClassReady(false); setClassPin(""); setClassPinError(""); setPeople([]);
    if (!kioskConfig?.require_class_pin) void loadClassPeople(section);
  }

  async function exitKiosk() {
    const recoveringFromExpiry = sessionExpired;
    setBusy(true);
    try {
      const scopedToken = await loadKioskExitToken(groupId);
      await api.post(endpoints.kioskExit(), {
        group_id: Number(groupId),
        exit_code: exitCode.trim(),
        ...(scopedToken ? { kiosk_exit_token: scopedToken } : {}),
      });
      await clearKioskExitToken(groupId);
      setSessionExpired(false);
      setShowExit(false);
      setExitCode("");
      if (recoveringFromExpiry) {
        try {
          await clearAllKioskExitTokens();
        } catch {
          /* ignore */
        }
        await auth.bootstrap();
        router.replace("/(auth)/sign-in");
      } else {
        await auth.bootstrap();
        router.replace("/(app)/(tabs)/home");
      }
    } catch (err) {
      if (isMissingCredentialsError(err) && recoveringFromExpiry) {
        setMessage(
          t("kiosk.sessionExpired.exitBlocked")
          || "Session expired. Exit could not be verified. Check the exit code and try again.",
        );
        setShowExit(true);
      } else {
        setMessage(err instanceof Error ? err.message : t("common.error"));
      }
    } finally { setBusy(false); }
  }

  async function verifyClassPin() {
    if (sessionExpired) return;
    setClassPinBusy(true); setClassPinError("");
    try {
      await api.post(endpoints.kioskIdentify(groupId).replace("/identify/", `/classes/${selectedClass!.id}/verify-pin/`), { pin: classPin.trim() });
      setClassPin("");
      await loadClassPeople(selectedClass!);
    } catch (err) {
      if (isMissingCredentialsError(err)) { markSessionExpired(); return; }
      setClassPinError(err instanceof Error ? err.message : t("common.error"));
    } finally { setClassPinBusy(false); }
  }

  function returnToKiosk() {
    if (returnTimer.current) clearTimeout(returnTimer.current);
    setPendingPerson(null); setSecondValue("");
    setParticipant(null);
    setAttendanceState({ is_checked_in: false, is_on_break: false, break_count: 0 });
    setAllowedActions([]);
    setIdentifier("");
    setPin("");
    setCardPin("");
    setClassPin("");
    setClassPinError("");
    setSuccessMessage("");
    setMessage("");
  }

  resetInactivityRef.current = () => {
    if (performLock.current || busy) return;
    returnToKiosk();
  };

  useEffect(() => {
    const timer = createKioskInactivityTimer({
      onTimeout: () => {
        resetInactivityRef.current();
      },
      onRemaining: setInactivityRemaining,
    });
    inactivityTimerRef.current = timer;
    return () => {
      timer.dispose();
      inactivityTimerRef.current = null;
    };
  }, []);

  useEffect(() => {
    inactivityTimerRef.current?.setArmed(inactivityArmed);
  }, [inactivityArmed]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: bgColor, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <StatusBar barStyle="light-content" hidden />
        <LoadingState label={t("common.loading")} />
      </View>
    );
  }

  return (
    <View
      style={{ flex: 1, backgroundColor: bgColor }}
      onTouchStart={() => inactivityTimerRef.current?.noteActivity()}
    >
      <StatusBar barStyle="light-content" hidden />
      <View style={phonePresentation ? styles.edgeToEdgeShell : { flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }}>
        {inactivityRemaining != null ? (
          <Text
            accessibilityLiveRegion="polite"
            style={{
              textAlign: "center",
              color: mainTextColor,
              opacity: 0.72,
              fontSize: 13,
              paddingHorizontal: 12,
              paddingTop: 6,
            }}
          >
            {t("kiosk.live.inactivity.returning", { seconds: inactivityRemaining })}
          </Text>
        ) : null}
        {showWebCardBrowse && visualDesign ? (
          <View style={{ flex: 1 }} testID="kiosk-live-web-shell">
            <KioskWebLivePreview
              config={visualDesign}
              mode="card"
              media={resolvedKioskMedia}
              people={webPeople}
              helperText={t("kiosk.live.participants.tapCard")}
              showName={kioskConfig?.card_display.show_name !== false}
              showCode={kioskConfig?.card_display.show_participant_code !== false}
              showEmail={Boolean(kioskConfig?.card_display.show_email)}
              interactivePeople
              gridColumns={gridColumns}
              viewportProfile={viewportProfile}
              safeInsets={kioskInsets}
              belowGridActionLabel={selectedClass ? backToClassesLabel : undefined}
              onPersonSelect={(id) => {
                const person = people.find((entry) => kioskPersonPreviewId(entry) === id);
                if (person && !busy) void selectPerson(person);
              }}
              onBelowGridAction={() => {
                if (!busy) clearSelectedClass();
              }}
              testID="kiosk-live-web-cards"
            />
            <Pressable
              accessibilityLabel={t("kiosk.exit")}
              hitSlop={8}
              onPress={() => setShowExit(true)}
              style={[
                styles.webExitButton,
                phonePresentation && {
                  top: kioskInsets.top + (viewportProfile === "phone-landscape" ? 0 : 5),
                  right: kioskInsets.right + 7,
                  width: viewportProfile === "phone-landscape" ? 48 : 38,
                  height: viewportProfile === "phone-landscape" ? 48 : 38,
                  borderRadius: viewportProfile === "phone-landscape" ? 24 : 19,
                },
              ]}
            >
              <Text style={[styles.webExitButtonText, viewportProfile === "phone-landscape" && { fontSize: 22, lineHeight: 22 }]}>✕</Text>
            </Pressable>
            {message ? (
              <View style={styles.webMessageBanner}>
                <Text style={styles.errorText}>{message}</Text>
              </View>
            ) : null}
          </View>
        ) : showWebInputIdentify && visualDesign ? (
          <View style={{ flex: 1 }} testID="kiosk-live-web-input-shell">
            <KioskWebLivePreview
              config={visualDesign}
              mode="input"
              media={resolvedKioskMedia}
              continueLabel={t("kiosk.identify")}
              formTitle={kioskConfig?.title || t("kiosk.identify")}
              participantCodeLabel={kioskConfig?.participant_code_label || t("kiosk.participantCode") || t("kiosk.code")}
              secondFieldLabel={
                inputSecondField === "email"
                  ? t("auth.email")
                  : inputSecondField === "name"
                    ? t("members.name")
                    : undefined
              }
              inputFieldCount={inputSecondField ? 2 : 1}
              showPin={inputShowPin}
              pinLabel={t("kiosk.pin")}
              interactiveIdentify
              gridColumns={gridColumns}
              viewportProfile={viewportProfile}
              safeInsets={kioskInsets}
              belowGridActionLabel={selectedClass ? backToClassesLabel : undefined}
              onIdentifySubmit={(payload) => {
                if (!busy && payload.identifier.trim()) void identifyInput(payload);
              }}
              onBelowGridAction={() => {
                if (!busy) clearSelectedClass();
              }}
              testID="kiosk-live-web-input"
            />
            <Pressable
              accessibilityLabel={t("kiosk.exit")}
              hitSlop={8}
              onPress={() => setShowExit(true)}
              style={[
                styles.webExitButton,
                phonePresentation && {
                  top: kioskInsets.top + (viewportProfile === "phone-landscape" ? 0 : 5),
                  right: kioskInsets.right + 7,
                  width: viewportProfile === "phone-landscape" ? 48 : 38,
                  height: viewportProfile === "phone-landscape" ? 48 : 38,
                  borderRadius: viewportProfile === "phone-landscape" ? 24 : 19,
                },
              ]}
            >
              <Text style={[styles.webExitButtonText, viewportProfile === "phone-landscape" && { fontSize: 22, lineHeight: 22 }]}>✕</Text>
            </Pressable>
            {message ? (
              <View style={styles.webMessageBanner}>
                <Text style={styles.errorText}>{message}</Text>
              </View>
            ) : null}
          </View>
        ) : showWebFlowPanel && visualDesign ? (
          <View style={{ flex: 1 }} testID="kiosk-live-web-flow-shell">
            <KioskWebLivePreview
              config={visualDesign}
              mode={webFlowMode}
              media={resolvedKioskMedia}
              flowStage={successMessage ? "confirmation" : "action"}
              actionParticipant={webActionParticipant}
              actionChoices={webActionChoices}
              actionBackLabel={t("common.back")}
              actionBusy={busy}
              confirmationMessage={successMessage}
              gridColumns={gridColumns}
              viewportProfile={viewportProfile}
              safeInsets={kioskInsets}
              onActionSelect={(action) => {
                if (!busy) void perform(action as ActionType);
              }}
              onActionBack={() => { if (!busy) returnToKiosk(); }}
              testID={successMessage ? "kiosk-live-web-confirmation" : "kiosk-live-web-action"}
            />
            <Pressable
              accessibilityLabel={t("kiosk.exit")}
              hitSlop={8}
              onPress={() => setShowExit(true)}
              style={[
                styles.webExitButton,
                phonePresentation && {
                  top: kioskInsets.top + (viewportProfile === "phone-landscape" ? 0 : 5),
                  right: kioskInsets.right + 7,
                  width: viewportProfile === "phone-landscape" ? 48 : 38,
                  height: viewportProfile === "phone-landscape" ? 48 : 38,
                  borderRadius: viewportProfile === "phone-landscape" ? 24 : 19,
                },
              ]}
            >
              <Text style={[styles.webExitButtonText, viewportProfile === "phone-landscape" && { fontSize: 22, lineHeight: 22 }]}>✕</Text>
            </Pressable>
            {message ? (
              <View style={styles.webMessageBanner}>
                <Text style={styles.errorText}>{message}</Text>
              </View>
            ) : null}
          </View>
        ) : (
          <>
            {!headerEnabled ? <Pressable accessibilityLabel={t("kiosk.exit")} onPress={() => setShowExit(true)} style={{ padding: space.md, paddingTop: phonePresentation ? kioskInsets.top + space.sm : space.md, marginRight: phonePresentation ? kioskInsets.right : 0, alignSelf: "flex-end" }}><Text style={{ color: colors.blue }}>{t("kiosk.exit")}</Text></Pressable> : null}
            {headerEnabled && visualDesign ? (
              <KioskSurface
                background={visualDesign.header.background}
                style={[
                  styles.header,
                  phonePresentation && {
                    minHeight: phonePresentation.headerHeight + kioskInsets.top,
                    paddingTop: kioskInsets.top + phonePresentation.verticalPadding,
                    paddingBottom: phonePresentation.verticalPadding,
                    paddingLeft: kioskInsets.left + phonePresentation.horizontalPadding,
                    paddingRight: kioskInsets.right + phonePresentation.horizontalPadding,
                    gap: phonePresentation.contentGap,
                  },
                ]}
              >
                {resolvedKioskMedia.headerLogoUrl ? <AuthenticatedImage style={[styles.headerLogo, phonePresentation && { width: phonePresentation.headerLogoWidth, height: phonePresentation.headerLogoHeight }]} url={resolvedKioskMedia.headerLogoUrl} /> : null}
                <Text
                  adjustsFontSizeToFit={Boolean(phonePresentation)}
                  minimumFontScale={0.55}
                  numberOfLines={phonePresentation ? 1 : undefined}
                  style={[styles.headerTitle, viewportProfile === "phone-landscape" && { lineHeight: 44 }, { color: headerTextColor, textAlign: visualDesign.header.alignment as "left" | "center" | "right", fontSize: headerTitleSize }]}
                >
                  {headerTitle || (kiosk as any)?.group?.name || t("kiosk.title")}
                </Text>
                <Pressable hitSlop={10} onPress={() => setShowExit(!showExit)} style={[styles.headerExit, viewportProfile === "phone-landscape" && { width: 48, height: 48, borderRadius: 24 }]}> 
                  <Text style={[styles.headerExitText, viewportProfile === "phone-landscape" && { fontSize: 22, lineHeight: 22 }, { color: headerTextColor }]}>✕</Text>
                </Pressable>
              </KioskSurface>
            ) : null}

            {visualDesign ? <KioskSurface background={visualDesign.main.background} imageUrl={resolvedKioskMedia.backgroundUrl} overlay={visualDesign.main.overlay} transform={visualDesign.main.image_transform} style={styles.mainSurface}>
            <ScrollView
              contentContainerStyle={[
                styles.mainContent,
                phonePresentation && {
                  paddingTop: phonePresentation.verticalPadding,
                  paddingBottom: phonePresentation.verticalPadding + kioskInsets.bottom,
                  paddingLeft: phonePresentation.horizontalPadding + kioskInsets.left,
                  paddingRight: phonePresentation.horizontalPadding + kioskInsets.right,
                  gap: phonePresentation.contentGap,
                },
              ]}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
            >
              {showMainTitle ? (
                <Text
                  adjustsFontSizeToFit={Boolean(phonePresentation)}
                  minimumFontScale={0.5}
                  numberOfLines={phonePresentation ? 1 : undefined}
                  style={[
                    styles.welcomeTitle,
                    phonePresentation && { paddingVertical: viewportProfile === "phone-landscape" ? 2 : 5 },
                    { color: mainTextColor, fontSize: mainTitleSize, textAlign: (visualDesign?.main.title.alignment || "center") as "left" | "center" | "right" },
                  ]}
                >
                  {showMainTitle}
                </Text>
              ) : null}

              {message ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorText}>{message}</Text>
                </View>
              ) : null}

              <Text style={{ color: colors.danger }}>{classPinError}</Text>
              {pendingPerson ? <View style={styles.inputSection}><Text style={styles.sectionTitle}>{pendingPerson.name}</Text><TextInput accessibilityLabel={t("kiosk.pin")} secureTextEntry style={styles.input} value={cardPin} onChangeText={noteParticipantText(setCardPin)} /><Pressable disabled={busy || !cardPin} onPress={() => void selectPerson(pendingPerson, cardPin)} style={styles.actionButton}><Text>{t("kiosk.verify")}</Text></Pressable><Pressable disabled={busy} onPress={() => setPendingPerson(null)}><Text>{t("common.cancel")}</Text></Pressable></View> : null}
              {kioskConfig?.structured && !selectedClass && classes.length > 0 ? (
                <View style={[styles.classGrid, { gap: classGridGap }]}>
                  <Text style={[styles.sectionTitle, styles.classGridTitle, { color: mainTextColor }]}>
                    {t("kiosk.selectClass") || "Select a class"}
                  </Text>
                  {classes.map((cls) => (
                    <Pressable
                      key={cls.id}
                      onPress={() => openClass(cls)}
                      style={({ pressed }) => [
                        styles.classCard,
                        { width: classCardWidth },
                        pressed && { opacity: 0.8 },
                      ]}
                    >
                      <Text style={[styles.className, { color: mainTextColor }]} numberOfLines={2}>{cls.name}</Text>
                      <Text style={styles.classCount} numberOfLines={1}>{cls.participant_count} {t("groups.participants", { count: cls.participant_count })}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              {kioskConfig?.structured && selectedClass && kioskConfig.require_class_pin && !classReady ? (
                <View style={styles.inputSection}>
                  <Text style={[styles.sectionTitle, { color: mainTextColor }]}>
                    {selectedClass.name} — {t("kiosk.enterClassPin") || "Enter class PIN"}
                  </Text>
                  <View style={styles.inputRow}>
                    <TextInput
                      style={[styles.input, inputAppearance, { color: mainTextColor, borderColor: colors.border }]}
                      value={classPin}
                      onChangeText={noteParticipantText(setClassPin)}
                      secureTextEntry
                      placeholder="PIN"
                      placeholderTextColor={colors.placeholder}
                    />
                    <Pressable
                      onPress={() => void verifyClassPin()}
                      disabled={classPinBusy || !classPin.trim()}
                      style={[styles.actionButton, { backgroundColor: buttonBg, borderRadius: buttonRadius }]}
                    >
                      <Text style={styles.actionButtonText}>{t("kiosk.verify") || "Verify"}</Text>
                    </Pressable>
                  </View>
                  <Pressable
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={backToClassesLabel}
                    onPress={clearSelectedClass}
                    style={({ pressed }) => [styles.backToClassesButton, pressed && { opacity: 0.85 }]}
                  >
                    <Text style={styles.backToClassesButtonText}>{backToClassesLabel}</Text>
                  </Pressable>
                </View>
              ) : null}

              {!participant && !successMessage && (!kioskConfig?.structured || classReady) && kioskConfig?.kiosk_mode === "input" ? (
                <View style={styles.inputSection}>
                  <Text style={[styles.sectionTitle, { color: mainTextColor }]}>
                    {kioskConfig?.title || t("kiosk.identify")}
                  </Text>
                  <View style={styles.inputRow}>
                    <TextInput
                      style={[styles.input, inputAppearance, { color: mainTextColor, borderColor: colors.border }]}
                      value={identifier}
                      onChangeText={noteParticipantText(setIdentifier)}
                      autoCapitalize="characters"
                      placeholder={kioskConfig?.participant_code_label || t("kiosk.code") || "Code"}
                      placeholderTextColor={colors.placeholder}
                    />
                    {kioskConfig?.input_fields.some((field) => field === "name" || field === "email") ? <TextInput style={[styles.input, inputAppearance]} accessibilityLabel={t(kioskConfig.input_fields.includes("email") ? "auth.email" : "members.name")} placeholder={t(kioskConfig.input_fields.includes("email") ? "auth.email" : "members.name")} keyboardType={kioskConfig.input_fields.includes("email") ? "email-address" : "default"} autoCapitalize="none" value={secondValue} onChangeText={noteParticipantText(setSecondValue)} /> : null}
                    {kioskConfig?.input_fields.includes("pin") ? (
                      <TextInput
                        style={[styles.input, inputAppearance, { color: mainTextColor, borderColor: colors.border }]}
                        value={pin}
                        onChangeText={noteParticipantText(setPin)}
                        secureTextEntry
                        placeholder="PIN"
                        placeholderTextColor={colors.placeholder}
                      />
                    ) : null}
                    <Pressable
                      onPress={() => void identifyInput()}
                      disabled={busy || !identifier.trim()}
                      style={[styles.actionButton, { backgroundColor: buttonBg, borderRadius: buttonRadius }]}
                    >
                      <Text style={styles.actionButtonText}>{t("kiosk.identify")}</Text>
                    </Pressable>
                  </View>
                  {selectedClass ? (
                    <Pressable
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityLabel={backToClassesLabel}
                      onPress={clearSelectedClass}
                      style={({ pressed }) => [styles.backToClassesButton, pressed && { opacity: 0.85 }]}
                    >
                      <Text style={styles.backToClassesButtonText}>{backToClassesLabel}</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              {selectedClass && classReady && !participant && !successMessage && kioskConfig?.kiosk_mode === "card" && people.length === 0 ? (
                <Pressable
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={backToClassesLabel}
                  onPress={clearSelectedClass}
                  style={({ pressed }) => [styles.backToClassesButton, pressed && { opacity: 0.85 }]}
                >
                  <Text style={styles.backToClassesButtonText}>{backToClassesLabel}</Text>
                </Pressable>
              ) : null}
            </ScrollView>
            </KioskSurface> : null}

            {footerEnabled && visualDesign ? (
              <KioskSurface
                background={visualDesign.footer.background}
                style={[
                  styles.footer,
                  phonePresentation && {
                    minHeight: phonePresentation.footerHeight + kioskInsets.bottom,
                    paddingTop: phonePresentation.verticalPadding,
                    paddingBottom: kioskInsets.bottom + phonePresentation.verticalPadding,
                    paddingLeft: kioskInsets.left + phonePresentation.horizontalPadding,
                    paddingRight: kioskInsets.right + phonePresentation.horizontalPadding,
                    gap: phonePresentation.contentGap,
                  },
                ]}
              >
                {resolvedKioskMedia.footerLogoUrl ? <AuthenticatedImage style={[styles.footerLogo, phonePresentation && { width: phonePresentation.footerLogoWidth, height: phonePresentation.footerLogoHeight }]} url={resolvedKioskMedia.footerLogoUrl} /> : null}
                {footerLines.map((line, i) => (
                  <Text
                    key={i}
                    numberOfLines={phonePresentation ? 1 : undefined}
                    adjustsFontSizeToFit={Boolean(phonePresentation)}
                    minimumFontScale={0.65}
                    style={[styles.footerText, viewportProfile === "phone-landscape" && { lineHeight: 14 }, { color: visualDesign.footer.text.color, textAlign: visualDesign.footer.text.alignment as "left" | "center" | "right", fontSize: footerTextSize }]}
                  >
                    {line}
                  </Text>
                ))}
              </KioskSurface>
            ) : null}
          </>
        )}

        {sessionExpired && !showExit ? (
          <View style={styles.exitOverlay} testID="kiosk-session-expired">
            <View style={styles.exitPanel}>
              <Text style={styles.exitTitle}>{t("kiosk.sessionExpired.title") || "Session expired"}</Text>
              <Text style={[styles.errorText, { color: colors.textMuted }]}>
                {t("kiosk.sessionExpired.body") || "An administrator needs to sign in again."}
              </Text>
              <Pressable
                onPress={() => setShowExit(true)}
                style={[styles.actionButton, { backgroundColor: colors.danger, width: "100%" }]}
              >
                <Text style={styles.actionButtonText}>{t("kiosk.exit") || "Exit kiosk"}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {showExit ? (
          <View style={styles.exitOverlay}>
            <View style={styles.exitPanel}>
              <Text style={styles.exitTitle}>{t("kiosk.exit") || "Exit kiosk"}</Text>
              {sessionExpired ? (
                <Text style={[styles.errorText, { color: colors.textMuted }]}>
                  {t("kiosk.sessionExpired.exitHint")
                    || "Enter the kiosk exit code. Workspace access stays locked until this code is verified."}
                </Text>
              ) : null}
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, width: "100%" }]}
                value={exitCode}
                onChangeText={setExitCode}
                secureTextEntry
                placeholder={t("kiosk.exitCode") || "Exit code"}
                placeholderTextColor={colors.placeholder}
              />
              {message ? <Text style={styles.errorText}>{message}</Text> : null}
              <View style={styles.exitActions}>
                <Pressable
                  onPress={() => { setShowExit(false); setExitCode(""); if (!sessionExpired) setMessage(""); }}
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
      </View>
    </View>
  );
}

function kioskPersonPreviewId(person: KioskPerson): string {
  if (person.membership_id != null) return `m:${person.membership_id}`;
  if (person.group_only_participant_id != null) return `g:${person.group_only_participant_id}`;
  return `c:${person.participant_code}`;
}

function KioskSurface({ background, imageUrl, overlay, transform, style, children }: { background: { mode: string; color: string; color2: string | null }; imageUrl?: string | null; overlay?: number; transform?: { focal_x: number; focal_y: number; zoom: number }; style?: object; children: ReactNode }) {
  const content = <>{background.mode === "image" && imageUrl ? <AuthenticatedImage resizeMode="cover" style={[StyleSheet.absoluteFill, { transform: [{ scale: Math.max(1, transform?.zoom || 1) }, { translateX: ((transform?.focal_x ?? 0.5) - 0.5) * -40 }, { translateY: ((transform?.focal_y ?? 0.5) - 0.5) * -40 }] }]} url={imageUrl} /> : null}{overlay ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: kioskOverlayColor(overlay) || "transparent" }]} /> : null}{children}</>;
  if (background.mode === "gradient" && background.color2) { const angle = Number((background as { gradient_angle?: number }).gradient_angle ?? 90) * Math.PI / 180; const dx = Math.sin(angle); const dy = -Math.cos(angle); return <LinearGradient colors={[background.color, background.color2]} end={{ x: 0.5 + dx / 2, y: 0.5 + dy / 2 }} start={{ x: 0.5 - dx / 2, y: 0.5 - dy / 2 }} style={style}>{content}</LinearGradient>; }
  return <View style={[style, { backgroundColor: background.color, overflow: "hidden" }]}>{content}</View>;
}

const styles = StyleSheet.create({
  edgeToEdgeShell: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 56 },
  headerLogo: { width: 92, height: 44 },
  headerTitle: { fontSize: 18, fontWeight: "700", flex: 1 },
  headerExit: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headerExitText: { fontSize: 18, fontWeight: "600" },
  mainSurface: { flex: 1 },
  mainContent: { padding: space.lg, gap: space.lg, paddingBottom: space.xxxl, minHeight: "100%" },
  welcomeTitle: { fontSize: 22, fontWeight: "700", textAlign: "center", paddingVertical: space.md },
  sectionTitle: { fontSize: 17, fontWeight: "600", textAlign: "center" },
  webExitButton: { position: "absolute", top: 10, right: 12, width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(15,23,42,0.35)" },
  webExitButtonText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  webMessageBanner: { position: "absolute", left: 16, right: 16, bottom: 24, backgroundColor: "rgba(220, 38, 38, 0.12)", borderRadius: 10, padding: space.md },
  inputSection: { gap: space.md },
  inputRow: { gap: space.sm },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, fontSize: 16, backgroundColor: "rgba(255,255,255,0.9)" },
  actionButton: { minHeight: 48, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: space.xl },
  actionButtonText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  backToClassesButton: { width: "100%", minHeight: 48, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: space.xl, marginTop: space.sm, backgroundColor: "rgba(255,255,255,0.92)", borderWidth: 1, borderColor: colors.border },
  backToClassesButtonText: { fontSize: 16, fontWeight: "700", color: colors.text },
  classGrid: { flexDirection: "row", flexWrap: "wrap", width: "100%" },
  classGridTitle: { width: "100%", marginBottom: space.xs },
  classCard: { backgroundColor: colors.surface, borderRadius: 14, padding: space.md, borderWidth: 1, borderColor: colors.border, minWidth: 0 },
  className: { fontSize: 16, fontWeight: "600" },
  classCount: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  errorBanner: { backgroundColor: "rgba(220, 38, 38, 0.12)", borderRadius: 10, padding: space.md },
  errorText: { fontSize: 14, color: colors.danger, textAlign: "center" },
  exitOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: space.xl },
  exitPanel: { backgroundColor: colors.surface, borderRadius: 20, padding: space.xl, width: "100%", maxWidth: 360, gap: space.md, alignItems: "center" },
  exitTitle: { fontSize: 20, fontWeight: "700", color: colors.text },
  exitActions: { flexDirection: "row", gap: space.sm, width: "100%" },
  footer: { minHeight: 48, paddingHorizontal: space.lg, paddingVertical: space.sm, flexDirection: "row", gap: space.sm, alignItems: "center" },
  footerLogo: { width: 72, height: 34 },
  footerText: { fontSize: 12, textAlign: "center", flex: 1 },
});

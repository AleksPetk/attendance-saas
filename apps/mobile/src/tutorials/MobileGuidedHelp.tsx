import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { endpoints } from "@checkstation/api";
import { canManageOwnerAccount, isOwner } from "@checkstation/domain";
import { Button } from "../components/ui";
import { useApp } from "../lib/AppProvider";
import { useFormFactor } from "../lib/formFactor";
import { colors, radii, shadows, space, type } from "../theme/tokens";
import { dismissAutoStart, guides, loadTutorialIds, markTutorial, mobileRoute, mobileSteps, shouldAutoStart, stepCopy, type Guide } from "./guides";

let guideListener: ((id: string) => void) | null = null;
export function requestGuide(id: string) {
  guideListener?.(id);
}

export function MobileGuidedHelp({ autoStart = false }: { autoStart?: boolean }) {
  const { api, authState, locale, t } = useApp();
  const { tablet } = useFormFactor();
  const insets = useSafeAreaInsets();
  const [ids, setIds] = useState<string[]>([]);
  const [active, setActive] = useState<Guide | null>(null);
  const [index, setIndex] = useState(0);
  const [targets, setTargets] = useState<{ groupId?: string; memberId?: string }>({});
  const [readyIds, setReadyIds] = useState(false);
  const started = useState({ current: false })[0];
  const owner = isOwner(authState.session) || canManageOwnerAccount(authState.session);

  useEffect(() => { void loadTutorialIds().then((next) => { setIds(next); setReadyIds(true); }); }, []);
  useEffect(() => {
    guideListener = (id) => {
      const guide = guides.find((item) => item.id === id);
      if (guide) void start(guide);
    };
    return () => { guideListener = null; };
  });
  useEffect(() => {
    if (!autoStart || !readyIds || started.current || !shouldAutoStart(ids, owner)) return;
    const overview = guides.find((guide) => guide.id === "workspace-overview");
    if (!overview) return;
    started.current = true;
    void start(overview);
  }, [autoStart, ids, owner, readyIds, started]);

  const steps = useMemo(() => active ? mobileSteps(active, authState.session) : [], [active, authState.session]);
  const step = steps[index];

  useEffect(() => {
    if (!step) return;
    router.push(mobileRoute(step.route, targets) as never);
  }, [step, targets]);

  async function start(guide: Guide) {
    let groupId = targets.groupId;
    let memberId = targets.memberId;
    if (!groupId) {
      try {
        const groups = await api.get<Array<{ id: number }>>(endpoints.groups());
        groupId = groups[0] ? String(groups[0].id) : undefined;
      } catch { groupId = undefined; }
    }
    if (!memberId) {
      try {
        const members = await api.get<Array<{ id: number }>>(endpoints.members());
        memberId = members[0] ? String(members[0].id) : undefined;
      } catch { memberId = undefined; }
    }
    setTargets({ groupId, memberId });
    setIndex(0);
    setActive(guide);
  }

  async function close(completed: boolean) {
    if (!active) return;
    if (completed) await markTutorial(active.id);
    else if (active.id === "workspace-overview") await dismissAutoStart();
    setIds(await loadTutorialIds());
    setActive(null);
  }

  if (!active || !step) return null;
  const copy = stepCopy(step, locale === "ja" ? "ja" : "en");
  const last = index >= steps.length - 1;
  return (
    <View pointerEvents="box-none" style={styles.host}>
      <View style={[styles.card, tablet ? styles.cardTablet : styles.cardPhone, tablet ? { right: space.lg + insets.right, bottom: space.lg + insets.bottom } : { paddingBottom: insets.bottom + space.lg }]}>
        <Text style={styles.kicker}>{t("help.guided")} · {t("help.stepProgress", { current: index + 1, total: steps.length })}</Text>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.body}</Text>
        <View style={styles.actions}>
          <Pressable onPress={() => void close(false)}><Text style={styles.skip}>{t("help.skip")}</Text></Pressable>
          <View style={styles.nav}>
            {index > 0 ? <Button label={t("help.backStep")} onPress={() => setIndex((value) => Math.max(0, value - 1))} variant="secondary" /> : null}
            <Button label={last ? t("help.finish") : t("help.next")} onPress={() => last ? void close(true) : setIndex((value) => value + 1)} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, justifyContent: "flex-end" },
  card: { gap: space.sm, padding: space.lg, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, ...shadows.sm },
  cardPhone: { borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg },
  cardTablet: { position: "absolute", right: space.lg, bottom: space.lg, width: 380, borderRadius: radii.lg },
  kicker: { ...type.captionStrong, color: colors.blue },
  title: { ...type.headline, color: colors.text },
  body: { ...type.body, color: colors.textSecondary },
  actions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  nav: { flexDirection: "row", gap: space.sm },
  skip: { ...type.captionStrong, color: colors.textMuted },
});

export function useGuideStarter() {
  const { authState } = useApp();
  const [request, setRequest] = useState<Guide | null>(null);
  return { request, start: setRequest, clear: () => setRequest(null), session: authState.session };
}

import { useRef } from "react";
import { Pressable, StyleSheet, Text, View, type AccessibilityActionEvent } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Swipeable } from "react-native-gesture-handler";
import {
  enabledGroupActions,
  groupParticipantCounts,
  isPlanLocked,
} from "@checkstation/domain";
import { StatusPill } from "./mobile";
import { colors, radii, space, type } from "../theme/tokens";

export type GroupListItem = {
  id: number;
  name: string;
  status?: string;
  group_type?: string;
  participant_count?: number;
  member_count?: number;
  group_only_participant_count?: number;
  is_plan_locked?: boolean;
  plan_unlocked?: boolean;
  actions?: { check_in_enabled?: boolean; check_out_enabled?: boolean; breaks_enabled?: boolean; max_breaks?: number | null };
  readiness?: { setup_complete?: boolean };
};

export type GroupSwipeableRef = React.ElementRef<typeof Swipeable>;

type Props = {
  group: GroupListItem;
  status: "active" | "archived";
  blocked: boolean;
  showSwipeActions: boolean;
  busy: boolean;
  structuredAccess: boolean;
  archiveLabel: string;
  restoreLabel: string;
  deleteLabel: string;
  activeLabel: string;
  archivedLabel: string;
  planLockedLabel: string;
  setupIncompleteLabel: string;
  standardGroupLabel: string;
  structuredGroupLabel: string;
  groupIdLabel: string;
  participantComposition: string;
  noAttendanceActions: string;
  planLockedCopy: string;
  upgradeForStructured: string;
  actionSummary: string;
  onOpenDetail: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  openRowRef: React.MutableRefObject<GroupSwipeableRef | null>;
};

/**
 * Groups list card with swipe actions.
 * Actions never auto-fire from swipe distance — only from tapping a revealed button.
 * Standard and Structured Groups share the same list swipe UX; lifecycle handlers are identical.
 */
export function GroupListRow({
  group,
  status,
  blocked,
  showSwipeActions,
  busy,
  structuredAccess,
  archiveLabel,
  restoreLabel,
  deleteLabel,
  activeLabel,
  archivedLabel,
  planLockedLabel,
  setupIncompleteLabel,
  standardGroupLabel,
  structuredGroupLabel,
  groupIdLabel,
  participantComposition,
  noAttendanceActions,
  planLockedCopy,
  upgradeForStructured,
  actionSummary,
  onOpenDetail,
  onArchive,
  onRestore,
  onDelete,
  openRowRef,
}: Props) {
  const swipeRef = useRef<GroupSwipeableRef | null>(null);
  const locked = isPlanLocked(group);
  const structured = group.group_type === "structured";
  const structuredFeatureLocked = structured && !structuredAccess;
  const incomplete = status === "active" && group.readiness && !group.readiness.setup_complete;

  function closeSelf() {
    swipeRef.current?.close();
    if (openRowRef.current === swipeRef.current) openRowRef.current = null;
  }

  function registerOpen() {
    if (openRowRef.current && openRowRef.current !== swipeRef.current) {
      openRowRef.current.close();
    }
    openRowRef.current = swipeRef.current;
  }

  function runAction(action: () => void) {
    closeSelf();
    action();
  }

  const accessibilityActions = showSwipeActions
    ? status === "active"
      ? [{ name: "archive", label: archiveLabel }]
      : [
          { name: "restore", label: restoreLabel },
          { name: "delete", label: deleteLabel },
        ]
    : undefined;

  function onAccessibilityAction(event: AccessibilityActionEvent) {
    const name = event.nativeEvent.actionName;
    if (name === "archive") onArchive();
    else if (name === "restore") onRestore();
    else if (name === "delete") onDelete();
  }

  function renderRightActions() {
    if (!showSwipeActions) return null;
    if (status === "active") {
      return (
        <View style={styles.actions}>
          <Pressable
            accessibilityLabel={archiveLabel}
            accessibilityRole="button"
            disabled={busy}
            onPress={() => runAction(onArchive)}
            style={({ pressed }) => [styles.action, styles.archiveAction, pressed && styles.actionPressed, busy && styles.actionDisabled]}
          >
            <Text style={styles.actionText}>{archiveLabel}</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={styles.actions}>
        <Pressable
          accessibilityLabel={deleteLabel}
          accessibilityRole="button"
          disabled={busy}
          onPress={() => runAction(onDelete)}
          style={({ pressed }) => [styles.action, styles.deleteAction, pressed && styles.actionPressed, busy && styles.actionDisabled]}
        >
          <Text style={styles.actionText}>{deleteLabel}</Text>
        </Pressable>
      </View>
    );
  }

  function renderLeftActions() {
    if (!showSwipeActions || status !== "archived") return null;
    return (
      <View style={styles.actions}>
        <Pressable
          accessibilityLabel={restoreLabel}
          accessibilityRole="button"
          disabled={busy}
          onPress={() => runAction(onRestore)}
          style={({ pressed }) => [styles.action, styles.restoreAction, pressed && styles.actionPressed, busy && styles.actionDisabled]}
        >
          <Text style={styles.actionText}>{restoreLabel}</Text>
        </Pressable>
      </View>
    );
  }

  const card = (
    <Pressable
      accessibilityActions={accessibilityActions}
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked }}
      disabled={blocked}
      onAccessibilityAction={onAccessibilityAction}
      onPress={onOpenDetail}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed, blocked && styles.cardMuted]}
    >
      <View style={[styles.groupIcon, structured && styles.structuredIcon]}>
        <Ionicons color={structured ? colors.blue : colors.green} name={structured ? "grid-outline" : "layers-outline"} size={22} />
      </View>
      <View style={styles.cardMain}>
        <View style={styles.cardTop}>
          <Text numberOfLines={1} style={styles.name}>{group.name}</Text>
          {locked ? <StatusPill label={planLockedLabel} tone="warning" /> : incomplete ? <StatusPill label={setupIncompleteLabel} tone="warning" /> : status === "archived" ? <StatusPill label={archivedLabel} /> : <StatusPill label={activeLabel} tone="green" />}
        </View>
        <Text style={styles.meta}>{structured ? structuredGroupLabel : standardGroupLabel} · {groupIdLabel}</Text>
        <Text style={styles.meta}>{participantComposition}</Text>
        <Text style={styles.id}>{actionSummary || noAttendanceActions}</Text>
        {locked ? <Text style={styles.lockedCopy}>{structuredFeatureLocked ? upgradeForStructured : planLockedCopy}</Text> : null}
      </View>
      <Ionicons color={colors.textMuted} name={blocked ? "lock-closed-outline" : "chevron-forward"} size={18} />
    </Pressable>
  );

  if (!showSwipeActions) return card;

  return (
    <Swipeable
      ref={swipeRef}
      friction={2}
      overshootFriction={8}
      overshootLeft={false}
      overshootRight={false}
      enableTrackpadTwoFingerGesture
      renderLeftActions={status === "archived" ? renderLeftActions : undefined}
      renderRightActions={renderRightActions}
      onSwipeableWillOpen={registerOpen}
      onSwipeableClose={() => {
        if (openRowRef.current === swipeRef.current) openRowRef.current = null;
      }}
    >
      {card}
    </Swipeable>
  );
}

/** Build the action-line summary string for a group card (same as previous GroupCard). */
export function groupActionSummary(
  group: GroupListItem,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  const actions = enabledGroupActions(group.actions);
  if (!actions.length) return "";
  return actions
    .map((action) =>
      action.kind === "breaks"
        ? t("groups.breaksAction", { max: action.maxBreaks })
        : t(action.kind === "check_in" ? "groups.checkInAction" : "groups.checkOutAction"),
    )
    .join(" · ");
}

export function groupCompositionLabel(
  group: GroupListItem,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  const counts = groupParticipantCounts(group);
  return t("groups.participantComposition", { total: counts.total, members: counts.members, groupOnly: counts.groupOnly });
}

const styles = StyleSheet.create({
  card: {
    minHeight: 94,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.md,
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  cardPressed: { backgroundColor: colors.surfaceMuted },
  cardMuted: { opacity: 0.72 },
  groupIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: colors.successSoft, alignItems: "center", justifyContent: "center" },
  structuredIcon: { backgroundColor: colors.blueSoft },
  cardMain: { flex: 1, gap: 3 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: space.sm },
  name: { ...type.bodyStrong, color: colors.text, flexShrink: 1 },
  meta: { ...type.caption, color: colors.textSecondary },
  id: { fontSize: 12, color: colors.textMuted },
  lockedCopy: { ...type.caption, color: colors.warningText, marginTop: space.xs },
  actions: { flexDirection: "row", alignItems: "stretch" },
  action: {
    minWidth: 88,
    paddingHorizontal: space.md,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: radii.lg,
  },
  actionPressed: { opacity: 0.85 },
  actionDisabled: { opacity: 0.5 },
  archiveAction: { backgroundColor: colors.warningText },
  restoreAction: { backgroundColor: colors.successText },
  deleteAction: { backgroundColor: colors.danger },
  actionText: { ...type.captionStrong, color: colors.textInverse, textAlign: "center" },
});

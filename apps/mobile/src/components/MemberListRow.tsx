import { useRef } from "react";
import { Pressable, StyleSheet, Text, View, type AccessibilityActionEvent } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Swipeable } from "react-native-gesture-handler";
import { Avatar } from "./Avatar";
import { StatusPill } from "./mobile";
import { colors, space, type } from "../theme/tokens";

export type MemberListItem = {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  photo_url?: string | null;
};

export type MemberSwipeableRef = React.ElementRef<typeof Swipeable>;

type Props = {
  member: MemberListItem;
  status: "active" | "archived";
  blocked: boolean;
  showSwipeActions: boolean;
  busy: boolean;
  contactFallback: string;
  archivedLabel: string;
  planLockedLabel: string;
  archiveLabel: string;
  restoreLabel: string;
  deleteLabel: string;
  locked?: boolean;
  onOpenDetail: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  openRowRef: React.MutableRefObject<MemberSwipeableRef | null>;
};

/**
 * Members list row with swipe actions.
 * Actions never auto-fire from swipe distance — only from tapping a revealed button.
 */
export function MemberListRow({
  member,
  status,
  blocked,
  showSwipeActions,
  busy,
  contactFallback,
  archivedLabel,
  planLockedLabel,
  archiveLabel,
  restoreLabel,
  deleteLabel,
  locked = false,
  onOpenDetail,
  onArchive,
  onRestore,
  onDelete,
  openRowRef,
}: Props) {
  const swipeRef = useRef<MemberSwipeableRef | null>(null);

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

  const row = (
    <Pressable
      accessibilityActions={accessibilityActions}
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked }}
      disabled={blocked}
      onAccessibilityAction={onAccessibilityAction}
      onPress={onOpenDetail}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed, blocked && styles.locked]}
    >
      <Avatar name={member.name} url={member.photo_url} />
      <View style={styles.rowMain}>
        <View style={styles.rowTitleLine}>
          <Text numberOfLines={1} style={styles.name}>{member.name}</Text>
          {locked ? <StatusPill label={planLockedLabel} tone="warning" /> : status === "archived" ? <StatusPill label={archivedLabel} /> : null}
        </View>
        <Text numberOfLines={1} style={styles.secondary}>{member.email || member.phone || contactFallback}</Text>
      </View>
      <Ionicons color={colors.textMuted} name={blocked ? "lock-closed-outline" : "chevron-forward"} size={18} />
    </Pressable>
  );

  if (!showSwipeActions) return row;

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
      {row}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowPressed: { backgroundColor: colors.surfaceMuted },
  locked: { opacity: 0.65 },
  rowMain: { flex: 1, gap: 3 },
  rowTitleLine: { flexDirection: "row", alignItems: "center", gap: space.sm },
  name: { ...type.bodyStrong, color: colors.text, flexShrink: 1 },
  secondary: { ...type.caption, color: colors.textMuted },
  actions: { flexDirection: "row", alignItems: "stretch" },
  action: {
    minWidth: 88,
    paddingHorizontal: space.md,
    justifyContent: "center",
    alignItems: "center",
  },
  actionPressed: { opacity: 0.85 },
  actionDisabled: { opacity: 0.5 },
  archiveAction: { backgroundColor: colors.warningText },
  restoreAction: { backgroundColor: colors.successText },
  deleteAction: { backgroundColor: colors.danger },
  actionText: { ...type.captionStrong, color: colors.textInverse, textAlign: "center" },
});

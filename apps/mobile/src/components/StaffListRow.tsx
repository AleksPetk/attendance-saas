import { useRef } from "react";
import { Pressable, StyleSheet, Text, View, type AccessibilityActionEvent } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { StatusPill } from "./mobile";
import { colors, radii, space, type } from "../theme/tokens";

export type StaffListItem = {
  id: number;
  username: string;
  email: string;
  role: "staff" | "admin";
  status: "active" | "inactive";
  is_plan_locked?: boolean;
  group_access?: Array<{ group_id: number; name: string }>;
};

export type StaffSwipeableRef = React.ElementRef<typeof Swipeable>;

type Props = {
  staff: StaffListItem;
  busy: boolean;
  showSwipeActions: boolean;
  roleLabel: string;
  statusLabel: string;
  noEmailLabel: string;
  planLockedLabel: string;
  noGroupAccessLabel: string;
  moreGroupsLabel: (count: number) => string;
  editLabel: string;
  groupAccessLabel: string;
  resetPasswordLabel: string;
  deactivateLabel: string;
  reactivateLabel: string;
  deleteLabel: string;
  onEdit: () => void;
  onGroupAccess: () => void;
  onResetPassword: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
  onDelete: () => void;
  openRowRef: React.MutableRefObject<StaffSwipeableRef | null>;
};

/**
 * Staff/Admin list row with role-specific swipe actions.
 * Actions never auto-fire from swipe distance — only from tapping a revealed button.
 * There is no row-level detail destination; management opens via swipe actions / sheets.
 */
export function StaffListRow({
  staff,
  busy,
  showSwipeActions,
  roleLabel,
  statusLabel,
  noEmailLabel,
  planLockedLabel,
  noGroupAccessLabel,
  moreGroupsLabel,
  editLabel,
  groupAccessLabel,
  resetPasswordLabel,
  deactivateLabel,
  reactivateLabel,
  deleteLabel,
  onEdit,
  onGroupAccess,
  onResetPassword,
  onDeactivate,
  onReactivate,
  onDelete,
  openRowRef,
}: Props) {
  const swipeRef = useRef<StaffSwipeableRef | null>(null);
  const active = staff.status === "active";
  const isAdmin = staff.role === "admin";
  const isStaff = staff.role === "staff";

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
    ? active
      ? isAdmin
        ? [
            { name: "edit", label: editLabel },
            { name: "resetPassword", label: resetPasswordLabel },
            { name: "deactivate", label: deactivateLabel },
          ]
        : [
            { name: "edit", label: editLabel },
            { name: "groupAccess", label: groupAccessLabel },
            { name: "resetPassword", label: resetPasswordLabel },
            { name: "deactivate", label: deactivateLabel },
          ]
      : [
          { name: "reactivate", label: reactivateLabel },
          { name: "delete", label: deleteLabel },
        ]
    : undefined;

  function onAccessibilityAction(event: AccessibilityActionEvent) {
    const name = event.nativeEvent.actionName;
    if (name === "edit") onEdit();
    else if (name === "groupAccess") onGroupAccess();
    else if (name === "resetPassword") onResetPassword();
    else if (name === "deactivate") onDeactivate();
    else if (name === "reactivate") onReactivate();
    else if (name === "delete") onDelete();
  }

  function renderLeftActions() {
    if (!showSwipeActions) return null;
    if (active && isAdmin) {
      return (
        <View style={styles.actions}>
          <ActionButton busy={busy} label={editLabel} onPress={() => runAction(onEdit)} tone="primary" />
        </View>
      );
    }
    if (active && isStaff) {
      return (
        <View style={styles.actions}>
          <ActionButton busy={busy} label={editLabel} onPress={() => runAction(onEdit)} tone="primary" />
          <ActionButton busy={busy} label={groupAccessLabel} onPress={() => runAction(onGroupAccess)} tone="primary" />
        </View>
      );
    }
    // Inactive: swipe right → Reactivate
    return (
      <View style={styles.actions}>
        <ActionButton busy={busy} label={reactivateLabel} onPress={() => runAction(onReactivate)} tone="positive" />
      </View>
    );
  }

  function renderRightActions() {
    if (!showSwipeActions) return null;
    if (active && isAdmin) {
      return (
        <View style={styles.actions}>
          <ActionButton busy={busy} label={resetPasswordLabel} onPress={() => runAction(onResetPassword)} tone="warning" />
          <ActionButton busy={busy} label={deactivateLabel} onPress={() => runAction(onDeactivate)} tone="warning" />
        </View>
      );
    }
    if (active && isStaff) {
      return (
        <View style={styles.actions}>
          <ActionButton busy={busy} label={resetPasswordLabel} onPress={() => runAction(onResetPassword)} tone="warning" />
          <ActionButton busy={busy} label={deactivateLabel} onPress={() => runAction(onDeactivate)} tone="warning" />
        </View>
      );
    }
    // Inactive: swipe left → Delete permanently
    return (
      <View style={styles.actions}>
        <ActionButton busy={busy} label={deleteLabel} onPress={() => runAction(onDelete)} tone="danger" />
      </View>
    );
  }

  const card = (
    <View
      accessible
      accessibilityActions={accessibilityActions}
      accessibilityRole="summary"
      accessibilityLabel={`${staff.username}, ${roleLabel}, ${statusLabel}`}
      onAccessibilityAction={onAccessibilityAction}
      style={styles.card}
    >
      <View style={styles.identity}>
        <Text numberOfLines={1} style={styles.name}>{staff.username}</Text>
        <Text numberOfLines={1} style={styles.meta}>{staff.email || noEmailLabel}</Text>
      </View>
      <View style={styles.badges}>
        <StatusPill label={roleLabel} tone="blue" />
        <StatusPill label={statusLabel} tone={active ? "green" : "neutral"} />
        {staff.is_plan_locked ? <StatusPill label={planLockedLabel} tone="warning" /> : null}
      </View>
      {isStaff ? (
        <View style={styles.badges}>
          {staff.group_access?.length ? (
            <>
              {staff.group_access.slice(0, 2).map((group) => (
                <Text key={group.group_id} numberOfLines={1} style={styles.groupChip}>{group.name}</Text>
              ))}
              {staff.group_access.length > 2 ? (
                <Text style={styles.meta}>{moreGroupsLabel(staff.group_access.length - 2)}</Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.meta}>{noGroupAccessLabel}</Text>
          )}
        </View>
      ) : null}
    </View>
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
      renderLeftActions={renderLeftActions}
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

function ActionButton({
  label,
  onPress,
  busy,
  tone,
}: {
  label: string;
  onPress: () => void;
  busy: boolean;
  tone: "primary" | "warning" | "positive" | "danger";
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        tone === "primary" && styles.primaryAction,
        tone === "warning" && styles.warningAction,
        tone === "positive" && styles.positiveAction,
        tone === "danger" && styles.dangerAction,
        pressed && styles.actionPressed,
        busy && styles.actionDisabled,
      ]}
    >
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 72,
    padding: space.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: space.sm,
  },
  identity: { gap: space.xs },
  name: { ...type.bodyStrong, color: colors.text },
  meta: { ...type.caption, color: colors.textMuted },
  badges: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm },
  groupChip: {
    ...type.caption,
    color: colors.textSecondary,
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: 8,
    maxWidth: "100%",
    flexShrink: 1,
  },
  actions: { flexDirection: "row", alignItems: "stretch" },
  action: {
    minWidth: 88,
    maxWidth: 120,
    paddingHorizontal: space.md,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: radii.lg,
  },
  actionPressed: { opacity: 0.85 },
  actionDisabled: { opacity: 0.5 },
  primaryAction: { backgroundColor: colors.blue },
  warningAction: { backgroundColor: colors.warningText },
  positiveAction: { backgroundColor: colors.successText },
  dangerAction: { backgroundColor: colors.danger },
  actionText: { ...type.captionStrong, color: colors.textInverse, textAlign: "center" },
});

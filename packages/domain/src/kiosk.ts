/** Pure kiosk state helpers — mirror backend attendance rules without inventing product. */

export type AttendanceState = {
  is_checked_in: boolean;
  is_on_break: boolean;
  break_count: number;
};

export type ActionType = "check_in" | "check_out" | "break_start" | "break_end";

export type GroupActionFlags = {
  check_in_enabled?: boolean;
  check_out_enabled?: boolean;
  breaks_enabled?: boolean;
  max_breaks?: number;
};

export function getValidActionsForState(
  group: GroupActionFlags,
  state: AttendanceState,
): ActionType[] {
  const allowed: ActionType[] = [];
  if (group.check_in_enabled && !state.is_checked_in) {
    allowed.push("check_in");
  }
  if (
    group.check_out_enabled
    && ((state.is_checked_in && !state.is_on_break) || !group.check_in_enabled)
  ) {
    allowed.push("check_out");
  }
  if (group.breaks_enabled && state.is_checked_in) {
    const maxBreaks = group.max_breaks ?? 0;
    if (!state.is_on_break && state.break_count < maxBreaks) {
      allowed.push("break_start");
    }
    if (state.is_on_break) {
      allowed.push("break_end");
    }
  }
  return allowed;
}

export function isActionAllowed(
  group: GroupActionFlags,
  state: AttendanceState,
  action: ActionType,
): boolean {
  return getValidActionsForState(group, state).includes(action);
}

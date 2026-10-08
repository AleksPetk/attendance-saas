import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import {
  MOBILE_BILLING_FOREGROUND_MIN_MS,
  shouldRefreshBillingOnAppState,
} from "./mobileBillingRefresh";

/**
 * Run `refresh` when the app returns to active from background/inactive.
 * Rapid AppState chatter is ignored via a short debounce window.
 */
export function useAppForegroundRefresh(
  refresh: () => void | Promise<unknown>,
  options?: { minElapsedMs?: number; enabled?: boolean },
) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const lastAtRef = useRef(0);
  const previousRef = useRef<AppStateStatus | null>(AppState.currentState);
  const enabled = options?.enabled !== false;
  const minElapsedMs = options?.minElapsedMs ?? MOBILE_BILLING_FOREGROUND_MIN_MS;

  useEffect(() => {
    if (!enabled) return;
    const onChange = (next: AppStateStatus) => {
      const previous = previousRef.current;
      previousRef.current = next;
      if (!shouldRefreshBillingOnAppState({ previous, next })) return;
      const now = Date.now();
      if (now - lastAtRef.current < minElapsedMs) return;
      lastAtRef.current = now;
      void refreshRef.current();
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [enabled, minElapsedMs]);
}

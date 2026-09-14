import { useEffect, useRef } from "react";
import { desktopRefresh } from "./foregroundRefresh";

/** Register once; read current filters/draft guards without listener churn. */
export function useForegroundRefresh(refresh: () => Promise<unknown>) {
  const current = useRef(refresh);
  current.current = refresh;
  useEffect(() => desktopRefresh.subscribe(() => current.current()), []);
}

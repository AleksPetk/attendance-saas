import { useCallback, useEffect, useRef, useState } from "react";
import { createConfigurationSaveQueue, type AutosaveStatus } from "./configurationSaveQueue";

export type FlushConfiguration = () => Promise<boolean>;

/** One request at a time; edits made during a request are saved afterwards. */
export function useConfigurationAutosave({ snapshot, dirty, immediateKey, save, eligible = true }: {
  snapshot: string; dirty: boolean; immediateKey: string; save: FlushConfiguration; eligible?: boolean;
}) {
  const latest = useRef({ snapshot, dirty, save });
  latest.current = { snapshot, dirty, save };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const previousKey = useRef(immediateKey);
  const [status, setStatus] = useState<AutosaveStatus>("saved");
  const queue = useRef<ReturnType<typeof createConfigurationSaveQueue> | null>(null);
  if (!queue.current) queue.current = createConfigurationSaveQueue(() => latest.current, (value) => { if (mounted.current) setStatus(value); });
  const flush = useCallback((): Promise<boolean> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    return queue.current!.flush();
  }, []);
  useEffect(() => {
    const immediate = previousKey.current !== immediateKey;
    previousKey.current = immediateKey;
    if (!dirty) { queue.current!.markSynced(snapshot); setStatus("saved"); return; }
    if (queue.current!.isSynced(snapshot)) return;
    setStatus("pending");
    if (!eligible) return;
    timer.current = setTimeout(() => { timer.current = null; void flush(); }, immediate ? 0 : 650);
    return () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  }, [snapshot, dirty, immediateKey, eligible, flush]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; if (timer.current) clearTimeout(timer.current); };
  }, []);
  return { flush, status };
}

export type ConfigurationDraft = { snapshot: string; dirty: boolean; save: () => Promise<boolean> };
export type AutosaveStatus = "saving" | "saved" | "error" | "pending";

export function createConfigurationSaveQueue(read: () => ConfigurationDraft, status: (value: AutosaveStatus) => void) {
  let synced: string | null = read().dirty ? null : read().snapshot;
  let running: Promise<boolean> | null = null;
  const queue = {
    markSynced(snapshot: string) { synced = snapshot; },
    isSynced(snapshot: string) { return snapshot === synced; },
    flush(): Promise<boolean> {
      if (running) return running;
      const operation = async () => {
        while (read().dirty && read().snapshot !== synced) {
          const current = read();
          status("saving");
          let ok = false;
          try { ok = await current.save(); } catch { ok = false; }
          if (!ok) {
            if (read().snapshot !== current.snapshot) continue;
            status("error"); return false;
          }
          synced = current.snapshot;
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
        status("saved");
        return true;
      };
      running = operation().finally(() => { running = null; });
      return running;
    },
  };
  return queue;
}

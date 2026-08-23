import { useCallback, useRef, useState } from "react";
import { cloneConfig, configsEqual, HISTORY_LIMIT } from "./builderUtils.js";

export const EMPTY_MEDIA = {
  logoKey: null,
  footerLogoKey: null,
  bgKey: null,
  removeLogo: false,
  removeFooterLogo: false,
  removeBg: false,
};

function cloneSnapshot(snapshot) {
  return {
    config: cloneConfig(snapshot.config),
    media: { ...EMPTY_MEDIA, ...snapshot.media },
  };
}

function snapshotsEqual(a, b) {
  return (
    configsEqual(a.config, b.config) &&
    a.media.logoKey === b.media.logoKey &&
    a.media.footerLogoKey === b.media.footerLogoKey &&
    a.media.bgKey === b.media.bgKey &&
    Boolean(a.media.removeLogo) === Boolean(b.media.removeLogo) &&
    Boolean(a.media.removeFooterLogo) === Boolean(b.media.removeFooterLogo) &&
    Boolean(a.media.removeBg) === Boolean(b.media.removeBg)
  );
}

export function useEditorHistory(initialSnapshot) {
  const [history, setHistory] = useState(() => [cloneSnapshot(initialSnapshot)]);
  const [index, setIndex] = useState(0);
  const [savedIndex, setSavedIndex] = useState(0);
  const [live, setLive] = useState(null);
  const gestureStartRef = useRef(null);
  const liveRef = useRef(null);
  const snapshotRef = useRef(null);

  const committed = history[index];
  const snapshot = live || committed;
  snapshotRef.current = snapshot;
  const dirty = index !== savedIndex || live !== null;
  const canUndo = index > 0 || live !== null;
  const canRedo = live === null && index < history.length - 1;

  const replaceAll = useCallback((nextSnapshot) => {
    const cloned = cloneSnapshot(nextSnapshot);
    setHistory([cloned]);
    setIndex(0);
    setSavedIndex(0);
    liveRef.current = null;
    gestureStartRef.current = null;
    setLive(null);
  }, []);

  const commit = useCallback((nextSnapshot) => {
    setHistory((current) => {
      const trimmed = current.slice(0, index + 1);
      const last = trimmed[trimmed.length - 1];
      if (last && snapshotsEqual(last, nextSnapshot)) {
        return current;
      }
      trimmed.push(cloneSnapshot(nextSnapshot));
      if (trimmed.length > HISTORY_LIMIT) {
        const extra = trimmed.length - HISTORY_LIMIT;
        const next = trimmed.slice(extra);
        setIndex(next.length - 1);
        setSavedIndex((saved) => Math.max(-1, saved - extra));
        return next;
      }
      setIndex(trimmed.length - 1);
      return trimmed;
    });
    liveRef.current = null;
    gestureStartRef.current = null;
    setLive(null);
  }, [index]);

  const beginGesture = useCallback(() => {
    if (gestureStartRef.current) return;
    const start = cloneSnapshot(snapshotRef.current);
    gestureStartRef.current = start;
    liveRef.current = cloneSnapshot(start);
    setLive(liveRef.current);
  }, []);

  const updateLive = useCallback((nextSnapshot) => {
    const cloned = cloneSnapshot(nextSnapshot);
    liveRef.current = cloned;
    setLive(cloned);
  }, []);

  const endGesture = useCallback(() => {
    const start = gestureStartRef.current;
    const end = liveRef.current;
    gestureStartRef.current = null;
    if (!end || (start && snapshotsEqual(start, end))) {
      liveRef.current = null;
      setLive(null);
      return;
    }
    commit(end);
  }, [commit]);

  const undo = useCallback(() => {
    if (liveRef.current) {
      liveRef.current = null;
      gestureStartRef.current = null;
      setLive(null);
      return;
    }
    setIndex((value) => Math.max(0, value - 1));
  }, []);

  const redo = useCallback(() => {
    if (liveRef.current) return;
    setIndex((value) => Math.min(history.length - 1, value + 1));
  }, [history.length]);

  const markSaved = useCallback(() => {
    setSavedIndex(index);
  }, [index]);

  const referencedMediaKeys = useCallback(() => {
    const keys = new Set();
    history.forEach((item) => {
      if (item.media.logoKey) keys.add(item.media.logoKey);
      if (item.media.footerLogoKey) keys.add(item.media.footerLogoKey);
      if (item.media.bgKey) keys.add(item.media.bgKey);
    });
    if (live?.media?.logoKey) keys.add(live.media.logoKey);
    if (live?.media?.footerLogoKey) keys.add(live.media.footerLogoKey);
    if (live?.media?.bgKey) keys.add(live.media.bgKey);
    return keys;
  }, [history, live]);

  return {
    snapshot,
    config: snapshot.config,
    media: snapshot.media,
    dirty,
    canUndo,
    canRedo,
    commit,
    beginGesture,
    updateLive,
    endGesture,
    undo,
    redo,
    replaceAll,
    markSaved,
    referencedMediaKeys,
  };
}

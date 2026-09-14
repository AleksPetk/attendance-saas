import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { endpoints } from "@checkstation/api";
import { canViewGlobalMembers } from "@checkstation/domain";
import { Alert, Badge, Button, Card, Loading } from "../components/ui";
import { useApp } from "../lib/AppProvider";
import { availableSteps, bubblePosition, completionId, dismissalId, guides, shouldAutoStart, type Copy, type Guide, type Step } from "./guides";
// @ts-expect-error Reuse the unchanged Workspace visibility/wait/scroll engine with desktop selectors.
import { waitForTutorialTarget, scrollTutorialTargetIntoView, preferredTutorialGroup } from "../../../../frontend/src/tutorialTargeting.js";
import "./guidedHelp.css";
import { statePath, completionPath, progressIds, type TutorialState } from "./progress";

type Tour = { guide: Guide; steps: Step[]; index: number; automatic: boolean; origin: string };
type Context = { ids: string[]; loading: boolean; error: string; busy: boolean; groupTab?: string; start: (id: string, automatic?: boolean) => Promise<void>; retry: () => Promise<void> };
const GuidedContext = createContext<Context | null>(null);
const rows = (data: any) => Array.isArray(data) ? data : data?.results || [];
const special = (path: string) => /^\/kiosk\/|\/kiosk-design$/.test(path);
// Read-only presentation selection: does not touch the user's normal Group tab/draft.
export function useDesktopGuidedGroupTab() { return useContext(GuidedContext)?.groupTab; }

export function DesktopGuidedHelpProvider({ children }: { children: ReactNode }) {
  const { api, authState, locale } = useApp();
  const session = authState.session;
  const owner = session?.role === "owner";
  const location = useLocation();
  const navigate = useNavigate();
  const [ids, setIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tour, setTour] = useState<Tour | null>(null);
  const [target, setTarget] = useState<Element | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [missing, setMissing] = useState(false);
  const autoStarted = useRef(false);
  const activeRequest = useRef(false);
  const copy = (text: Copy) => text[locale === "ja" ? 1 : 0];
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      if (owner) { const state = await api.get<TutorialState>(statePath); setIds(progressIds(state)); }
      setLoaded(true);
    } catch { setError(locale === "ja" ? "ガイドの進捗を取得できません。再試行してください。" : "Unable to load guide progress. Please retry."); }
    finally { setLoading(false); }
  }, [api, owner, locale]);
  useEffect(() => { void load(); }, [load]);

  const start = useCallback(async (id: string, automatic = false) => {
    if (activeRequest.current || special(location.pathname)) return;
    const guide = guides.find(item => item.id === id);
    if (!guide) return;
    activeRequest.current = true; setBusy(true); setError("");
    try {
      let group: any = null; let member: any = null;
      const allowed = availableSteps(guide, session);
      if (allowed.some(item => item.route.includes("$group"))) {
        try { group = preferredTutorialGroup(rows(await api.get(endpoints.groups() + "?status=active"))); } catch { /* Explain unavailable targets without creating data. */ }
      }
      if (allowed.some(item => item.route.includes("$member")) && canViewGlobalMembers(session)) {
        try { member = rows(await api.get(endpoints.members() + "?status=active")).find((item: any) => !item.is_plan_locked); } catch { /* Empty state is a valid tutorial state. */ }
      }
      const steps = allowed.map(item => {
        if (item.route.includes("$group") && !group) return { ...item, route: "/groups", selector: ".page .empty-state", tab: undefined };
        if (item.route.includes("$member") && !member) return { ...item, route: "/people", selector: ".page .empty-state" };
        return { ...item, route: item.route.replace("$group", String(group?.id)).replace("$member", String(member?.id)) };
      });
      if (steps.length) setTour({ guide, steps, index: 0, automatic, origin: location.pathname });
    } finally { activeRequest.current = false; setBusy(false); }
  }, [api, location.pathname, session]);

  useEffect(() => {
    if (!loaded || loading || autoStarted.current || special(location.pathname)) return;
    if (shouldAutoStart(ids, owner)) { autoStarted.current = true; void start("workspace-overview", true); }
  }, [ids, loaded, loading, owner, start, location.pathname]);

  async function persist(id: string) {
    if (owner) {
      const next = await api.post<TutorialState>(completionPath(id), {});
      setIds(progressIds(next));
    } else setIds(current => [...new Set([...current, id])]); // Staff endpoint is owner-only; session-only manual guides.
  }
  async function close() {
    if (!tour || activeRequest.current) return;
    const previous = tour; setTour(null); setTarget(null);
    if (previous.automatic) {
      setIds(current => [...new Set([...current, dismissalId])]);
      try { await persist(dismissalId); } catch { setError(copy(["Your tutorial is closed, but dismissal could not sync. Retry progress sync in Guided Help before closing the app.", "ガイドは閉じましたが、スキップ状態を同期できません。アプリ終了前にガイド付きヘルプから再試行してください。"])); }
    }
    navigate(previous.automatic ? "/" : previous.origin, { state: previous.origin === "/help" ? { view: "guided" } : undefined });
  }
  async function next() {
    if (!tour || activeRequest.current) return;
    if (tour.index < tour.steps.length - 1) { setTour({ ...tour, index: tour.index + 1 }); return; }
    activeRequest.current = true; setBusy(true); setError("");
    try {
      await persist(completionId(tour.guide.id));
      const previous = tour; setTour(null); setTarget(null);
      navigate(previous.automatic ? "/" : previous.origin, { state: previous.origin === "/help" ? { view: "guided" } : undefined });
    } catch { setError(copy(["Could not save completion. Retry Finish; your guide remains open.", "完了を保存できません。ガイドを開いたまま、完了を再試行してください。"])); }
    finally { activeRequest.current = false; setBusy(false); }
  }
  const currentStep = tour?.steps[tour.index];
  useEffect(() => {
    if (!currentStep) return;
    let cancelled = false;
    setTarget(null); setWaiting(true); setMissing(false);
    if (location.pathname !== currentStep.route) { navigate(currentStep.route); return; }
    async function reveal() {
      if (currentStep!.tab != null) {
        const names = currentStep!.route === "/history" ? ["activity", "report"] : ["overview", "participants", "configuration", "kiosk"];
        const selector = '.page > .segmented [data-segment-value="' + names[currentStep!.tab!] + '"]';
        const button = await waitForTutorialTarget("desktop-tab", { root: { body: document.body, querySelector: () => document.querySelector(selector) } });
        if (cancelled) return;
        if (currentStep!.route === "/history" && button && !button.disabled && button.getAttribute("aria-selected") !== "true") {
          button.click();
          // Let React commit the new pane before resolving its target.
          await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          if (cancelled) return;
        }
      }
      if (currentStep!.reveal) {
        const selector = currentStep!.reveal === "member-edit" ? ".page-header .page-actions .button" : ".configuration-disclosure:first-child > .configuration-disclosure-toggle";
        const alreadyVisible = document.querySelector(currentStep!.selector);
        if (!alreadyVisible) {
          const control = await waitForTutorialTarget("desktop-disclosure", { root: { body: document.body, querySelector: () => document.querySelector(selector) } });
          if (cancelled) return;
          // These two allowlisted controls only open existing forms, never submit or change data.
          if (control && !control.disabled) {
            control.click();
            await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
            if (cancelled) return;
          }
        }
      }
      const element = await waitForTutorialTarget("desktop-step", { root: { body: document.body, querySelector: () => document.querySelector(currentStep!.selector) } });
      if (cancelled) return;
      if (element) await scrollTutorialTargetIntoView(element, { reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches, cancelled: () => cancelled });
      if (!cancelled) { setTarget(element); setMissing(!element); setWaiting(false); }
    }
    void reveal();
    return () => { cancelled = true; };
  }, [currentStep, location.pathname, navigate]);
  // A tour never remains layered over live Kiosk/editor or a user-created form.
  useEffect(() => { if (tour && special(location.pathname)) { setTour(null); setTarget(null); } }, [location.pathname, tour]);
  const groupTab = currentStep?.route === location.pathname && /^\/groups\/[^/]+$/.test(location.pathname) && currentStep.tab != null ? ["overview", "participants", "configuration", "kiosk"][currentStep.tab] : undefined;
  return <GuidedContext.Provider value={{ ids, loading, error, busy, groupTab, start, retry: async () => {
    if (ids.includes(dismissalId) && owner) { try { await persist(dismissalId); setError(""); } catch { setError(copy(["Progress sync failed. Please retry.", "進捗の同期に失敗しました。再試行してください。"])); } } else await load();
  } }}>{children}{tour ? <TourOverlay tour={tour} target={target} waiting={waiting} missing={missing} busy={busy} error={error} copy={copy} onClose={() => void close()} onNext={() => void next()} onBack={() => setTour({ ...tour, index: Math.max(0, tour.index - 1) })} /> : null}</GuidedContext.Provider>;
}

export function DesktopGuidedHelp() {
  const context = useContext(GuidedContext)!;
  const { locale, authState } = useApp();
  const copy = (text: Copy) => text[locale === "ja" ? 1 : 0];
  return <><Alert>{context.error}</Alert>{context.error ? <Button variant="secondary" onClick={() => void context.retry()}>{copy(["Retry progress sync", "進捗の同期を再試行"])}</Button> : null}{context.loading ? <Loading label={copy(["Loading guides…", "ガイドを読み込み中…"])} /> : <div className="desktop-guided-grid">{guides.filter(guide => availableSteps(guide, authState.session).length).map(guide => {
    const completed = context.ids.includes(completionId(guide.id));
    return <Card key={guide.id} title={copy(guide.title)} description={copy(guide.description)}><div className="desktop-guide-card-footer"><span>{copy(["About ", "約"]) + guide.minutes + copy([" min", "分"])}</span><Badge tone={completed ? "green" : "neutral"}>{copy(completed ? ["Completed", "完了"] : ["Available", "利用可能"])}</Badge><Button disabled={context.busy} onClick={() => void context.start(guide.id)}>{copy(completed ? ["Replay", "もう一度見る"] : ["Start", "開始"])}</Button></div></Card>;
  })}</div>}</>;
}

function TourOverlay({ tour, target, waiting, missing, busy, error, copy, onClose, onNext, onBack }: { tour: Tour; target: Element | null; waiting: boolean; missing: boolean; busy: boolean; error: string; copy: (text: Copy) => string; onClose: () => void; onNext: () => void; onBack: () => void }) {
  const dialog = useRef<HTMLElement>(null);
  const [geometry, setGeometry] = useState({ rect: null as DOMRect | null, left: 16, top: 16 });
  const step = tour.steps[tour.index];
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => {
    const measure = () => {
      const rect = target?.isConnected ? target.getBoundingClientRect() : null;
      const size = dialog.current?.getBoundingClientRect();
      const position = bubblePosition(rect, size?.width || 380, size?.height || 300, { width: innerWidth, height: innerHeight });
      setGeometry({ rect, ...position });
    };
    measure(); dialog.current?.focus();
    const observer = new ResizeObserver(measure);
    if (target) observer.observe(target);
    if (dialog.current) observer.observe(dialog.current);
    window.addEventListener("resize", measure); window.addEventListener("scroll", measure, true);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [target, tour.index, waiting, missing, copy, error]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key !== "Tab") return;
      const controls = [...dialog.current!.querySelectorAll<HTMLElement>("button:not(:disabled), [tabindex='0']")];
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener("keydown", keyboard); return () => window.removeEventListener("keydown", keyboard);
  }, [onClose]);
  const rect = geometry.rect;
  return <div className="desktop-tour-layer"><div className="desktop-tour-blocker" style={{ background: rect ? "transparent" : undefined }} />{rect ? <div className="desktop-tour-spotlight" style={{ left: Math.max(0, rect.left - 5), top: Math.max(0, rect.top - 5), width: rect.width + 10, height: rect.height + 10 }} /> : null}<section ref={dialog} className="desktop-tour-bubble" role="dialog" aria-modal="true" aria-labelledby="desktop-tour-title" aria-describedby="desktop-tour-body" tabIndex={-1} style={{ left: geometry.left, top: geometry.top }}>
    <div className="desktop-tour-progress"><span>{copy(tour.guide.title)}</span><span>{tour.index + 1} / {tour.steps.length}</span></div><h2 id="desktop-tour-title">{copy(step.title)}</h2><p id="desktop-tour-body">{copy(step.body)}</p>
    {waiting ? <p className="desktop-tour-hint">{copy(["Opening the relevant area…", "関連画面を開いています…"])}</p> : null}
    {missing ? <p className="desktop-tour-hint">{copy(["This control is not currently available, or there is no accessible record yet. You can continue without creating data.", "この項目は現在利用できないか、対象データがありません。データを作成せずに次へ進めます。"])}</p> : null}<Alert>{error}</Alert>
    <footer><Button variant="ghost" disabled={busy} onClick={onClose}>{copy(tour.automatic ? ["Skip tutorial", "ガイドをスキップ"] : ["Close", "閉じる"])}</Button><div>{tour.index > 0 ? <Button variant="secondary" disabled={busy} onClick={onBack}>{copy(["Back", "戻る"])}</Button> : null}<Button loading={busy} disabled={waiting} onClick={onNext}>{copy(tour.index === tour.steps.length - 1 ? ["Finish", "完了"] : ["Next", "次へ"])}</Button></div></footer>
  </section></div>;
}

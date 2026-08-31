import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, errorMessage } from "./api.js";
import { confirmWorkspaceLeave } from "./kiosk/builder/workspaceLeaveGuard.js";
import TutorialOverlay from "./TutorialOverlay.jsx";
import {
  automaticTutorialEligible,
  availableTutorialModules,
  hasLegacyOnboardingCompletion,
  tutorialModuleById,
} from "./workspaceOnboarding.js";
import { isWorkspaceOwner } from "./workspaceSession.js";
import {
  advanceTutorialFlow,
  focusedTutorialReturnRoute,
  skipTutorialFlow,
} from "./tutorialFlow.js";
import {
  preferredTutorialGroup,
  scrollTutorialTargetIntoView,
  tutorialRouteNeedsNavigation,
  waitForTutorialTarget,
} from "./tutorialTargeting.js";

const TutorialContext = createContext(null);
function useReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return undefined;
    const update = () => setReduced(media.matches);
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

export function TutorialProvider({ session, onTutorialStateChange, children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const reducedMotion = useReducedMotion();
  const [tutorialState, setTutorialState] = useState(session?.workspace?.tutorial || null);
  const [groupId, setGroupId] = useState(null);
  const [tour, setTour] = useState(null);
  const [targetElement, setTargetElement] = useState(null);
  const [targetRect, setTargetRect] = useState(null);
  const [targetStatus, setTargetStatus] = useState("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [summaryTrial, setSummaryTrial] = useState(null);
  const [completedModuleIds, setCompletedModuleIds] = useState(
    () => session?.workspace?.tutorial?.completed_module_ids || [],
  );
  const [feedback, setFeedback] = useState("");
  const automaticStarted = useRef(false);

  const applyTutorialState = useCallback((next) => {
    setTutorialState(next);
    setCompletedModuleIds(
      Array.isArray(next?.completed_module_ids) ? next.completed_module_ids : [],
    );
    onTutorialStateChange?.(next);
  }, [onTutorialStateChange]);

  const persist = useCallback(async (payload) => {
    const result = await api.updateTutorialState(payload);
    applyTutorialState(result.data);
    return result.data;
  }, [applyTutorialState]);

  const resolveGroup = useCallback(async () => {
    if (groupId) return groupId;
    try {
      const result = await api.listGroups(session, "?status=active");
      const candidate = preferredTutorialGroup(result.data);
      const nextId = candidate?.id || null;
      setGroupId(nextId);
      return nextId;
    } catch {
      return null;
    }
  }, [groupId, session]);

  const startTutorial = useCallback(async (moduleId = "workspace-overview", options = {}) => {
    if (!isWorkspaceOwner(session) || !confirmWorkspaceLeave()) return false;
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const nextGroupId = await resolveGroup();
      const module = tutorialModuleById(session, moduleId, { groupId: nextGroupId });
      if (!module) throw new Error("This tutorial is not available for the current Workspace.");
      const automatic = Boolean(options.automatic);
      let index = 0;
      if (automatic && tutorialState?.status === "in_progress" && tutorialState.last_step) {
        const savedIndex = module.steps.findIndex((item) => item.id === tutorialState.last_step);
        if (savedIndex >= 0) index = savedIndex;
      }
      if (automatic) {
        await persist({
          status: "in_progress",
          last_module: module.id,
          last_step: module.steps[index]?.id || "welcome",
        });
      }
      setTour({ module, steps: module.steps, index, automatic, summary: false, terminalStatus: "" });
      return true;
    } catch (startError) {
      setError(errorMessage(startError));
      return false;
    } finally {
      setBusy(false);
    }
  }, [persist, resolveGroup, session, tutorialState]);

  useEffect(() => {
    if (!isWorkspaceOwner(session) || tutorialState) return;
    let cancelled = false;
    api.getTutorialState()
      .then((result) => {
        if (!cancelled) applyTutorialState(result.data);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [applyTutorialState, session, tutorialState]);

  useEffect(() => {
    if (automaticStarted.current || !automaticTutorialEligible(session, tutorialState)) return;
    automaticStarted.current = true;
    const workspaceId = session?.workspace?.workspace_id;
    if (tutorialState?.status === "not_started" && hasLegacyOnboardingCompletion(workspaceId)) {
      persist({ status: "completed", last_module: "workspace-overview", last_step: "legacy-complete" })
        .catch(() => { automaticStarted.current = false; });
      return;
    }
    startTutorial("workspace-overview", { automatic: true });
  }, [persist, session, startTutorial, tutorialState]);

  const currentStep = tour?.summary ? null : tour?.steps?.[tour.index] || null;

  const refreshSummaryTrial = useCallback(async () => {
    try {
      const result = await api.loadWorkspace(null);
      setSummaryTrial(result.data?.builtin_trial || null);
    } catch {
      setSummaryTrial(session?.workspace?.builtin_trial || null);
    }
  }, [session]);

  useEffect(() => {
    if (!currentStep) return;
    if (tutorialRouteNeedsNavigation(`${location.pathname}${location.search}`, currentStep.route)) {
      navigate(currentStep.route);
      return;
    }
    setTargetElement(null);
    setTargetRect(null);
    if (!currentStep.target) {
      setTargetStatus("fallback");
      return;
    }
    let cancelled = false;
    setTargetStatus("waiting");
    waitForTutorialTarget(currentStep.target).then(async (element) => {
      if (cancelled) return;
      if (!element) {
        setTargetStatus("missing");
        return;
      }
      setTargetStatus("scrolling");
      const revealed = await scrollTutorialTargetIntoView(element, {
        reducedMotion,
        cancelled: () => cancelled,
      });
      if (cancelled) return;
      setTargetElement(revealed ? element : null);
      setTargetStatus(revealed ? "found" : "missing");
    });
    return () => { cancelled = true; };
  }, [currentStep, location.pathname, location.search, navigate, reducedMotion]);

  useEffect(() => {
    if (!targetElement) return undefined;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!targetElement.isConnected) {
          setTargetElement(null);
          setTargetStatus("missing");
          setTargetRect(null);
          return;
        }
        const rect = targetElement.getBoundingClientRect();
        setTargetRect({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height });
      });
    };
    measure();
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    resizeObserver?.observe(targetElement);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [targetElement]);

  const next = useCallback(async () => {
    if (!tour || tour.summary || busy) return;
    if (tour.index < tour.steps.length - 1) {
      const nextIndex = tour.index + 1;
      const nextStep = tour.steps[nextIndex];
      if (tour.automatic) {
        try {
          await persist({ status: "in_progress", last_module: tour.module.id, last_step: nextStep.id });
        } catch (persistError) {
          setError(errorMessage(persistError));
          return;
        }
      }
      setError("");
      setTour(advanceTutorialFlow(tour));
      return;
    }
    const completedFlow = advanceTutorialFlow(tour);
    if (completedFlow.completionMode === "lightweight") {
      setBusy(true);
      try {
        const result = await api.completeTutorialModule(tour.module.id);
        applyTutorialState(result.data);
        setFeedback(`${tour.module.title} tutorial complete.`);
        setTour(null);
        setError("");
        navigate(focusedTutorialReturnRoute(completedFlow));
      } catch (persistError) {
        setError(errorMessage(persistError));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (tour.automatic) {
      setBusy(true);
      try {
        await persist({ status: "completed", last_module: tour.module.id, last_step: tour.steps[tour.index].id });
      } catch (persistError) {
        setError(errorMessage(persistError));
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    if (completedFlow.showTrialAnnouncement) {
      await refreshSummaryTrial();
    }
    setTour(completedFlow);
  }, [applyTutorialState, busy, navigate, persist, refreshSummaryTrial, tour]);

  const back = useCallback(() => {
    if (!tour || tour.summary || tour.index === 0) return;
    const nextIndex = tour.index - 1;
    setError("");
    setTour({ ...tour, index: nextIndex });
    if (tour.automatic) {
      persist({ status: "in_progress", last_module: tour.module.id, last_step: tour.steps[nextIndex].id }).catch(() => {});
    }
  }, [persist, tour]);

  const skip = useCallback(async () => {
    if (!tour?.automatic || busy) return;
    setBusy(true);
    try {
      await persist({ status: "skipped", last_module: tour.module.id, last_step: tour.steps[tour.index]?.id || "" });
      await refreshSummaryTrial();
      setError("");
      setTour(skipTutorialFlow(tour));
    } catch (persistError) {
      setError(errorMessage(persistError));
    } finally {
      setBusy(false);
    }
  }, [busy, persist, refreshSummaryTrial, tour]);

  const close = useCallback(() => {
    if (tour?.automatic && !tour.summary) return;
    const returnRoute = !tour?.summary ? focusedTutorialReturnRoute(tour) : null;
    setTour(null);
    setError("");
    if (returnRoute) navigate(returnRoute);
  }, [navigate, tour]);

  useEffect(() => {
    if (!feedback) return undefined;
    const timer = window.setTimeout(() => setFeedback(""), 3200);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const modules = useMemo(() => availableTutorialModules(session, { groupId }), [groupId, session]);
  const value = useMemo(
    () => ({ tutorialState, modules, activeTour: tour, startTutorial, completedModuleIds }),
    [completedModuleIds, modules, startTutorial, tour, tutorialState],
  );

  return (
    <TutorialContext.Provider value={value}>
      {children}
      <TutorialOverlay
        tour={tour}
        targetRect={targetRect}
        targetStatus={targetStatus}
        reducedMotion={reducedMotion}
        busy={busy}
        error={error}
        trial={summaryTrial || session?.workspace?.builtin_trial}
        onBack={back}
        onNext={next}
        onSkip={skip}
        onClose={close}
        onDashboard={() => { setTour(null); navigate("/dashboard"); }}
        onTutorialHub={() => { setTour(null); navigate("/account/tutorial"); }}
      />
      {feedback ? (
        <div className="tutorial-success-toast" role="status" aria-live="polite">
          <span aria-hidden="true">✓</span>
          {feedback}
        </div>
      ) : null}
    </TutorialContext.Provider>
  );
}

export function useTutorial() {
  const value = useContext(TutorialContext);
  if (!value) throw new Error("useTutorial must be used inside TutorialProvider.");
  return value;
}

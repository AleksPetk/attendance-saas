import { useMemo, useState } from "react";
import { markWorkspaceOnboardingDone } from "./workspaceOnboarding.js";

function formatEndsAt(iso) {
  if (!iso) return "7 days from now";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function WorkspaceOnboarding({ session, onClose }) {
  const [step, setStep] = useState(0);
  const trial = session?.workspace?.builtin_trial;
  const steps = useMemo(
    () => [
      {
        title: "Welcome to your workspace",
        body: "This is your CheckStation workspace. Create Groups, add people, and launch a kiosk from here.",
      },
      {
        title: "Groups and kiosks",
        body: "Each Group owns its own kiosk. Add Members or Visitors, then launch the kiosk when you are ready to take attendance.",
      },
      {
        title: "Business is already included",
        body: `Your workspace already has Business for 7 days — no card and no extra step. It stays until ${formatEndsAt(
          trial?.ends_at,
        )}. If you choose Plus or Business during that week, paid billing starts after the free week ends.`,
      },
    ],
    [trial?.ends_at],
  );
  const current = steps[step];
  const last = step === steps.length - 1;

  function finish() {
    markWorkspaceOnboardingDone(session?.workspace?.workspace_id);
    onClose?.();
  }

  return (
    <div className="confirm-modal-backdrop workspace-onboarding-backdrop" role="presentation">
      <div
        className="confirm-modal workspace-onboarding-modal"
        role="dialog"
        aria-labelledby="workspace-onboarding-title"
        aria-modal="true"
      >
        <p className="workspace-onboarding-step">
          {step + 1} of {steps.length}
        </p>
        <h2 id="workspace-onboarding-title">{current.title}</h2>
        <p>{current.body}</p>
        <div className="confirm-modal-actions">
          {step > 0 ? (
            <button type="button" className="btn-secondary" onClick={() => setStep(step - 1)}>
              Back
            </button>
          ) : (
            <button type="button" className="btn-secondary" onClick={finish}>
              Skip
            </button>
          )}
          {last ? (
            <button type="button" className="btn-primary" onClick={finish}>
              Continue to workspace
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={() => setStep(step + 1)}>
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Desktop uses the existing owner tutorial module API, never the browser lifecycle PATCH.
// The dismissal sentinel records automatic-onboarding disposition, not guide completion.
export type TutorialState = { completed_module_ids?: string[] };
export const statePath = "/tutorial/state/";
export const completionPath = (id: string) => "/tutorial/modules/" + encodeURIComponent(id) + "/complete/";
export function progressIds(state: TutorialState): string[] {
  return Array.isArray(state.completed_module_ids) ? state.completed_module_ids.filter(id => typeof id === "string") : [];
}

import AsyncStorage from "@react-native-async-storage/async-storage";
import { availableSteps, guides as desktopGuides, type Guide, type Step } from "../../../desktop/src/tutorials/guides";
import type { WorkspaceSession } from "@checkstation/domain";

export type { Guide, Step };
export const guides = desktopGuides;

const completionId = (id: string) => `mobile-guide-${id}-v1`;
export const dismissalId = "mobile-auto-onboarding-dismissed-v1";

export function mobileSteps(guide: Guide, session: WorkspaceSession | null | undefined) {
  return availableSteps(guide, session);
}

export function shouldAutoStart(ids: string[], owner: boolean) {
  return owner && !ids.includes(dismissalId) && !ids.includes(completionId("workspace-overview"));
}

export async function loadTutorialIds() {
  const keys = await AsyncStorage.getAllKeys();
  return keys.filter((key) => key.startsWith("mobile-guide-") || key === dismissalId);
}

export async function markTutorial(id: string) {
  await AsyncStorage.setItem(completionId(id), "1");
}

export async function dismissAutoStart() {
  await AsyncStorage.setItem(dismissalId, "1");
}

export function mobileRoute(route: string, ids: { groupId?: string; memberId?: string }) {
  if (route === "/groups/$group/kiosk-settings") return ids.groupId ? `/(app)/group/${ids.groupId}/kiosk-settings` : "/(app)/(tabs)/groups";
  if (route === "/groups/$group") return ids.groupId ? `/(app)/group/${ids.groupId}` : "/(app)/(tabs)/groups";
  if (route === "/people/$member") return ids.memberId ? `/(app)/member/${ids.memberId}` : "/(app)/(tabs)/people";
  const routes: Record<string, string> = {
    "/": "/(app)/(tabs)/home",
    "/people": "/(app)/(tabs)/people",
    "/groups": "/(app)/(tabs)/groups",
    "/history": "/(app)/(tabs)/history",
    "/staff": "/(app)/staff",
    "/account": "/(app)/account",
    "/plan": "/(app)/plan",
    "/help": "/(app)/help",
  };
  return routes[route] || "/(app)/(tabs)/home";
}

export function stepCopy(step: Step, locale: "en" | "ja") {
  const index = locale === "ja" ? 1 : 0;
  if (step.route === "/" && step.selector === ".sidebar nav") {
    return {
      title: locale === "ja" ? "下部タブ" : "Bottom tabs",
      body: locale === "ja" ? "下部タブからホーム、グループ、履歴へ移動します。この案内はデータを変更しません。" : "Use the bottom tabs for Home, Groups, and History. This tour does not change your data.",
    };
  }
  return { title: step.title[index], body: step.body[index] };
}

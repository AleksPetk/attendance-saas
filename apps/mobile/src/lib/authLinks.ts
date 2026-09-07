import * as Linking from "expo-linking";

const WORKSPACE_ORIGIN = "https://workspace.checkstation.app";

export const workspaceAuthUrls = {
  forgotPassword: `${WORKSPACE_ORIGIN}/forgot-password`,
  recoverAccount: `${WORKSPACE_ORIGIN}/recover-account`,
  register: `${WORKSPACE_ORIGIN}/register`,
} as const;

/** Recovery and registration remain the existing production web flows for now. */
export async function openWorkspaceAuthUrl(url: string): Promise<void> {
  await Linking.openURL(url);
}

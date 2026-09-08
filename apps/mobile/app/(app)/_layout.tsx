import { Redirect, Stack } from "expo-router";
import { useApp } from "../../src/lib/AppProvider";
import { colors } from "../../src/theme/tokens";

export default function AppGroupLayout() {
  const { authState, t } = useApp();
  if (authState.status !== "authenticated" && authState.status !== "kiosk_locked") return <Redirect href="/(auth)/sign-in" />;
  return (
    <Stack screenOptions={{ headerBackTitle: t("common.back"), headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.blue, headerTitleStyle: { color: colors.text }, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="account" options={{ title: t("nav.account") }} />
      <Stack.Screen name="security" options={{ title: t("nav.security") }} />
      <Stack.Screen name="plan" options={{ title: t("nav.plan") }} />
      <Stack.Screen name="staff" options={{ title: t("nav.staff") }} />
      <Stack.Screen name="help" options={{ title: t("nav.help") }} />
      <Stack.Screen name="help/document/[slug]" options={{ title: t("help.article") }} />
      <Stack.Screen name="help/status" options={{ title: t("status.title") }} />
      <Stack.Screen name="member/[id]" options={{ title: t("nav.members") }} />
      <Stack.Screen name="member/new" options={{ title: t("members.add") }} />
      <Stack.Screen name="group/[id]" options={{ title: t("nav.groups") }} />
      <Stack.Screen name="group/new" options={{ title: t("groups.add") }} />
      <Stack.Screen name="group/[id]/kiosk-settings" options={{ title: t("kiosk.settings") }} />
      <Stack.Screen name="group/[id]/kiosk-design" options={{ title: t("kiosk.design") || "Kiosk design" }} />
    </Stack>
  );
}

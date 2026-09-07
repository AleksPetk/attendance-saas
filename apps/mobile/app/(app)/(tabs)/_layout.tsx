import { Redirect, Tabs } from "expo-router";
import { useApp } from "../../../src/lib/AppProvider";
import { colors } from "../../../src/theme/tokens";
import { LoadingState, Screen } from "../../../src/components/ui";

export default function AppTabsLayout() {
  const { ready, authState, t } = useApp();
  if (!ready) {
    return (
      <Screen>
        <LoadingState label={t("common.loading")} />
      </Screen>
    );
  }
  if (authState.status !== "authenticated") {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen name="home" options={{ title: t("nav.home") }} />
      <Tabs.Screen name="groups" options={{ title: t("nav.groups") }} />
      <Tabs.Screen name="people" options={{ title: t("nav.people") }} />
      <Tabs.Screen name="history" options={{ title: t("nav.history") }} />
      <Tabs.Screen name="more" options={{ title: t("nav.more") }} />
    </Tabs>
  );
}

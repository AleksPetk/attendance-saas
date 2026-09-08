import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Redirect, Tabs } from "expo-router";
import { StyleSheet, useWindowDimensions, View, type ColorValue } from "react-native";
import { canViewGlobalMembers } from "@checkstation/domain";
import { LoadingState, Screen } from "../../../src/components/ui";
import { useApp } from "../../../src/lib/AppProvider";
import { colors, shadows } from "../../../src/theme/tokens";

type TabIconName = keyof typeof Ionicons.glyphMap;

function tabIcon(name: TabIconName, activeName: TabIconName = name) {
  return ({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) => (
    <View style={[styles.iconSurface, focused && styles.iconSurfaceActive]}>
      <Ionicons color={color} name={focused ? activeName : name} size={size} />
      {focused ? <LinearGradient colors={[colors.blue, colors.cyan]} end={{ x: 1, y: 0 }} start={{ x: 0, y: 0 }} style={styles.activeIndicator} /> : null}
    </View>
  );
}

export default function AppTabsLayout() {
  const { ready, authState, t } = useApp();
  const { width } = useWindowDimensions();
  if (!ready) return <Screen><LoadingState label={t("common.loading")} /></Screen>;
  if (authState.status !== "authenticated") return <Redirect href="/(auth)/sign-in" />;

  const tablet = width >= 768;
  const showMembers = canViewGlobalMembers(authState.session);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.blue,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 12, fontWeight: "600", letterSpacing: 0.1 },
        tabBarPosition: tablet ? "left" : "bottom",
        tabBarStyle: tablet
          ? { width: 220, backgroundColor: colors.surface, borderRightColor: colors.border, paddingTop: 24 }
          : { backgroundColor: colors.surface, borderTopColor: colors.borderStrong, height: 84, paddingTop: 7, paddingBottom: 22, ...shadows.sm },
      }}
    >
      <Tabs.Screen name="home" options={{ title: t("nav.home"), tabBarIcon: tabIcon("home-outline", "home") }} />
      <Tabs.Screen name="people" options={{ href: showMembers ? undefined : null, title: t("nav.members"), tabBarIcon: tabIcon("people-outline", "people") }} />
      <Tabs.Screen name="groups" options={{ title: t("nav.groups"), tabBarIcon: tabIcon("layers-outline", "layers") }} />
      <Tabs.Screen name="history" options={{ title: t("nav.history"), tabBarIcon: tabIcon("time-outline", "time") }} />
      <Tabs.Screen name="more" options={{ title: t("nav.more"), tabBarIcon: tabIcon("ellipsis-horizontal-circle-outline", "ellipsis-horizontal-circle") }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconSurface: { width: 42, height: 31, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  iconSurfaceActive: { backgroundColor: colors.primarySoft },
  activeIndicator: { position: "absolute", bottom: -1, width: 22, height: 3, borderRadius: 2 },
});

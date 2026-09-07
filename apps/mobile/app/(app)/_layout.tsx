import { Redirect, Slot } from "expo-router";
import { useApp } from "../../src/lib/AppProvider";

export default function AppGroupLayout() {
  const { authState } = useApp();
  if (authState.status !== "authenticated" && authState.status !== "kiosk_locked") {
    return <Redirect href="/(auth)/sign-in" />;
  }
  return <Slot />;
}

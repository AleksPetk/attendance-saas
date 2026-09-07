import { Redirect } from "expo-router";
import { useApp } from "../src/lib/AppProvider";
import { LoadingState, Screen } from "../src/components/ui";

export default function Index() {
  const { ready, authState, t } = useApp();
  if (!ready || authState.status === "unknown") {
    return (
      <Screen>
        <LoadingState label={t("common.loading")} />
      </Screen>
    );
  }
  if (authState.status === "kiosk_locked" && authState.session?.kiosk_group_id) {
    return <Redirect href={`/kiosk/${authState.session.kiosk_group_id}`} />;
  }
  if (authState.status === "authenticated" || authState.status === "needs_2fa") {
    if (authState.status === "needs_2fa") {
      return <Redirect href="/(auth)/sign-in" />;
    }
    return <Redirect href="/(app)/(tabs)/home" />;
  }
  return <Redirect href="/(auth)/sign-in" />;
}

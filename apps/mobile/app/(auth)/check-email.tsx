import { StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { AuthScreen } from "../../src/components/AuthScreen";
import { Button } from "../../src/components/ui";
import { useApp } from "../../src/lib/AppProvider";
import { colors, space, type } from "../../src/theme/tokens";

export default function CheckEmailScreen() {
  const { t } = useApp();
  const { email, detail } = useLocalSearchParams<{ email?: string; detail?: string }>();
  return <AuthScreen title={t("auth.checkEmailTitle")} lead={email ? t("auth.checkEmailWithEmail", { email }) : t("auth.checkEmailLead")}><View style={styles.body}><Text style={styles.copy}>{detail || t("auth.checkEmailHint")}</Text><Button label={t("auth.backToSignIn")} onPress={() => router.replace("/(auth)/sign-in")} variant="secondary" /></View><Button label={t("accountLink.open")} variant="secondary" onPress={() => router.push("/(auth)/email-link")} /></AuthScreen>;
}
const styles = StyleSheet.create({ body: { gap: space.lg }, copy: { ...type.body, color: colors.textSecondary } });

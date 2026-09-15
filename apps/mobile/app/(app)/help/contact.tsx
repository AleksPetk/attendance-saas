import { MobileHelpContact } from "../../../src/features/help/MobileHelpContact";
import { Screen } from "../../../src/components/ui";
import { useApp } from "../../../src/lib/AppProvider";
import { StyleSheet } from "react-native";

export default function HelpContactScreen() {
  const { authState } = useApp();
  const identityEmail = String(
    authState.session?.workspace?.identity
      || (authState.session?.actor as { email?: string } | undefined)?.email
      || "",
  ).trim();

  return (
    <Screen style={styles.screen}>
      <MobileHelpContact emailHint={identityEmail} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 0 },
});

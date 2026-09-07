import { ScrollView } from "react-native";
import { router } from "expo-router";
import { Body, Button, Card, Screen, Title } from "../../src/components/ui";
import { useApp } from "../../src/lib/AppProvider";

export default function AccountScreen() {
  const { authState, t } = useApp();
  return (
    <Screen>
      <ScrollView>
        <Title>{t("account.title")}</Title>
        <Card>
          <Body>Role: {String(authState.session?.role || "")}</Body>
          <Body muted>
            Workspace: {String(authState.session?.workspace?.workspace_id || "")}
          </Body>
        </Card>
        <Button label="Security / 2FA" variant="secondary" onPress={() => router.push("/(app)/security")} />
      </ScrollView>
    </Screen>
  );
}

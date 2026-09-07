import { ScrollView } from "react-native";
import { Body, Card, Screen, Title } from "../../src/components/ui";
import { useApp } from "../../src/lib/AppProvider";

export default function SecurityScreen() {
  const { auth, t } = useApp();
  return (
    <Screen>
      <ScrollView>
        <Title>Security</Title>
        <Card>
          <Body muted>{auth.getOAuthGapNote()}</Body>
          <Body muted>{t("auth.oauthUnavailable")}</Body>
        </Card>
      </ScrollView>
    </Screen>
  );
}

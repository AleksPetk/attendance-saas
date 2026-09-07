import { Linking, ScrollView } from "react-native";
import { loadMobileConfig } from "../../src/lib/config";
import { Body, Button, Card, Screen, Title } from "../../src/components/ui";
import { useApp } from "../../src/lib/AppProvider";
import { space } from "../../src/theme/tokens";
import { View } from "react-native";

export default function HelpScreen() {
  const { t } = useApp();
  const config = loadMobileConfig();
  return (
    <Screen>
      <ScrollView>
        <Title>{t("help.title")}</Title>
        <Card>
          <Body muted>Help uses the same Docs/Status origins as web clients.</Body>
        </Card>
        <Button label={t("help.openDocs")} onPress={() => void Linking.openURL(config.docsBaseUrl)} />
        <View style={{ height: space.md }} />
        <Button
          label={t("help.openStatus")}
          variant="secondary"
          onPress={() => void Linking.openURL(config.statusBaseUrl)}
        />
      </ScrollView>
    </Screen>
  );
}

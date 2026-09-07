import { View } from "react-native";
import { Linking, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { loadMobileConfig } from "../../../src/lib/config";
import { Body, Button, Card, ListRow, Screen, Title } from "../../../src/components/ui";
import { useApp } from "../../../src/lib/AppProvider";
import { space } from "../../../src/theme/tokens";

export default function MoreScreen() {
  const { auth, t, locale, setLocale } = useApp();
  const router = useRouter();
  const config = loadMobileConfig();

  return (
    <Screen>
      <ScrollView>
        <Title>{t("nav.more")}</Title>
        <Card>
          <ListRow title={t("nav.account")} onPress={() => router.push("/(app)/account")} />
          <ListRow title={t("nav.plan")} onPress={() => router.push("/(app)/plan")} />
          <ListRow title={t("nav.staff")} onPress={() => router.push("/(app)/staff")} />
          <ListRow title={t("nav.help")} onPress={() => router.push("/(app)/help")} />
        </Card>
        <Card>
          <Body muted>Language</Body>
          <ListRow
            title={locale === "en" ? "English ✓" : "English"}
            onPress={() => setLocale("en")}
          />
          <ListRow
            title={locale === "ja" ? "日本語 ✓" : "日本語"}
            onPress={() => setLocale("ja")}
          />
        </Card>
        <Button
          label={t("help.openDocs")}
          variant="secondary"
          onPress={() => void Linking.openURL(config.docsBaseUrl)}
        />
        <View style={{ height: space.md }} />
        <Button label={t("nav.logout")} variant="danger" onPress={() => void auth.logout()} />
      </ScrollView>
    </Screen>
  );
}

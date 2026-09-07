import { Linking, ScrollView, StyleSheet } from "react-native";
import { Button, Screen } from "../../src/components/ui";
import { PageHeader, SectionCard } from "../../src/components/mobile";
import { loadMobileConfig } from "../../src/lib/config";
import { useApp } from "../../src/lib/AppProvider";
import { space } from "../../src/theme/tokens";

export default function HelpScreen() {
  const { t } = useApp(); const config = loadMobileConfig();
  return <Screen style={styles.screen}><ScrollView contentContainerStyle={styles.content}><PageHeader title={t("help.title")} description={t("help.description")} /><SectionCard title={t("help.resources")} description={t("help.externalNotice")}><Button label={t("help.openDocs")} onPress={() => void Linking.openURL(config.docsBaseUrl)} /><Button label={t("help.openStatus")} variant="secondary" onPress={() => void Linking.openURL(config.statusBaseUrl)} /></SectionCard></ScrollView></Screen>;
}
const styles = StyleSheet.create({ screen: { padding: 0 }, content: { padding: space.lg, paddingBottom: space.xxxl, gap: space.lg } });

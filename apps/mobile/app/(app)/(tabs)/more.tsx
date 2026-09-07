import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  canManageOwnerAccount,
  canManageStaffAccounts,
  canViewBilling,
  isGroupScopedStaff,
} from "@checkstation/domain";
import { Button, Screen } from "../../../src/components/ui";
import { PageHeader, SectionCard } from "../../../src/components/mobile";
import { useApp } from "../../../src/lib/AppProvider";
import { colors, radii, space, type } from "../../../src/theme/tokens";

type MoreRoute = "/(app)/staff" | "/(app)/account" | "/(app)/security" | "/(app)/plan" | "/(app)/help";
type IconName = keyof typeof Ionicons.glyphMap;

export default function MoreScreen() {
  const { auth, authState, t, locale, setLocale } = useApp();
  const router = useRouter();
  const session = authState.session;
  const items: Array<{ title: string; detail: string; icon: IconName; route: MoreRoute }> = [];

  if (canManageStaffAccounts(session)) items.push({ title: t("nav.staff"), detail: t("more.staffNotice"), icon: "id-card-outline", route: "/(app)/staff" });
  if (canManageOwnerAccount(session)) {
    items.push({ title: t("nav.account"), detail: t("more.ownerNotice"), icon: "person-circle-outline", route: "/(app)/account" });
    items.push({ title: t("nav.security"), detail: t("more.securityNotice"), icon: "shield-checkmark-outline", route: "/(app)/security" });
  }
  if (canViewBilling(session)) items.push({ title: t("nav.plan"), detail: t("more.planNotice"), icon: "card-outline", route: "/(app)/plan" });
  items.push({ title: t("nav.help"), detail: t("more.helpNotice"), icon: "help-circle-outline", route: "/(app)/help" });

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader eyebrow={t("app.name")} title={t("nav.more")} description={isGroupScopedStaff(session) ? t("more.staffRoleDescription") : t("more.description")} />
        <SectionCard title={t("more.workspace")}>
          <View>{items.map((item, index) => <MenuRow {...item} key={item.route} onPress={() => router.push(item.route)} showBorder={index > 0} />)}</View>
        </SectionCard>
        <SectionCard title={t("more.language")}>
          <View style={styles.languages}>
            <LanguageButton active={locale === "en"} label="English" onPress={() => setLocale("en")} />
            <LanguageButton active={locale === "ja"} label="日本語" onPress={() => setLocale("ja")} />
          </View>
        </SectionCard>
        <Button label={t("nav.logout")} variant="secondary" onPress={() => void auth.logout()} />
      </ScrollView>
    </Screen>
  );
}

function MenuRow({ title, detail, icon, onPress, showBorder }: { title: string; detail: string; icon: IconName; onPress: () => void; showBorder: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, showBorder && styles.rowBorder, pressed && styles.pressed]}><View style={styles.rowIcon}><Ionicons color={colors.blue} name={icon} size={21} /></View><View style={styles.rowCopy}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowDetail}>{detail}</Text></View><Ionicons color={colors.textMuted} name="chevron-forward" size={19} /></Pressable>;
}

function LanguageButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={onPress} style={[styles.language, active && styles.languageActive]}><Text style={[styles.languageText, active && styles.languageTextActive]}>{label}</Text>{active ? <Ionicons color={colors.blue} name="checkmark-circle" size={20} /> : null}</Pressable>;
}

const styles = StyleSheet.create({
  screen: { padding: 0 }, content: { padding: space.lg, paddingBottom: space.xxxl, gap: space.lg },
  row: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md }, rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, pressed: { opacity: 0.65 },
  rowIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: colors.primarySoft }, rowCopy: { flex: 1 }, rowTitle: { ...type.bodyStrong, color: colors.text }, rowDetail: { ...type.caption, color: colors.textMuted },
  languages: { flexDirection: "row", gap: space.sm }, language: { flex: 1, minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, backgroundColor: colors.surface }, languageActive: { borderColor: colors.blue, backgroundColor: colors.primarySoft }, languageText: { ...type.label, color: colors.textSecondary }, languageTextActive: { color: colors.blue },
});

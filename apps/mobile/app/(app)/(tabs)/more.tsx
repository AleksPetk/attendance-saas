import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  canAccessStaffManagement,
  canManageOwnerAccount,
  canManageStaffAccounts,
  canViewBilling,
  isGroupScopedStaff,
  shouldShowLockedStaffNav,
} from "@checkstation/domain";
import {
  SUPPORTED_LOCALES,
  localeNativeLabel,
  type AppLocale,
} from "@checkstation/i18n";
import { Alert, Button, Screen } from "../../../src/components/ui";
import { PageHeader, SectionCard } from "../../../src/components/mobile";
import { SelectField } from "../../../src/features/history/HistoryPicker";
import { useApp } from "../../../src/lib/AppProvider";
import { topComfortGap } from "../../../src/components/safeArea";
import { colors, radii, space, type } from "../../../src/theme/tokens";

type MoreRoute = "/(app)/staff" | "/(app)/account" | "/(app)/security" | "/(app)/plan" | "/(app)/help";
type IconName = keyof typeof Ionicons.glyphMap;

export default function MoreScreen() {
  const { auth, authState, t, locale, setLocale, refreshWorkspace } = useApp();
  const router = useRouter();
  const session = authState.session;
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const roleCanManageStaff = canManageStaffAccounts(session);
  const items: Array<{ title: string; detail?: string; icon: IconName; route?: MoreRoute; badge?: string; disabled?: boolean }> = [];
  const languageOptions = useMemo(
    () => SUPPORTED_LOCALES.map((code) => ({ value: code, label: localeNativeLabel(code) })),
    [],
  );

  if (canAccessStaffManagement(session, roleCanManageStaff)) {
    items.push({ title: t("nav.staff"), detail: t("more.staffNotice"), icon: "id-card-outline", route: "/(app)/staff" });
  } else if (shouldShowLockedStaffNav(session, roleCanManageStaff)) {
    items.push({ title: t("nav.staff"), detail: t("nav.staffLockedHint"), icon: "lock-closed-outline", badge: t("common.locked"), disabled: true });
  }
  if (canManageOwnerAccount(session)) {
    items.push({ title: t("nav.account"), detail: t("more.ownerNotice"), icon: "person-circle-outline", route: "/(app)/account" });
    items.push({ title: t("nav.security"), detail: t("more.securityNotice"), icon: "shield-checkmark-outline", route: "/(app)/security" });
  }
  if (canViewBilling(session)) items.push({ title: t("nav.plan"), detail: t("more.planNotice"), icon: "card-outline", route: "/(app)/plan" });
  items.push({ title: t("nav.help"), detail: t("more.helpNotice"), icon: "help-circle-outline", route: "/(app)/help" });

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshError("");
    try { await refreshWorkspace(); }
    catch { setRefreshError(t("notifications.refreshFailed")); }
    finally { setRefreshing(false); }
  }

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader eyebrow={t("app.name")} title={t("nav.more")} description={isGroupScopedStaff(session) ? t("more.staffRoleDescription") : t("more.description")} />
        <SectionCard title={t("more.workspace")}>
          <View>
            {items.map((item, index) => <MenuRow {...item} key={item.route || item.title} onPress={item.route ? () => router.push(item.route!) : undefined} showBorder={index > 0} />)}
            <MenuRow disabled={refreshing} icon="refresh-outline" onPress={() => void refresh()} showBorder title={t("status.refresh")} />
          </View>
        </SectionCard>
        <Alert message={refreshError} />
        <SectionCard>
          <SelectField
            label={t("more.language")}
            options={languageOptions}
            placeholder={localeNativeLabel(locale)}
            t={t}
            value={locale}
            onChange={(next) => setLocale(next as AppLocale)}
          />
        </SectionCard>
        <Button label={t("nav.logout")} variant="secondary" onPress={() => void auth.logout()} />
      </ScrollView>
    </Screen>
  );
}

function MenuRow({ title, detail, icon, onPress, showBorder, badge, disabled = false }: { title: string; detail?: string; icon: IconName; onPress?: () => void; showBorder: boolean; badge?: string; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.row, showBorder && styles.rowBorder, disabled && styles.disabled, pressed && !disabled && styles.pressed]}><View style={styles.rowIcon}><Ionicons color={colors.blue} name={icon} size={21} /></View><View style={styles.rowCopy}><View style={styles.rowHeading}><Text style={styles.rowTitle}>{title}</Text>{badge ? <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View> : null}</View>{detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}</View>{!disabled ? <Ionicons color={colors.textMuted} name="chevron-forward" size={19} /> : null}</Pressable>;
}

const styles = StyleSheet.create({
  screen: { padding: 0 }, content: { padding: space.lg, paddingTop: topComfortGap, paddingBottom: space.xxxl, gap: space.lg },
  row: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md }, rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, pressed: { opacity: 0.65 },
  disabled: { opacity: 0.72 }, rowIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: colors.primarySoft }, rowCopy: { flex: 1 }, rowHeading: { flexDirection: "row", alignItems: "center", gap: space.sm }, rowTitle: { ...type.bodyStrong, color: colors.text }, rowDetail: { ...type.caption, color: colors.textMuted },
  badge: { borderRadius: radii.pill, backgroundColor: colors.surfaceMuted, paddingHorizontal: space.sm, paddingVertical: 2 }, badgeText: { ...type.captionStrong, color: colors.textSecondary },
});

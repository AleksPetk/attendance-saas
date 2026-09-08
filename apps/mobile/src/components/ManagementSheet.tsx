import type { ReactNode } from "react";
import { Alert as NativeAlert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "./ui";
import { PageHeader } from "./mobile";
import { useApp } from "../lib/AppProvider";
import { colors, space } from "../theme/tokens";

/** Native forms stay keyboard-aware and bounded on tablets; dismissal never drops edits silently. */
export function ManagementSheet({ title, children, onClose, dirty = false, busy = false }: {
  title: string; children: ReactNode; onClose: () => void; dirty?: boolean; busy?: boolean;
}) {
  const { t } = useApp();
  const close = () => {
    if (busy) return;
    if (!dirty) return onClose();
    NativeAlert.alert(t("manage.discardTitle"), t("manage.discardBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("manage.discard"), style: "destructive", onPress: onClose },
    ]);
  };
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}><PageHeader title={title} action={<Button label={t("common.cancel")} variant="secondary" disabled={busy} onPress={close} />} /></View>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={styles.content}>{children}</ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.bg }, flex: { flex: 1 }, header: { padding: space.lg, width: "100%", maxWidth: 720, alignSelf: "center" }, content: { padding: space.lg, paddingBottom: space.xxxl, gap: space.lg, width: "100%", maxWidth: 720, alignSelf: "center" } });

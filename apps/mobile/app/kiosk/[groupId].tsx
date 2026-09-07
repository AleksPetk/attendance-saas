import { useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { endpoints } from "@checkstation/api";
import { getValidActionsForState, type ActionType } from "@checkstation/domain";
import { Body, Button, Field, LoadingState, Screen } from "../../src/components/ui";
import { useApp } from "../../src/lib/AppProvider";
import { colors, space, touch, type } from "../../src/theme/tokens";

/**
 * Native kiosk foundation — purpose-built touch UI.
 * Attendance rules stay on the backend; local helpers only mirror allowed actions.
 */
export default function KioskScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { api, auth, t } = useApp();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const [loading, setLoading] = useState(true);
  const [kiosk, setKiosk] = useState<Record<string, unknown> | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [pin, setPin] = useState("");
  const [exitCode, setExitCode] = useState("");
  const [participant, setParticipant] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await api.post(endpoints.kiosk(groupId), {});
        const data = await api.get<Record<string, unknown>>(endpoints.kiosk(groupId));
        if (!cancelled) setKiosk(data);
      } catch (err) {
        if (!cancelled) setMessage(err instanceof Error ? err.message : t("common.error"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, groupId, t]);

  const groupFlags = useMemo(
    () => ({
      check_in_enabled: Boolean((kiosk as any)?.group?.check_in_enabled ?? true),
      check_out_enabled: Boolean((kiosk as any)?.group?.check_out_enabled ?? true),
      breaks_enabled: Boolean((kiosk as any)?.group?.breaks_enabled ?? false),
      max_breaks: Number((kiosk as any)?.group?.max_breaks ?? 0),
    }),
    [kiosk],
  );

  const state = {
    is_checked_in: Boolean((participant as any)?.attendance?.is_checked_in),
    is_on_break: Boolean((participant as any)?.attendance?.is_on_break),
    break_count: Number((participant as any)?.attendance?.break_count ?? 0),
  };
  const actions = participant ? getValidActionsForState(groupFlags, state) : [];

  async function identify() {
    setBusy(true);
    setMessage("");
    try {
      const data = await api.post<Record<string, unknown>>(endpoints.kioskIdentify(groupId), {
        identifier: identifier.trim(),
        pin: pin.trim() || undefined,
      });
      setParticipant(data);
    } catch (err) {
      setParticipant(null);
      setMessage(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function perform(action: ActionType) {
    setBusy(true);
    setMessage("");
    try {
      await api.post(endpoints.kioskPerform(groupId), {
        action_type: action,
        identifier: identifier.trim(),
        pin: pin.trim() || undefined,
      });
      setMessage(`${action} recorded`);
      await identify();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function exitKiosk() {
    setBusy(true);
    try {
      await api.post(endpoints.kioskExit(), {
        group_id: Number(groupId),
        exit_code: exitCode.trim(),
      });
      await auth.bootstrap();
      router.replace("/(app)/(tabs)/home");
    } catch (err) {
      Alert.alert(t("kiosk.exit"), err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Screen style={{ backgroundColor: colors.bg }}>
        <LoadingState label={t("common.loading")} />
      </Screen>
    );
  }

  return (
    <Screen style={{ backgroundColor: "#0B3D3A" }}>
      <ScrollView contentContainerStyle={{ paddingBottom: space.xxl, minHeight: height }}>
        <View style={{ gap: space.lg }}>
          <View>
            <Text style={{ ...type.title, color: "#fff" }}>
              {String((kiosk as any)?.group?.name || t("kiosk.title"))}
            </Text>
            <Text style={{ ...type.caption, color: "#cfe8e4", marginTop: space.xs }}>
              {landscape ? "Landscape kiosk" : "Portrait kiosk"} · Group {groupId}
            </Text>
          </View>

          <Field
            label={t("kiosk.identify")}
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
          />
          <Field label="PIN" value={pin} onChangeText={setPin} secureTextEntry />
          <Button label={t("kiosk.identify")} onPress={() => void identify()} disabled={busy} />

          {participant ? (
            <View style={{ gap: space.sm }}>
              <Text style={{ ...type.headline, color: "#fff" }}>
                {String(
                  (participant as any)?.name
                    || (participant as any)?.participant_name
                    || "Participant",
                )}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                {actions.map((action) => (
                  <View key={action} style={{ minWidth: touch.min * 3, flexGrow: 1 }}>
                    <Button label={action} onPress={() => void perform(action)} disabled={busy} />
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {message ? <Body muted>{message}</Body> : null}

          <View style={{ marginTop: space.xl, gap: space.sm }}>
            <Field
              label="Exit code"
              value={exitCode}
              onChangeText={setExitCode}
              secureTextEntry
            />
            <Button
              label={t("kiosk.exit")}
              variant="secondary"
              onPress={() => void exitKiosk()}
              disabled={busy}
            />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

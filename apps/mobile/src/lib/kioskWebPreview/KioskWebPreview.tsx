import { useEffect, useMemo, useRef } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { WebView } from "react-native-webview";
import type { KioskVisualDesign } from "../kioskVisualDesign";
import type { KioskViewportProfile } from "../kioskEditorLayout";
import {
  buildCardTemplatePickerHtml,
  buildInputTemplatePickerHtml,
  buildKioskPreviewHtml,
  templatePickerSelectionScript,
  type KioskFlowAction,
  type KioskPreviewFlowStage,
  type PreviewMedia,
  type PreviewPerson,
} from "./html";

export function KioskWebLivePreview({
  config,
  mode,
  media,
  people,
  helperText,
  showName = true,
  showCode = true,
  showEmail = false,
  continueLabel,
  participantCodeLabel,
  secondFieldLabel,
  secondFieldValue,
  inputFieldCount,
  interactivePeople = false,
  interactiveIdentify = false,
  formTitle,
  showPin = false,
  pinLabel,
  gridColumns = 2,
  viewportProfile = "tablet",
  safeInsets,
  flowStage = "browse",
  actionParticipant = null,
  actionChoices = [],
  actionBackLabel,
  actionBusy = false,
  confirmationMessage = "",
  onPersonSelect,
  onIdentifySubmit,
  onActionSelect,
  onActionBack,
  style,
  pointerEvents,
  testID = "kiosk-web-live-preview",
}: {
  config: KioskVisualDesign;
  mode: "card" | "input";
  media?: PreviewMedia;
  people?: PreviewPerson[];
  helperText?: string;
  showName?: boolean;
  showCode?: boolean;
  showEmail?: boolean;
  continueLabel?: string;
  participantCodeLabel?: string;
  secondFieldLabel?: string;
  secondFieldValue?: string;
  inputFieldCount?: number;
  interactivePeople?: boolean;
  interactiveIdentify?: boolean;
  formTitle?: string;
  showPin?: boolean;
  pinLabel?: string;
  gridColumns?: 2 | 4;
  viewportProfile?: KioskViewportProfile;
  safeInsets?: { top: number; right: number; bottom: number; left: number };
  flowStage?: KioskPreviewFlowStage;
  actionParticipant?: PreviewPerson | null;
  actionChoices?: KioskFlowAction[];
  actionBackLabel?: string;
  actionBusy?: boolean;
  confirmationMessage?: string;
  onPersonSelect?: (id: string) => void;
  onIdentifySubmit?: (payload: { identifier: string; second: string; pin: string }) => void;
  onActionSelect?: (action: string) => void;
  onActionBack?: () => void;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: "auto" | "none" | "box-none" | "box-only";
  testID?: string;
}) {
  const html = useMemo(
    () =>
      buildKioskPreviewHtml({
        config,
        mode,
        media,
        people,
        helperText,
        showName,
        showCode,
        showEmail,
        continueLabel,
        participantCodeLabel,
        secondFieldLabel,
        secondFieldValue,
        inputFieldCount,
        interactivePeople,
        interactiveIdentify,
        formTitle,
        showPin,
        pinLabel,
        gridColumns,
        viewportProfile,
        safeInsets,
        flowStage,
        actionParticipant,
        actionChoices,
        actionBackLabel,
        actionBusy,
        confirmationMessage,
      }),
    [
      config,
      mode,
      media,
      people,
      helperText,
      showName,
      showCode,
      showEmail,
      continueLabel,
      participantCodeLabel,
      secondFieldLabel,
      secondFieldValue,
      inputFieldCount,
      interactivePeople,
      interactiveIdentify,
      formTitle,
      showPin,
      pinLabel,
      gridColumns,
      viewportProfile,
      safeInsets?.top,
      safeInsets?.right,
      safeInsets?.bottom,
      safeInsets?.left,
      flowStage,
      actionParticipant,
      actionChoices,
      actionBackLabel,
      actionBusy,
      confirmationMessage,
    ],
  );

  return (
    <View pointerEvents={pointerEvents} style={[styles.fill, style]} testID={testID}>
      <WebView
        originWhitelist={["*"]}
        source={{ html }}
        style={styles.webview}
        automaticallyAdjustContentInsets={viewportProfile === "tablet"}
        contentInsetAdjustmentBehavior="never"
        // Document-level scroll stays off so Header/Footer stay pinned; .kr-main-content scrolls via CSS.
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        nestedScrollEnabled
        setSupportMultipleWindows={false}
        javaScriptEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        androidLayerType="hardware"
        keyboardDisplayRequiresUserAction={false}
        onMessage={(event) => {
          try {
            const payload = JSON.parse(event.nativeEvent.data) as {
              type?: string;
              id?: string;
              identifier?: string;
              second?: string;
              pin?: string;
              action?: string;
            };
            if (payload.type === "person" && payload.id && onPersonSelect) {
              onPersonSelect(payload.id);
              return;
            }
            if (payload.type === "identify" && onIdentifySubmit) {
              onIdentifySubmit({
                identifier: String(payload.identifier || ""),
                second: String(payload.second || ""),
                pin: String(payload.pin || ""),
              });
              return;
            }
            if (payload.type === "action" && payload.action && onActionSelect) {
              onActionSelect(String(payload.action));
              return;
            }
            if (payload.type === "back" && onActionBack) onActionBack();
          } catch {
            /* ignore */
          }
        }}
      />
    </View>
  );
}

function stableIdsKey(ids: readonly string[]) {
  return ids.join("\u0001");
}

function stableLabelsKey(labels: Record<string, { label?: string; description?: string }>) {
  return Object.keys(labels)
    .sort()
    .map((id) => `${id}:${labels[id]?.label || ""}:${labels[id]?.description || ""}`)
    .join("\u0001");
}

export function KioskWebTemplatePicker({
  kind,
  ids,
  selected,
  labels,
  onSelect,
  height = 360,
}: {
  kind: "cards" | "input";
  ids: readonly string[];
  selected: string;
  labels: Record<string, { label?: string; description?: string }>;
  onSelect: (id: string) => void;
  height?: number;
}) {
  const webRef = useRef<WebView>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const idsKey = stableIdsKey(ids);
  const labelsKey = stableLabelsKey(labels);

  // Rebuild document only when the catalog changes — never on selection (that resets scroll).
  const html = useMemo(
    () =>
      kind === "cards"
        ? buildCardTemplatePickerHtml({
            ids: [...ids],
            selected: selectedRef.current,
            labels,
          })
        : buildInputTemplatePickerHtml({
            ids: [...ids],
            selected: selectedRef.current,
            labels,
          }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ids/labels identity keyed via idsKey/labelsKey
    [kind, idsKey, labelsKey],
  );

  useEffect(() => {
    webRef.current?.injectJavaScript(templatePickerSelectionScript(selected));
  }, [selected, html]);

  return (
    <View style={{ height }} testID={`kiosk-web-template-picker-${kind}`}>
      <WebView
        ref={webRef}
        originWhitelist={["*"]}
        source={{ html }}
        style={styles.webview}
        scrollEnabled
        nestedScrollEnabled
        setSupportMultipleWindows={false}
        javaScriptEnabled
        onLoadEnd={() => {
          webRef.current?.injectJavaScript(templatePickerSelectionScript(selected));
        }}
        onMessage={(event) => {
          try {
            const payload = JSON.parse(event.nativeEvent.data) as { type?: string; id?: string };
            if (payload.type === "select" && payload.id) onSelect(payload.id);
          } catch {
            /* ignore */
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: "hidden", backgroundColor: "#0f172a" },
  webview: { flex: 1, backgroundColor: "transparent" },
});

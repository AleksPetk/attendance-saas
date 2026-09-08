import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { Image, View } from "react-native";
import { useState } from "react";
import { Alert, Button } from "./ui";
import { useApp } from "../lib/AppProvider";
import { space } from "../theme/tokens";

export type PhotoSelection = { uri: string; name: string; mimeType?: string };
export function appendPhoto(form: FormData, photo: PhotoSelection) {
  // expo/fetch accepts Expo File blobs and preserves session/CSRF through ApiClient.
  const file = new File(photo.uri);
  form.append("photo", file, photo.name);
}
export function PhotoField({ value, onChange }: { value: PhotoSelection | null; onChange: (value: PhotoSelection | null) => void }) {
  const { t } = useApp();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function pick() {
    setBusy(true); setError("");
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError(t("common.error"));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        onChange({
          uri: asset.uri,
          name: asset.fileName || asset.uri.split("/").pop() || "photo.jpg",
          mimeType: asset.mimeType || undefined,
        });
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("common.error")); }
    finally { setBusy(false); }
  }
  return <View style={{ gap: space.sm }}>
    <Alert message={error} />
    {value ? <Image source={{ uri: value.uri }} style={{ width: 100, height: 100, borderRadius: 14 }} /> : null}
    <Button label={t("members.choosePhoto")} variant="secondary" loading={busy} onPress={() => void pick()} />
    {value ? <Button label={t("common.cancel")} variant="secondary" onPress={() => onChange(null)} /> : null}
  </View>;
}

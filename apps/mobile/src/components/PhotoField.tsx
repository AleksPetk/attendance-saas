import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { useState } from "react";
import { ActionSheetIOS, Alert as NativeAlert, Image, Platform, View } from "react-native";
import { Alert, Button } from "./ui";
import { useApp } from "../lib/AppProvider";
import { space } from "../theme/tokens";
import {
  MEMBER_PHOTO_SOURCE_ORDER,
  photoSelectionFromDocumentAsset,
  photoSelectionFromPickerAsset,
  type PhotoSelection,
} from "./memberPhotoSelection";

export type { PhotoSelection };
export { photoSelectionFromDocumentAsset, photoSelectionFromPickerAsset } from "./memberPhotoSelection";

export function appendPhoto(form: FormData, photo: PhotoSelection) {
  // expo/fetch accepts Expo File blobs and preserves session/CSRF through ApiClient.
  const file = new File(photo.uri);
  form.append("photo", file, photo.name);
}

type ImagePickerAsset = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
};

export function PhotoField({
  value,
  onChange,
}: {
  value: PhotoSelection | null;
  onChange: (value: PhotoSelection | null) => void;
}) {
  const { t } = useApp();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function handleSelectedMemberPhoto(asset: ImagePickerAsset) {
    onChange(photoSelectionFromPickerAsset(asset));
  }

  async function takePhoto() {
    setBusy(true);
    setError("");
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError(t("common.error"));
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (result.canceled || !result.assets?.[0]) return;
      handleSelectedMemberPhoto(result.assets[0]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function chooseFromPhotos() {
    setBusy(true);
    setError("");
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError(t("common.error"));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (result.canceled || !result.assets?.[0]) return;
      handleSelectedMemberPhoto(result.assets[0]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function chooseFromFiles() {
    setBusy(true);
    setError("");
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp", "image/*"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const normalized = photoSelectionFromDocumentAsset(result.assets[0]);
      if ("error" in normalized) {
        setError(t("members.photoUnsupported"));
        return;
      }
      onChange(normalized);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  function openSourceMenu() {
    if (busy) return;
    setError("");
    const labels = {
      camera: t("members.takePhoto"),
      library: t("members.chooseFromPhotos"),
      files: t("members.chooseFromFiles"),
      cancel: t("common.cancel"),
    };
    const run = (source: (typeof MEMBER_PHOTO_SOURCE_ORDER)[number]) => {
      if (source === "camera") void takePhoto();
      else if (source === "library") void chooseFromPhotos();
      else void chooseFromFiles();
    };
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [labels.camera, labels.library, labels.files, labels.cancel],
          cancelButtonIndex: 3,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) run("camera");
          else if (buttonIndex === 1) run("library");
          else if (buttonIndex === 2) run("files");
        },
      );
      return;
    }
    NativeAlert.alert(t("members.choosePhoto"), undefined, [
      { text: labels.camera, onPress: () => run("camera") },
      { text: labels.library, onPress: () => run("library") },
      { text: labels.files, onPress: () => run("files") },
      { text: labels.cancel, style: "cancel" },
    ]);
  }

  return (
    <View style={{ gap: space.sm }}>
      <Alert message={error} />
      {value ? <Image source={{ uri: value.uri }} style={{ width: 100, height: 100, borderRadius: 14 }} /> : null}
      <Button label={t("members.choosePhoto")} variant="secondary" loading={busy} onPress={openSourceMenu} />
      {value ? <Button label={t("common.cancel")} variant="secondary" onPress={() => onChange(null)} /> : null}
    </View>
  );
}

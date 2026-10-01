/**
 * Shared member-photo selection helpers.
 * Camera / library / files all normalize into PhotoSelection for one upload path.
 */

export type PhotoSelection = { uri: string; name: string; mimeType?: string };

export type MemberPhotoSource = "camera" | "library" | "files";

export const MEMBER_PHOTO_SOURCE_ORDER: MemberPhotoSource[] = ["camera", "library", "files"];

export const MEMBER_PHOTO_SOURCE_LABEL_KEYS: Record<MemberPhotoSource, string> = {
  camera: "members.takePhoto",
  library: "members.chooseFromPhotos",
  files: "members.chooseFromFiles",
};

const SUPPORTED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
  "image/gif",
]);

const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "heic",
  "heif",
  "webp",
  "gif",
]);

export function extensionFromName(name: string): string {
  const base = String(name || "").split(/[\\/]/).pop() || "";
  const dot = base.lastIndexOf(".");
  if (dot < 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function isSupportedMemberPhotoMime(mimeType: string | null | undefined, fileName = ""): boolean {
  const mime = String(mimeType || "").trim().toLowerCase();
  if (mime && SUPPORTED_IMAGE_MIME.has(mime)) return true;
  if (mime.startsWith("image/")) return true;
  const ext = extensionFromName(fileName);
  return Boolean(ext && SUPPORTED_IMAGE_EXTENSIONS.has(ext));
}

export function photoSelectionFromPickerAsset(asset: {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
}): PhotoSelection {
  const uri = String(asset.uri || "");
  const name = String(asset.fileName || uri.split("/").pop() || "photo.jpg");
  return {
    uri,
    name,
    mimeType: asset.mimeType || undefined,
  };
}

export function photoSelectionFromDocumentAsset(asset: {
  uri: string;
  name?: string | null;
  mimeType?: string | null;
}): PhotoSelection | { error: "unsupported" } {
  const uri = String(asset.uri || "");
  const name = String(asset.name || uri.split("/").pop() || "photo.jpg");
  const mimeType = asset.mimeType || undefined;
  if (!uri || !isSupportedMemberPhotoMime(mimeType, name)) {
    return { error: "unsupported" };
  }
  return { uri, name, mimeType };
}

/** Menu options for tests / ActionSheet wiring (Cancel is last). */
export function memberPhotoSourceMenuKeys(): string[] {
  return [
    MEMBER_PHOTO_SOURCE_LABEL_KEYS.camera,
    MEMBER_PHOTO_SOURCE_LABEL_KEYS.library,
    MEMBER_PHOTO_SOURCE_LABEL_KEYS.files,
    "common.cancel",
  ];
}

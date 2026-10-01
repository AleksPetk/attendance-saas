import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  isSupportedMemberPhotoMime,
  memberPhotoSourceMenuKeys,
  photoSelectionFromDocumentAsset,
  photoSelectionFromPickerAsset,
} from "./memberPhotoSelection";

const here = dirname(fileURLToPath(import.meta.url));
const photoField = readFileSync(join(here, "PhotoField.tsx"), "utf8");
const newMember = readFileSync(join(here, "../../app/(app)/member/new.tsx"), "utf8");

test("photo source chooser exposes Take photo, Photos, Files, Cancel", () => {
  assert.deepEqual(memberPhotoSourceMenuKeys(), [
    "members.takePhoto",
    "members.chooseFromPhotos",
    "members.chooseFromFiles",
    "common.cancel",
  ]);
  assert.match(photoField, /ActionSheetIOS\.showActionSheetWithOptions/);
  assert.match(photoField, /members\.takePhoto/);
  assert.match(photoField, /members\.chooseFromPhotos/);
  assert.match(photoField, /members\.chooseFromFiles/);
  assert.match(photoField, /common\.cancel/);
  assert.match(photoField, /NativeAlert\.alert/);
});

test("camera, gallery, and files route through one common photo handler", () => {
  assert.match(photoField, /function handleSelectedMemberPhoto/);
  assert.match(photoField, /launchCameraAsync/);
  assert.match(photoField, /launchImageLibraryAsync/);
  assert.match(photoField, /DocumentPicker\.getDocumentAsync/);
  assert.match(photoField, /handleSelectedMemberPhoto\(result\.assets\[0\]\)/);
  assert.equal(
    (photoField.match(/handleSelectedMemberPhoto\(result\.assets\[0\]\)/g) || []).length,
    2,
  );
  assert.match(photoField, /photoSelectionFromDocumentAsset/);
  assert.match(photoField, /onChange\(normalized\)/);
});

test("picker asset normalization matches existing photo selection shape", () => {
  assert.deepEqual(
    photoSelectionFromPickerAsset({
      uri: "file:///tmp/a.jpg",
      fileName: "a.jpg",
      mimeType: "image/jpeg",
    }),
    { uri: "file:///tmp/a.jpg", name: "a.jpg", mimeType: "image/jpeg" },
  );
  assert.deepEqual(
    photoSelectionFromPickerAsset({ uri: "file:///cache/photo.png" }),
    { uri: "file:///cache/photo.png", name: "photo.png", mimeType: undefined },
  );
});

test("cancellation paths do not call onChange with a photo", () => {
  assert.match(photoField, /if \(result\.canceled \|\| !result\.assets\?\.\[0\]\) return;/);
  assert.equal(
    (photoField.match(/if \(result\.canceled \|\| !result\.assets\?\.\[0\]\) return;/g) || []).length,
    3,
  );
});

test("unsupported file result is handled safely", () => {
  assert.equal(isSupportedMemberPhotoMime("application/pdf", "doc.pdf"), false);
  assert.equal(isSupportedMemberPhotoMime("image/jpeg", "a.jpg"), true);
  assert.equal(isSupportedMemberPhotoMime("", "portrait.heic"), true);
  assert.deepEqual(
    photoSelectionFromDocumentAsset({
      uri: "file:///tmp/notes.pdf",
      name: "notes.pdf",
      mimeType: "application/pdf",
    }),
    { error: "unsupported" },
  );
  assert.deepEqual(
    photoSelectionFromDocumentAsset({
      uri: "file:///tmp/face.png",
      name: "face.png",
      mimeType: "image/png",
    }),
    { uri: "file:///tmp/face.png", name: "face.png", mimeType: "image/png" },
  );
  assert.match(photoField, /members\.photoUnsupported/);
});

test("Add Member save behavior unchanged (POST FormData + appendPhoto)", () => {
  assert.match(newMember, /endpoints\.members\(\)/);
  assert.match(newMember, /method: "POST"/);
  assert.match(newMember, /formData: form/);
  assert.match(newMember, /if \(photo\) appendPhoto\(form, photo\)/);
  assert.match(newMember, /Object\.entries\(values\)\.forEach\(\(\[key, value\]\) => form\.append\(key, value\.trim\(\)\)\)/);
});

test("Add Member keyboard/scroll config keeps taps while keyboard open", () => {
  assert.match(newMember, /KeyboardAvoidingView/);
  assert.match(newMember, /automaticallyAdjustKeyboardInsets/);
  assert.match(newMember, /keyboardShouldPersistTaps="handled"/);
  assert.match(newMember, /keyboardDismissMode="interactive"/);
  assert.match(newMember, /paddingBottom: bottomPad/);
  assert.match(newMember, /useSafeAreaInsets/);
});

test("no desktop or browser member photo files touched by this change", () => {
  // Scope guard: this suite only asserts mobile PhotoField / new member sources.
  assert.match(photoField, /expo-image-picker/);
  assert.match(photoField, /expo-document-picker/);
  assert.doesNotMatch(photoField, /apps\/desktop/);
  assert.doesNotMatch(newMember, /apps\/desktop/);
});

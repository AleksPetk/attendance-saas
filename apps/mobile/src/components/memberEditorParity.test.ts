import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const memberEditor = readFileSync(join(here, "MemberEditor.tsx"), "utf8");
const managementSheet = readFileSync(join(here, "ManagementSheet.tsx"), "utf8");
const photoField = readFileSync(join(here, "PhotoField.tsx"), "utf8");
const memberDetail = readFileSync(join(here, "../../app/(app)/member/[id].tsx"), "utf8");

test("Edit Member route hosts MemberEditor sheet", () => {
  assert.match(memberDetail, /MemberEditor/);
  assert.match(memberDetail, /editing && member \? <MemberEditor/);
  assert.match(memberEditor, /ManagementSheet title=\{t\("members\.edit"\)\}/);
});

test("Edit Member uses shared PhotoField source picker", () => {
  assert.match(memberEditor, /import \{ PhotoField, appendPhoto, type PhotoSelection \} from "\.\/PhotoField"/);
  assert.match(memberEditor, /<PhotoField value=\{photo\} onChange=\{setPhoto\} \/>/);
  assert.match(photoField, /ActionSheetIOS\.showActionSheetWithOptions/);
  assert.match(photoField, /members\.takePhoto/);
  assert.match(photoField, /members\.chooseFromPhotos/);
  assert.match(photoField, /members\.chooseFromFiles/);
  assert.match(photoField, /common\.cancel/);
  assert.match(photoField, /function handleSelectedMemberPhoto/);
});

test("Edit Member photo selection routes through existing upload flow", () => {
  assert.match(memberEditor, /if \(photo\) appendPhoto\(form, photo\)/);
  assert.match(memberEditor, /endpoints\.member\(member\.id\)/);
  assert.match(memberEditor, /method: "PATCH"/);
  assert.match(memberEditor, /formData: form/);
  assert.match(memberEditor, /if \(clearPhoto && !photo\) form\.append\("clear_photo", "true"\)/);
});

test("Edit Member keyboard-safe container matches Add Member pattern", () => {
  assert.match(managementSheet, /KeyboardAvoidingView/);
  assert.match(managementSheet, /automaticallyAdjustKeyboardInsets/);
  assert.match(managementSheet, /keyboardShouldPersistTaps="handled"/);
  assert.match(managementSheet, /keyboardDismissMode="interactive"/);
  assert.match(managementSheet, /paddingBottom: bottomPad/);
  assert.match(managementSheet, /useSafeAreaInsets/);
  assert.match(managementSheet, /space\.xxxl \+ Math\.max\(insets\.bottom, space\.md\) \+ 160/);
});

test("Save remains available while keyboard open (persist taps, no forced dismiss on save)", () => {
  assert.match(managementSheet, /keyboardShouldPersistTaps="handled"/);
  assert.match(memberEditor, /<Button label=\{t\("members\.save"\)\} loading=\{busy\} onPress=\{\(\) => void save\(\)\} \/>/);
  assert.doesNotMatch(memberEditor, /Keyboard\.dismiss\(\)/);
});

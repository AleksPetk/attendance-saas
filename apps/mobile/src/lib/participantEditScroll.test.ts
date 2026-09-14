import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../../app/(app)/group/[id].tsx", import.meta.url), "utf8");

test("participant editing scrolls after layout and resets when selecting another participant", () => {
  assert.match(source, /section\.measureLayout\(contentRef\.current/);
  assert.match(source, /y: Math\.max\(0, y - space\.lg\), animated: true/);
  assert.match(source, /key=\{`\$\{editingParticipant\._kind\}-\$\{editingParticipant\.id\}`\}/);
  assert.match(source, /if \(scrollToEditPending\.current\)/);
  const editForm = source.slice(source.indexOf("function EditParticipantSheet("), source.indexOf("const DEFAULT_NOTIFICATIONS"));
  assert.equal(editForm.includes("autoFocus"), false);
  assert.match(editForm, /method: "PATCH", formData/);
});

test("Participants uses native keyboard insets and edit close returns to the list", () => {
  assert.match(source, /automaticallyAdjustKeyboardInsets=\{activeSection === "people" \|\| activeSection === "configuration"\}/);
  assert.match(source, /keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"/);
  assert.match(source, /function closeEdit\(\) \{\s*Keyboard\.dismiss\(\);\s*setEditingParticipant\(null\)/);
  assert.match(source, /onSaved=\{\(\) => \{ closeEdit\(\); void loadParticipants\(\); \}\}/);
  assert.match(source, /scrollToSection\(listRef\.current\)/);
});

test("Add participant uses the same measured scroll and keyboard-aware parent in both modes", () => {
  assert.match(source, /if \(scrollToAddPending\.current\)/);
  assert.match(source, /scrollToSection\(addRef\.current\)/);
  const addForm = source.slice(source.indexOf("function AddParticipantSheet("), source.indexOf("function ParticipationEmailsField("));
  assert.equal(addForm.includes("autoFocus"), false);
  assert.match(addForm, /endpoints\.groupMemberships\(groupId\), memberParticipationPayload/);
  assert.match(addForm, /endpoints\.groupParticipants\(groupId\)/);
});

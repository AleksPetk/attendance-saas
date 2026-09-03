/**
 * Run: node --test src/groupParticipantAddFlow.test.js
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const participantsSource = readFileSync(
  new URL("./GroupParticipantsSection.jsx", import.meta.url),
  "utf8",
);
const groupDetailSource = readFileSync(new URL("./GroupDetailScreen.jsx", import.meta.url), "utf8");

test("participant additions use an inline Group-summary refresh instead of the full page loader", () => {
  assert.match(
    groupDetailSource,
    /async function refreshGroupAfterParticipantChange\(\)[\s\S]*api\.getGroup\(session, groupId\)[\s\S]*setGroup\(groupResult\.data\)/,
  );
  assert.match(groupDetailSource, /onChanged=\{refreshGroupAfterParticipantChange\}/);
  assert.doesNotMatch(groupDetailSource, /onChanged=\{load\}/);
  assert.doesNotMatch(participantsSource, /location\.reload|window\.location|scrollTo\(/);
});

test("Member and Visitor additions have independent pending and duplicate-submit guards", () => {
  assert.match(participantsSource, /const \[addingMember, setAddingMember\] = useState\(false\)/);
  assert.match(participantsSource, /const \[addingVisitor, setAddingVisitor\] = useState\(false\)/);
  assert.match(participantsSource, /if \(!selectedMember \|\| addingMemberRef\.current\)/);
  assert.match(participantsSource, /if \(addingVisitorRef\.current\)/);
  assert.match(participantsSource, /disabled=\{addingMember \|\| !selectedMemberId\}/);
  assert.match(participantsSource, /disabled=\{addingVisitor\}/);
  assert.match(participantsSource, /t\("participants\.adding"\)/);
});

test("successful additions reset their own form only after the mutation and refresh canonical data", () => {
  assert.match(
    participantsSource,
    /await api\.createMembership[\s\S]*setSelectedMemberId\(""\)[\s\S]*setParticipation\(EMPTY_PARTICIPATION\)[\s\S]*await refresh\(\)[\s\S]*showAddSuccess\("member"\)/,
  );
  assert.match(
    participantsSource,
    /await api\.createParticipant[\s\S]*setParticipant\(\{ name: "", emails: \[""\], pin: "" \}\)[\s\S]*await refresh\(\)[\s\S]*showAddSuccess\("visitor"\)/,
  );
  assert.match(
    participantsSource,
    /async function refresh\(\)[\s\S]*await load\(\)[\s\S]*await onChanged\(\)/,
  );
});

test("one accessible success message uses a restartable, unmount-safe 1.8 second timer", () => {
  assert.match(participantsSource, /const \[addSuccessKind, setAddSuccessKind\] = useState\(null\)/);
  assert.match(participantsSource, /window\.clearTimeout\(addSuccessTimerRef\.current\)/);
  assert.match(participantsSource, /window\.setTimeout\([\s\S]*1800\)/);
  assert.match(participantsSource, /role="status"/);
  assert.match(participantsSource, /aria-live="polite"/);
});

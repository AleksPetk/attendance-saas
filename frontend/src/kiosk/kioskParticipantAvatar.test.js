import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PHOTO_CAPABLE_CARD_TEMPLATE_IDS,
  kioskAvatarToneStep,
  kioskPersonInitials,
} from "./kioskPersonInitials.js";

const root = dirname(fileURLToPath(import.meta.url));
const avatarSrc = readFileSync(join(root, "kioskParticipantAvatar.jsx"), "utf8");
const kioskUiSrc = readFileSync(join(root, "kioskUi.jsx"), "utf8");
const groupKioskSrc = readFileSync(join(root, "../GroupKioskScreen.jsx"), "utf8");
const cardCss =
  readFileSync(join(root, "cardTemplates.css"), "utf8") +
  readFileSync(join(root, "templateFamiliesCard.css"), "utf8");

test("A: member with photo renders img when photoUrl provided", () => {
  assert.match(avatarSrc, /showPhoto[\s\S]*?<img src=\{photoUrl\}/);
  assert.match(cardCss, /object-fit:\s*cover/);
});

test("B: member without photo renders initials fallback", () => {
  assert.equal(kioskPersonInitials("Nami"), "N");
  assert.match(avatarSrc, /kiosk-person-avatar--fallback/);
  assert.match(avatarSrc, /kiosk-person-initials/);
});

test("C: visitor uses initials when photoUrl is absent", () => {
  assert.match(avatarSrc, /!isClass && Boolean\(photoUrl\)/);
  assert.match(groupKioskSrc, /photoUrl=\{p\.photo_url\}/);
});

test("D: failed photo load falls back via onError", () => {
  assert.match(avatarSrc, /useState\(false\)/);
  assert.match(avatarSrc, /onError=\{\(\) => setImageFailed\(true\)\}/);
  assert.match(avatarSrc, /!imageFailed/);
});

test("E: initials generation matches product rules", () => {
  assert.equal(kioskPersonInitials("Nami"), "N");
  assert.equal(kioskPersonInitials("Alex Chen"), "AC");
  assert.equal(kioskPersonInitials("Margaret Hamilton"), "MH");
  assert.equal(kioskPersonInitials("  "), "?");
});

test("F: photo-capable templates expose avatar slot in CSS", () => {
  for (const id of PHOTO_CAPABLE_CARD_TEMPLATE_IDS) {
    const pattern = new RegExp(
      `\\[data-card-template="${id}"\\][\\s\\S]*?\\.kiosk-person-avatar[\\s\\S]*?display:\\s*grid`,
    );
    assert.match(cardCss, pattern, `${id} must show avatar grid`);
  }
});

test("G: structured class card uses class variant", () => {
  assert.match(groupKioskSrc, /variant="class"/);
  assert.match(avatarSrc, /kiosk-class-avatar/);
  assert.match(cardCss, /\.kiosk-class-avatar/);
});

test("H: structured member with photo passes photoUrl", () => {
  assert.match(groupKioskSrc, /photoUrl=\{p\.photo_url\}/);
});

test("I: class initials use same helper as participants", () => {
  assert.equal(kioskPersonInitials("English A"), "EA");
  assert.match(avatarSrc, /kioskPersonInitials\(name\)/);
});

test("J: avatar tone is deterministic per name", () => {
  const first = kioskAvatarToneStep("Jordan Lee");
  const second = kioskAvatarToneStep("Jordan Lee");
  const third = kioskAvatarToneStep("Sam Rivera");
  assert.equal(first, second);
  assert.ok(first >= 0 && first <= 4);
  assert.ok(third >= 0 && third <= 4);
});

test("K: kioskUi re-exports shared avatar component", () => {
  assert.match(kioskUiSrc, /from "\.\/kioskParticipantAvatar\.jsx"/);
  assert.match(kioskUiSrc, /KioskPersonAvatar/);
  assert.doesNotMatch(kioskUiSrc, /function KioskPersonAvatar/);
});

test("L: fallback uses template accent tone steps in CSS", () => {
  assert.match(cardCss, /--avatar-tone-step/);
  assert.match(cardCss, /kiosk-person-avatar--fallback/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createTranslator } from "@checkstation/i18n";
import { kioskCardHelperKey } from "./kioskCardHelper";

const rendererSource = readFileSync(fileURLToPath(new URL("../components/DesktopKioskRenderer.tsx", import.meta.url)), "utf8");
const editorSource = readFileSync(fileURLToPath(new URL("../pages/KioskDesignPage.tsx", import.meta.url)), "utf8");

test("standard Card guidance matches Workspace and localizes to Japanese", () => {
  const key = kioskCardHelperKey({ mode: "card", structured: false, step: "start", participantCount: 3 });
  assert.equal(key, "kiosk.live.participants.tapCard");
  assert.equal(createTranslator("en")(key), "Tap your card to continue.");
  assert.equal(createTranslator("ja")(key), "カードをタップして続行してください。");
  assert.equal(kioskCardHelperKey({ mode: "card", structured: false, step: "start", participantCount: 0 }), "");
});

test("Structured guidance follows the same Workspace flow steps", () => {
  assert.equal(kioskCardHelperKey({ mode: "card", structured: true, step: "classes", participantCount: 0 }), "kiosk.live.classes.choose");
  assert.equal(kioskCardHelperKey({ mode: "card", structured: true, step: "class_pin", participantCount: 0 }), "kiosk.live.classPinHint");
  assert.equal(kioskCardHelperKey({ mode: "card", structured: true, step: "start", participantCount: 2 }), "kiosk.live.participants.chooseStructured");
  assert.equal(kioskCardHelperKey({ mode: "card", structured: true, step: "confirm", participantCount: 2 }), "kiosk.live.chooseAction");
});

test("Input mode never shows the card helper", () => {
  assert.equal(kioskCardHelperKey({ mode: "input", structured: false, step: "start", participantCount: 3 }), "");
  assert.equal(kioskCardHelperKey({ mode: "input", structured: true, step: "classes", participantCount: 3 }), "");
});

test("helper stays automatic renderer UI and is not editable builder configuration", () => {
  assert.match(rendererSource, /className="kr-card-helper" role="note"/);
  assert.match(rendererSource, /data-card-helper=\{cardHelper \? "on" : "off"\}/);
  assert.match(editorSource, /kioskCardHelperKey/);
  assert.doesNotMatch(editorSource, /helperText.*onChange/);
});

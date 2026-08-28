import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateHexDraft,
  HEX_COLOR_ERROR,
  replaceHexDraftSelection,
} from "./builderUtils.js";

test("hex drafts preserve exactly what the user is editing", () => {
  for (const draft of ["", "#", "225", "#2255", "#225566", "225566"]) {
    assert.equal(evaluateHexDraft(draft).draft, draft);
  }
});

test("a custom hex color is available only when the complete draft is valid", () => {
  assert.deepEqual(evaluateHexDraft("#2255"), {
    draft: "#2255",
    color: null,
    error: HEX_COLOR_ERROR,
  });
  assert.deepEqual(evaluateHexDraft("#225566"), {
    draft: "#225566",
    color: "#225566",
    error: "",
  });
  assert.deepEqual(evaluateHexDraft("abc"), {
    draft: "abc",
    color: "#AABBCC",
    error: "",
  });
});

test("invalid pasted text is never replaced with a fallback color", () => {
  assert.deepEqual(evaluateHexDraft("#22ZZ66"), {
    draft: "#22ZZ66",
    color: null,
    error: HEX_COLOR_ERROR,
  });
});

test("pasting a complete hex replaces the selected field value exactly once", () => {
  assert.deepEqual(replaceHexDraftSelection("#AABBCC", "#225566", 0, 7), {
    draft: "#225566",
    caret: 7,
  });
});

test("paste replaces only the selected text and trims outer clipboard whitespace", () => {
  assert.deepEqual(replaceHexDraftSelection("#AA11CC", "  2255  ", 1, 5), {
    draft: "#2255CC",
    caret: 5,
  });
});

test("paste is not truncated when there is no active selection", () => {
  assert.deepEqual(replaceHexDraftSelection("#", "#225566", 1, 1), {
    draft: "##225566",
    caret: 8,
  });
});

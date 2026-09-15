import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRefreshCoordinator, installForegroundRefresh } from "./foregroundRefresh";

test("overlapping foreground requests share one refresh and unsubscribe removes listeners", async () => {
  const coordinator = createRefreshCoordinator();
  let release!: () => void;
  let calls = 0;
  const unsubscribe = coordinator.subscribe(async () => { calls++; await new Promise<void>((resolve) => { release = resolve; }); });
  const first = coordinator.refresh();
  assert.equal(coordinator.refresh(), first);
  await Promise.resolve();
  assert.equal(calls, 1);
  release(); await first;
  unsubscribe(); await coordinator.refresh();
  assert.equal(calls, 1);
});

test("focus plus visibility coalesce, hidden windows do not refresh, cleanup removes both listeners", () => {
  const windowTarget = new EventTarget();
  const documentTarget = Object.assign(new EventTarget(), { visibilityState: "visible" });
  let calls = 0;
  const remove = installForegroundRefresh(windowTarget, documentTarget, async () => { calls++; });
  windowTarget.dispatchEvent(new Event("focus"));
  documentTarget.dispatchEvent(new Event("visibilitychange"));
  windowTarget.dispatchEvent(new Event("focus"));
  assert.equal(calls, 1);
  remove(); windowTarget.dispatchEvent(new Event("focus"));
  assert.equal(calls, 1);
  documentTarget.visibilityState = "hidden";
  const removeAgain = installForegroundRefresh(windowTarget, documentTarget, async () => { calls++; });
  windowTarget.dispatchEvent(new Event("focus"));
  assert.equal(calls, 1); removeAgain();
});

test("refresh isolates failures without routing, reloads or draft resets", async () => {
  const coordinator = createRefreshCoordinator();
  const draft = { route: "/groups/129/kiosk-design", section: "cards", text: "unsaved", scroll: 300 };
  const original = { ...draft };
  let revalidated = false;
  coordinator.subscribe(async () => { throw Error("offline"); });
  coordinator.subscribe(async () => { revalidated = true; });
  await coordinator.refresh();
  assert.equal(revalidated, true); assert.deepEqual(draft, original);
  const shell = readFileSync(new URL("../shell/DesktopShell.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(shell, /location.reload|navigate\([^)]*refresh/);
  const editor = readFileSync(new URL("../pages/KioskDesignPage.tsx", import.meta.url), "utf8");
  const refresh = editor.slice(editor.indexOf("useForegroundRefresh(async"), editor.indexOf("const commit ="));
  assert.match(refresh, /api.get<DesignResponse>/);
  assert.match(refresh, /before.dirty.*draftState.current.dirty/);
  assert.doesNotMatch(refresh, /setSection|setLoading|setPanelPosition|setMinimized/);
});

test("desktop editor uses Workspace card values, patching and visual miniature contracts", () => {
  const editor = readFileSync(new URL("../pages/KioskDesignPage.tsx", import.meta.url), "utf8");
  const header = editor.slice(editor.indexOf("function HeaderEditor"), editor.indexOf("function MainEditor"));
  const footer = editor.slice(editor.indexOf("function FooterEditor"), editor.indexOf("function PresentationEditor"));
  assert.doesNotMatch(header + footer, /kiosk.enabled|\.enabled/);
  assert.match(editor, /CARD_TEMPLATE_IDS, patchMainWithCardTemplate.*cardTemplates.js/);
  assert.match(editor, /next.config.main = patchMainWithCardTemplate\(next.config.main, itemId\)/);
  assert.match(editor, /<CardTemplateMini id=\{itemId\}/);
  assert.match(editor, /<InputTemplateMini id=\{itemId\}/);
  assert.match(editor, /function InputTemplateMini/);
  assert.match(editor, /kb-template-mini kb-template-mini--\$\{id\}/);
  assert.doesNotMatch(editor, /kind === "cards" \? <CardTemplateMini id=\{itemId\} \/> : <i \/>/);
  assert.match(editor, /aria-pressed=\{itemId === value\}/);
  const miniStyles = readFileSync(new URL("../components/cardTemplatePreviews.css", import.meta.url), "utf8");
  assert.match(miniStyles, /mini--comic/); assert.match(miniStyles, /mini--photo/);
  const inputMiniStyles = readFileSync(new URL("../components/inputTemplatePreviews.css", import.meta.url), "utf8");
  for (const id of ["soft", "bold", "minimal", "outline", "dark", "glass", "rounded", "compact", "large_touch"]) {
    assert.match(inputMiniStyles, new RegExp(`kb-template-mini--${id}`));
  }
  assert.match(inputMiniStyles, /\.kb-template-mini \{/);
  assert.match(inputMiniStyles, /kb-template-mini-field/);
  assert.match(inputMiniStyles, /kb-template-mini-btn/);
});

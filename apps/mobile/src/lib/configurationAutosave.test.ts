import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createConfigurationSaveQueue, type ConfigurationDraft } from "./configurationSaveQueue";

test("Back flush saves the latest draft and concurrent flushes share one request", async () => {
  let release!: () => void;
  let active = 0;
  let maximum = 0;
  const saved: string[] = [];
  let draft: ConfigurationDraft;
  const makeDraft = (snapshot: string): ConfigurationDraft => ({ snapshot, dirty: true, save: async () => {
    active++; maximum = Math.max(active, maximum);
    saved.push(snapshot);
    if (snapshot === "first") await new Promise<void>((resolve) => { release = resolve; });
    active--;
    return true;
  } });
  draft = { snapshot: "original", dirty: false, save: async () => true };
  const queue = createConfigurationSaveQueue(() => draft, () => {});
  draft = makeDraft("first");
  const first = queue.flush();
  draft = makeDraft("latest");
  const back = queue.flush();
  assert.equal(first, back);
  release();
  assert.equal(await back, true);
  assert.deepEqual(saved, ["first", "latest"]);
  assert.equal(maximum, 1);
});

test("failed saves retain the draft, report failure, and can retry on blur", async () => {
  let ok = false;
  const states: string[] = [];
  const draft = { snapshot: "unchanged user input", dirty: true, save: async () => ok };
  const queue = createConfigurationSaveQueue(() => draft, (status) => states.push(status));
  assert.equal(await queue.flush(), false);
  assert.equal(states.at(-1), "error");
  assert.equal(queue.isSynced(draft.snapshot), false);
  ok = true;
  assert.equal(await queue.flush(), true);
  assert.equal(states.at(-1), "saved");
  assert.equal(queue.isSynced(draft.snapshot), true);
});

test("normal configuration autosaves, but sender saves only through its explicit action", () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
  const hook = read("./useConfigurationAutosave.ts");
  const group = read("../../app/(app)/group/[id].tsx");
  const sender = read("../components/GroupEmailSender.tsx");
  const configuration = group.slice(group.indexOf("function ConfigurationSection("), group.indexOf("function NotificationSetting("));
  assert.match(hook, /immediate \? 0 : 650/);
  assert.match(hook, /clearTimeout\(timer\.current\)/);
  assert.match(group, /flushConfiguration\(\)\.then\(\(saved\)/);
  assert.match(group, /if \(await flushConfiguration\(\)\)/);
  assert.equal(group.includes("configurationUnsaved"), false);
  assert.equal(configuration.includes('t("groups.saveChanges")'), false);
  assert.equal(sender.includes('t("groups.saveSender")'), true);
  assert.equal(sender.includes("useConfigurationAutosave"), false);
  assert.equal(sender.includes("onBlur="), false);
  assert.equal(configuration.includes("senderFlush"), false);
  assert.match(configuration, /onFlushReady\(autosave.flush\)/);
  assert.match(sender, /providerDrafts.current\[form.provider\] = \{ ...form \}/);
  assert.match(sender, /providerDrafts.current\[provider\] \?\? blankSenderForm\(provider\)/);
  assert.match(sender, /senderDraftRequiresTest\(form, sender\)/);
  assert.match(sender, /dirty = JSON\.stringify\(form\) !== formBaseline/);
  assert.match(sender, /setFormBaseline\(JSON\.stringify\(loadedForm\)\)/);
  assert.match(sender, /draftVerified \|\| \(nameOnly && sender\.status === "ready"\)/);
  assert.match(sender, /t\("groups.sendTest"\)/);
  assert.match(configuration, /onBlur=\{\(\) => void autosave\.flush\(\)\}/);
});

test("Group Back uses Expo Router's native-stack removal context and replays one original action", () => {
  const group = readFileSync(new URL("../../app/(app)/group/[id].tsx", import.meta.url), "utf8");
  assert.match(group, /import \{ usePreventRemove \} from "expo-router\/react-navigation"/);
  assert.match(group, /usePreventRemove\(activeSection === "configuration", \(\{ data \}\)/);
  assert.equal(group.includes('addListener("beforeRemove"'), false);
  assert.equal(group.includes("allowNavigation"), false);
  assert.match(group, /if \(leavingConfiguration.current\) return/);
  assert.match(group, /if \(saved\) \{ Keyboard.dismiss\(\); navigation.dispatch\(data.action\); \}/);
  assert.equal((group.match(/navigation.dispatch\(/g) ?? []).length, 1);
});

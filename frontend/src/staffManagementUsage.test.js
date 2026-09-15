import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./StaffManagementScreen.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./index.css", import.meta.url), "utf8");

test("Staff management usage uses canonical entitlement totals and limits", () => {
  assert.match(source, /usageTotalValue\(session, "workspace_admins"\)/);
  assert.match(source, /planLimitValue\(session, "workspace_admins"\)/);
  assert.match(source, /usageTotalValue\(session, "workspace_staff"\)/);
  assert.match(source, /planLimitValue\(session, "workspace_staff"\)/);
  assert.match(source, /memberUsageMetrics/);
});

test("Staff management reuses the responsive Groups usage pattern", () => {
  assert.match(source, /className="groups-usage staff-usage"/);
  assert.match(source, /groups-usage-item/);
  assert.match(source, /groups-usage-progress/);
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*\.groups-usage,[\s\S]*grid-template-columns: 1fr/);
});

test("Staff page content no longer renders a duplicate title or subtitle", () => {
  assert.match(source, /page staff-management-page/);
  assert.doesNotMatch(source, /PageHeader/);
  assert.doesNotMatch(source, /staff:management\.descriptionOwner/);
  assert.doesNotMatch(source, /staff:management\.descriptionAdmin/);
});

test("old raw usage caption is no longer rendered", () => {
  assert.doesNotMatch(source, /plan-usage-hint/);
  assert.doesNotMatch(source, /usageLimitCaption/);
});

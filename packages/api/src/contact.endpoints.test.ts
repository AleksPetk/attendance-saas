import assert from "node:assert/strict";
import test from "node:test";
import { endpoints } from "./endpoints.js";

test("contact endpoints match browser Workspace Contact paths", () => {
  assert.equal(endpoints.contactCategories(), "/contact/categories/");
  assert.equal(endpoints.contactWorkspace(), "/contact/workspace/");
  assert.equal(
    endpoints.contactSuggestions("kiosk", "cannot_launch", "en"),
    "/contact/suggestions/?category=kiosk&subcategory=cannot_launch&lang=en",
  );
  assert.equal(
    endpoints.contactSuggestions("plans_billing", "downgrade", "ja"),
    "/contact/suggestions/?category=plans_billing&subcategory=downgrade&lang=ja",
  );
});

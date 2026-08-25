import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";

import {
  candidateDisplayName,
  filterPlanLockCandidates,
  PlanLockSelectionForm,
  requiredPlanSelectionCount,
} from "./planLockSelection.js";

test("selection capacity requires exactly the available slots", () => {
  assert.equal(requiredPlanSelectionCount(2, 5), 2);
  assert.equal(requiredPlanSelectionCount(5, 2), 2);
  assert.equal(requiredPlanSelectionCount(0, 3), 0);
  assert.equal(candidateDisplayName({ username: "front-desk" }), "front-desk");
});

test("selection panel marks candidates and disables invalid confirmation", () => {
  const selection = {
    limit: 2,
    candidates: [
      { id: 1, name: "Morning Group", group_type: "standard", status: "active" },
      { id: 2, name: "Evening Group", group_type: "standard", status: "active" },
      { id: 3, name: "Weekend Group", group_type: "standard", status: "active" },
    ],
  };
  const html = renderToStaticMarkup(
    createElement(PlanLockSelectionForm, {
      title: "Choose available Groups",
      description: "Select Groups.",
      selection,
      selectedIds: [1],
      onSelectedIdsChange() {},
      onConfirm() {},
    }),
  );
  assert.match(html, /Choose available Groups/);
  assert.match(html, /1 \/ 2 selected/);
  assert.match(html, /Morning Group/);
  assert.match(html, /Standard Group/);
  assert.match(html, /Choose exactly 2 records/);
  assert.match(html, /Confirm availability/);
  assert.match(html, /disabled/);
});

test("selection panel starts confirmation disabled with empty selection", () => {
  const html = renderToStaticMarkup(
    createElement(PlanLockSelectionForm, {
      title: "Choose available Groups",
      description: "No Groups are preselected.",
      selection: {
        limit: 2,
        candidates: [
          { id: 1, name: "A", group_type: "standard", status: "active" },
          { id: 2, name: "B", group_type: "standard", status: "active" },
          { id: 3, name: "C", group_type: "standard", status: "active" },
          { id: 4, name: "D", group_type: "standard", status: "active" },
        ],
      },
      selectedIds: [],
      onSelectedIdsChange() {},
      onConfirm() {},
      onCancel() {},
    }),
  );
  assert.match(html, /0 \/ 2 selected/);
  assert.match(html, /Choose exactly 2 records/);
  assert.match(html, /class="btn-primary" disabled/);
});

test("selection panel enables confirmation at exact capacity", () => {
  const html = renderToStaticMarkup(
    createElement(PlanLockSelectionForm, {
      title: "Choose available Staff",
      description: "Select Staff.",
      selection: {
        limit: 1,
        candidates: [{ id: 4, username: "reception", role: "staff", status: "active" }],
      },
      selectedIds: [4],
      onSelectedIdsChange() {},
      onConfirm() {},
      onCancel() {},
    }),
  );
  assert.match(html, /reception/);
  assert.match(html, /Workspace Staff/);
  assert.match(html, /Cancel/);
  assert.doesNotMatch(html, /class="btn-primary" disabled/);
});

test("selection search filters candidates without changing required count", () => {
  const candidates = [
    { id: 1, name: "Alpha Member", email: "a@example.com" },
    { id: 2, name: "Beta Member", email: "b@example.com" },
    { id: 3, name: "Gamma Member", email: "c@example.com" },
  ];
  assert.equal(filterPlanLockCandidates(candidates, "beta").length, 1);
  assert.equal(filterPlanLockCandidates(candidates, "#3").length, 1);
  assert.equal(filterPlanLockCandidates(candidates, "").length, 3);
});

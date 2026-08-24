/**
 * Run: node --test src/accountScreenUi.test.js
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";

import {
  AccountAccordionSection,
  AccountSettingsSection,
} from "./accountAccordion.js";
import {
  DEFAULT_ACCOUNT_ACCORDION_STATE,
  emailAccordionStatusPills,
  emailAccordionStatusSummary,
  toggleAccountAccordionSection,
  twoFactorStatusPills,
} from "./accountScreenUi.js";

const sampleAccount = {
  email: "owner@example.com",
  email_verified: true,
  backup_email_status: "none",
};

test("email collapsed by default in accordion state", () => {
  assert.equal(DEFAULT_ACCOUNT_ACCORDION_STATE.emailExpanded, false);
});

test("change password collapsed by default in accordion state", () => {
  assert.equal(DEFAULT_ACCOUNT_ACCORDION_STATE.passwordExpanded, false);
});

test("email accordion expands on toggle", () => {
  const next = toggleAccountAccordionSection(DEFAULT_ACCOUNT_ACCORDION_STATE, "email");
  assert.equal(next.emailExpanded, true);
  assert.equal(next.passwordExpanded, false);
});

test("change password accordion expands on toggle", () => {
  const next = toggleAccountAccordionSection(DEFAULT_ACCOUNT_ACCORDION_STATE, "password");
  assert.equal(next.passwordExpanded, true);
  assert.equal(next.emailExpanded, false);
});

test("accordion sections toggle independently", () => {
  let state = DEFAULT_ACCOUNT_ACCORDION_STATE;
  state = toggleAccountAccordionSection(state, "email");
  state = toggleAccountAccordionSection(state, "password");
  assert.equal(state.emailExpanded, true);
  assert.equal(state.passwordExpanded, true);
});

test("email accordion collapsed markup hides panel content", () => {
  const html = renderToStaticMarkup(
    createElement(
      AccountSettingsSection,
      {
        id: "email",
        title: "Email",
        description: "Login and backup email settings",
        statusSummary: emailAccordionStatusSummary(sampleAccount),
        statusPills: emailAccordionStatusPills(sampleAccount),
        isOpen: false,
        onToggle: () => {},
      },
      createElement("p", null, "Login email controls"),
    ),
  );
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /Login email controls/);
  assert.match(html, /Login: Verified/);
  assert.match(html, /Backup: Not added/);
  assert.match(html, /account-settings-section/);
  assert.match(html, /Verified/);
  assert.match(html, /No backup/);
});

test("email accordion expanded markup shows panel content", () => {
  const html = renderToStaticMarkup(
    createElement(
      AccountSettingsSection,
      {
        id: "email",
        title: "Email",
        description: "Login and backup email settings",
        statusSummary: emailAccordionStatusSummary(sampleAccount),
        statusPills: emailAccordionStatusPills(sampleAccount),
        isOpen: true,
        onToggle: () => {},
      },
      createElement("button", { type: "button" }, "Change email"),
    ),
  );
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /Change email/);
  assert.doesNotMatch(html, /Login: Verified/);
});

test("change password accordion collapsed hides password fields", () => {
  const html = renderToStaticMarkup(
    createElement(
      AccountSettingsSection,
      {
        id: "password",
        title: "Change password",
        description: "Update your account password",
        isOpen: false,
        onToggle: () => {},
      },
      createElement("input", { type: "password", name: "current_password" }),
    ),
  );
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /current_password/);
});

test("change password accordion expanded shows password fields", () => {
  const html = renderToStaticMarkup(
    createElement(
      AccountSettingsSection,
      {
        id: "password",
        title: "Change password",
        description: "Update your account password",
        isOpen: true,
        onToggle: () => {},
      },
      createElement("input", { type: "password", name: "current_password" }),
    ),
  );
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /current_password/);
});

test("two-factor section renders as static settings card with pills", () => {
  const html = renderToStaticMarkup(
    createElement(
      AccountSettingsSection,
      {
        id: "two-factor",
        title: "Two-factor authentication",
        description: "Add a second step when signing in to your owner account.",
        statusPills: twoFactorStatusPills("not_enabled"),
        variant: "twoFactor",
      },
      createElement("p", null, "Security step note"),
    ),
  );
  assert.match(html, /Two-factor authentication/);
  assert.match(html, /Recommended/);
  assert.match(html, /Not enabled/);
  assert.match(html, /Security step note/);
  assert.match(html, /is-static/);
  assert.match(html, /tone-twoFactor/);
  assert.doesNotMatch(html, /aria-expanded/);
  assert.doesNotMatch(html, /account-settings-chevron/);
});

test("danger zone section renders with danger variant and delete control", () => {
  const html = renderToStaticMarkup(
    createElement(
      AccountSettingsSection,
      {
        id: "danger",
        title: "Danger zone",
        description: "Permanent account deletion is separate from logout and archiving.",
        variant: "danger",
      },
      createElement("button", { type: "button", className: "btn-danger btn-sm" }, "Delete account"),
    ),
  );
  assert.match(html, /Danger zone/);
  assert.match(html, /tone-danger/);
  assert.match(html, /Delete account/);
  assert.match(html, /btn-danger/);
});

test("email and password sections include tone classes for tinted cards", () => {
  const email = renderToStaticMarkup(
    createElement(AccountSettingsSection, {
      id: "email",
      title: "Email",
      description: "Login and backup email settings",
      variant: "email",
      isOpen: false,
      onToggle: () => {},
    }),
  );
  const password = renderToStaticMarkup(
    createElement(AccountSettingsSection, {
      id: "password",
      title: "Change password",
      description: "Update your account password",
      variant: "password",
      isOpen: false,
      onToggle: () => {},
    }),
  );
  assert.match(email, /tone-email/);
  assert.match(password, /tone-password/);
});

test("two-factor section uses violet tone class", () => {
  const html = renderToStaticMarkup(
    createElement(AccountSettingsSection, {
      id: "two-factor",
      title: "Two-factor authentication",
      description: "Add a second step when signing in to your owner account.",
      statusPills: twoFactorStatusPills("not_enabled"),
      variant: "twoFactor",
    }),
  );
  assert.match(html, /tone-twoFactor/);
});

test("accordion toggle helper does not imply API side effects", () => {
  const toggled = toggleAccountAccordionSection(DEFAULT_ACCOUNT_ACCORDION_STATE, "email");
  assert.deepEqual(Object.keys(toggled), ["emailExpanded", "passwordExpanded"]);
});

test("form values remain when accordion collapses (state stays outside panel visibility)", () => {
  let draftPassword = "typed-secret";
  let accordion = { ...DEFAULT_ACCOUNT_ACCORDION_STATE, passwordExpanded: true };
  accordion = toggleAccountAccordionSection(accordion, "password");
  assert.equal(draftPassword, "typed-secret");
  assert.equal(accordion.passwordExpanded, false);
  accordion = toggleAccountAccordionSection(accordion, "password");
  assert.equal(draftPassword, "typed-secret");
});

test("accordion trigger uses keyboard-accessible button semantics", () => {
  const collapsed = renderToStaticMarkup(
    createElement(
      AccountSettingsSection,
      {
        id: "email",
        title: "Email",
        description: "Login and backup email settings",
        isOpen: false,
        onToggle: () => {},
      },
      null,
    ),
  );
  assert.match(collapsed, /<button[^>]*type="button"/);
  assert.match(collapsed, /aria-controls="account-settings-email"/);

  const expanded = renderToStaticMarkup(
    createElement(
      AccountSettingsSection,
      {
        id: "email",
        title: "Email",
        description: "Login and backup email settings",
        isOpen: true,
        onToggle: () => {},
      },
      createElement("p", null, "Panel"),
    ),
  );
  assert.match(expanded, /role="region"/);
  assert.match(expanded, /aria-labelledby="account-settings-email-trigger"/);
});

test("email status summary reflects backup pending state", () => {
  const summary = emailAccordionStatusSummary({
    email_verified: true,
    backup_email_status: "pending",
  });
  assert.equal(summary, "Login: Verified\nBackup: Pending");
});

test("AccountAccordionSection remains an alias of AccountSettingsSection", () => {
  assert.equal(AccountAccordionSection, AccountSettingsSection);
});

import {
  canLaunchKiosk,
  canManageGroupConfiguration,
  canManageStaffAccounts,
  canManageSubscription,
  canViewBilling,
  canViewGlobalMembers,
  isWorkspaceOwner,
} from "./workspaceSession.js";
import {
  canAccessStaffManagement,
  canCreateStructuredGroups,
  canExportReportFormat,
  canUseGroupForwardEmails,
  planLimitValue,
  workspacePlanDisplayName,
} from "./workspaceEntitlements.js";
import i18n from "./i18n/index.js";

function isJapaneseTutorialLanguage() {
  const language = String(i18n.resolvedLanguage || i18n.language || "en").toLowerCase();
  return language === "ja" || language.startsWith("ja-");
}

function tTutorial(key, options = {}) {
  if (isJapaneseTutorialLanguage()) {
    const { defaultValue: _englishDefault, ...localizedOptions } = options;
    const lookupOptions = { ns: "workspace", lng: "ja", fallbackLng: false, ...localizedOptions };
    return i18n.exists(key, lookupOptions) ? i18n.t(key, lookupOptions) : "";
  }
  return i18n.t(key, { ns: "workspace", ...options });
}

function tutorialStepText(id, field, fallback) {
  const key = `tutorial.steps.${id}.${field}`;
  if (isJapaneseTutorialLanguage()
      && !i18n.exists(key, { ns: "workspace", lng: "ja", fallbackLng: false })) {
    return fallback;
  }
  return tTutorial(key, { defaultValue: fallback });
}

export const INTRO_TUTORIAL_ID = "workspace-introduction";
export const INTRO_TUTORIAL_VERSION = 1;
export const LEGACY_STORAGE_PREFIX = "checkstation-workspace-onboarding:";
export const TERMINAL_TUTORIAL_STATUSES = new Set(["completed", "skipped"]);

export function onboardingStorageKey(workspaceId) {
  return `${LEGACY_STORAGE_PREFIX}${workspaceId || "unknown"}`;
}

export function hasLegacyOnboardingCompletion(workspaceId, storage = globalThis?.localStorage) {
  if (!workspaceId || !storage) return false;
  try {
    return storage.getItem(onboardingStorageKey(workspaceId)) === "done";
  } catch {
    return false;
  }
}

export function automaticTutorialEligible(session, tutorialState = session?.workspace?.tutorial) {
  if (!isWorkspaceOwner(session) || !tutorialState) return false;
  return tutorialState.status === "not_started" || tutorialState.status === "in_progress";
}

function step(id, route, target, fallbackTitle, fallbackDescription, extra = {}) {
  return {
    id,
    route,
    target,
    title: tutorialStepText(id, "title", fallbackTitle),
    description: tutorialStepText(id, "description", fallbackDescription),
    ...extra,
  };
}

function limitLabel(value, singularKey, pluralKey) {
  if (typeof value !== "number") return "";
  const label = value === 1 ? tTutorial(singularKey) : tTutorial(pluralKey);
  return isJapaneseTutorialLanguage() ? `${label} ${value}件` : `${value} ${label}`;
}

export function groupsCapacityTutorialDescription(session) {
  const activeLimits = [
    limitLabel(
      planLimitValue(session, "active_standard_groups"),
      "tutorial.descriptions.activeStandardGroup",
      "tutorial.descriptions.activeStandardGroups",
    ),
    canCreateStructuredGroups(session)
      ? limitLabel(
          planLimitValue(session, "active_structured_groups"),
          "tutorial.descriptions.activeStructuredGroup",
          "tutorial.descriptions.activeStructuredGroups",
        )
      : "",
  ].filter(Boolean);
  const archivedLimit = limitLabel(
    planLimitValue(session, "archived_groups"),
    "tutorial.descriptions.archivedGroup",
    "tutorial.descriptions.archivedGroups",
  );
  const liveLimits = [...activeLimits, archivedLimit].filter(Boolean);
  if (liveLimits.length) {
    return tTutorial("tutorial.descriptions.groupsCapacityWithLimits", {
      planName: workspacePlanDisplayName(session),
      limits: liveLimits.join(isJapaneseTutorialLanguage() ? "、" : ", "),
    });
  }
  return tTutorial("tutorial.descriptions.groupsCapacityGeneric");
}

export function groupTypeTutorialDescription(session) {
  if (canCreateStructuredGroups(session)) {
    return tTutorial("tutorial.descriptions.groupTypeStructured");
  }
  return tTutorial("tutorial.descriptions.groupTypeStandardOnly");
}

export function attendanceExportTutorialDescription(session) {
  const labels = [
    canExportReportFormat(session, "pdf") ? "PDF" : "",
    canExportReportFormat(session, "xlsx") ? "Excel" : "",
    canExportReportFormat(session, "csv") ? "CSV" : "",
  ].filter(Boolean);
  if (!labels.length) {
    return tTutorial("tutorial.descriptions.attendanceExportNone");
  }
  return tTutorial("tutorial.descriptions.attendanceExportWithFormats", {
    formats: labels.join(", "),
  });
}

export function groupForwardingTutorialDescription(session) {
  if (canUseGroupForwardEmails(session)) {
    return tTutorial("tutorial.descriptions.groupForwardingEnabled");
  }
  return tTutorial("tutorial.descriptions.groupForwardingLocked");
}

export function kioskOverviewTutorialSteps(session, groupId) {
  if (!groupId) {
    return [step("kiosk-overview-fallback", "/groups", null, "Kiosks belong to Groups", "Create and open a Group first. Its page contains Kiosk Settings, design, and live launch controls.")];
  }
  const route = `/groups/${groupId}`;
  return [
    step("kiosk-overview", route, "group-kiosk-actions", "One Group, one kiosk experience", "Kiosk behavior, design, and launch controls belong to this Group, so every Group can run differently."),
    ...(canManageGroupConfiguration(session) ? [
      step("kiosk-overview-settings", route, "kiosk-settings-action", "Control kiosk behavior", "Kiosk Settings controls identification, exit security, attendance reset, and the confirmation screen."),
      step("kiosk-overview-design", route, "kiosk-design-action", "Shape the kiosk design", "Edit Kiosk Design controls the Header, Main area, Footer, and the Card or Input presentation used by this Group."),
    ] : []),
    ...(canLaunchKiosk(session) ? [
      step("kiosk-overview-launch", route, "kiosk-launch-action", "Launch the live kiosk", "Launch Kiosk starts the participant experience and locks this browser session. An authorized operator uses the Group’s exit code to return."),
    ] : []),
  ];
}

export function kioskSettingsTutorialSteps(groupId) {
  if (!groupId) return [];
  const route = `/groups/${groupId}/kiosk-settings`;
  return [
    step("kiosk-settings-overview", route, "kiosk-settings-overview", "Behavior for this Group’s kiosk", "These settings control how participants identify themselves, when attendance cycles reset, what success looks like, and how operators exit live mode."),
    step("kiosk-settings-type", route, "kiosk-settings-type", "Choose Card or Input", "Standard Groups can show participant cards to tap or ask people to enter their Group Participant Code. Structured Groups use a Class card → Participant card flow."),
    step("kiosk-settings-identification", route, "kiosk-settings-identification-fields", "Show or request the right details", "Card mode can show Name, Group or Class Participant Code, and Email when enabled for the Group. Codes are assigned automatically when people join the Group; Input mode always starts with that code and can add one supported second field."),
    step("kiosk-settings-verification", route, "kiosk-settings-verification", "Choose kiosk verification", "When PIN is enabled in Group configuration, Card mode can require it after selection and Input mode can use it as the second field. The kiosk choice remains separate from the Group requirement."),
    step("kiosk-settings-exit", route, "kiosk-settings-exit", "Protect the way out", "The Group’s 4–10 character exit code prevents participants from casually leaving the live kiosk session. It stays hidden here unless an operator chooses to change it."),
    step("kiosk-settings-reset", route, "kiosk-reset-mode", "Start fresh attendance cycles", "Daily resets start a new cycle at a chosen clock time. Rolling resets start a new cycle after the configured duration for each participant."),
    step("kiosk-settings-reset-schedule", route, "kiosk-reset-schedule", "Use a preset or custom schedule", "Daily offers midnight, noon, or a custom time. Rolling offers 8 hours, 12 hours, or a custom hours-and-minutes duration."),
    step("kiosk-settings-reset-now", route, "kiosk-reset-now", "Reset manually when needed", "Reset now lets every participant begin a new attendance cycle immediately without deleting attendance history. This tutorial never triggers it."),
    step("kiosk-settings-confirmation", route, "kiosk-settings-confirmation", "Confirm every successful action", "The Confirmation Screen is what participants see after Check-in, Check-out, or Break actions that the Group has enabled."),
    step("kiosk-settings-messages", route, "kiosk-confirmation-messages", "Make confirmation messages useful", "Customize messages for enabled Actions with the supported {name}, {time}, and {group} variables. Time uses 24-hour format."),
    step("kiosk-settings-return", route, "kiosk-confirmation-return", "Return to the kiosk automatically", "Return time controls how long a successful confirmation remains visible before the kiosk becomes ready for the next participant."),
  ];
}

export function kioskDesignTutorialSteps(groupId) {
  if (!groupId) return [];
  const route = `/groups/${groupId}/kiosk-builder`;
  return [
    step("kiosk-design-overview", route, "kiosk-design-editor", "Design without changing behavior", "The editor changes presentation while Kiosk Settings remain responsible for identification and attendance behavior."),
    step("kiosk-design-preview", route, "kiosk-design-preview", "Preview the real layout", "The canvas shows Header, Main, Footer, and sample participant content responsively. Sample people in the editor are never saved."),
    step("kiosk-design-header", route, "kiosk-design-tab-header", "Brand the Header", "Header controls its background, content alignment, optional title, text style, logo, and logo size."),
    step("kiosk-design-main", route, "kiosk-design-tab-main", "Build the Main experience", "Main controls backgrounds, optional images, overlays, title styling, and the central participant interaction area."),
    step("kiosk-design-footer", route, "kiosk-design-tab-footer", "Finish with the Footer", "Footer has its own background, text, style, and optional image, independent from the Header logo."),
    step("kiosk-design-presentation", route, "kiosk-design-tab-presentation", "Choose the interaction look", "The final tab follows Kiosk Settings: Card templates for Card or Structured flows, and Input templates for Input flows."),
    step("kiosk-design-history", route, "kiosk-design-history-actions", "Experiment safely", "Undo and Redo manage editor changes. Save publishes them; Cancel leaves without saving. This tutorial does not press either action."),
  ];
}

export function kioskLaunchTutorialSteps(groupId) {
  if (!groupId) return [];
  const route = `/groups/${groupId}`;
  return [
    step("kiosk-launch-overview", route, "group-kiosk-actions", "Run this Group’s kiosk", "Launch uses this Group’s participants, Actions, Kiosk Settings, and saved design as one live attendance experience."),
    step("kiosk-launch-readiness", route, "kiosk-launch-action", "Complete setup before launch", "Launch stays unavailable until Group participant setup and required Kiosk Settings are ready."),
    step("kiosk-launch-participant", route, "kiosk-launch-action", "A focused participant experience", "Participants see the configured Card or Input flow, choose an available Action, and receive the configured confirmation before the kiosk returns."),
    step("kiosk-launch-lock", route, "kiosk-launch-action", "The browser becomes the kiosk", "Launching locks this browser session into live kiosk mode so ordinary Workspace navigation is not available to participants."),
    step("kiosk-launch-exit", route, "kiosk-launch-action", "Exit with operator authorization", "An authorized operator selects Exit and enters this Group’s exit code to unlock the browser and return to the Workspace. This tutorial never launches live mode."),
  ];
}

export function accountSecurityTutorialSteps(session) {
  const billingAllowed = canViewBilling(session) && canManageSubscription(session);
  const steps = [
    step(
      "account-security",
      "/account/security",
      "account-security",
      "Security settings",
      "Manage login and backup email, password, two-factor authentication, and account deletion here. This tour does not open any of those controls.",
    ),
  ];
  if (billingAllowed) {
    steps.push(
      step(
        "account-subscription",
        "/account/subscription",
        "account-subscription",
        "Subscription and plan",
        "Review your current plan, trial or subscription status, usage, and upgrade or downgrade options. Entitlement details reflect what this workspace can use today.",
      ),
      step(
        "account-billing",
        "/account/billing",
        "account-billing",
        "Billing and invoices",
        "Payment method, invoices, and receipts for this workspace appear here when billing is managed through CheckStation.",
      ),
    );
  }
  steps.push(
    step(
      "account-info",
      "/account/info",
      "account-info",
      "Help inside the Workspace",
      "Info brings CheckStation guides, FAQs, and legal documents into the Workspace so you can read product guidance without leaving the app.",
    ),
    step(
      "account-tutorial",
      "/account/tutorial",
      "account-tutorial",
      "Replay guided tutorials",
      "Start or replay focused tutorials any time from this page. Completed guides show Completed with a Replay option.",
    ),
    step(
      "account-status",
      "/account/status",
      "account-status",
      "Service status",
      "Status shows live CheckStation service health, active incidents, and scheduled maintenance from the shared status source—useful for checking whether a problem is system-wide.",
    ),
  );
  return steps;
}

export function coreWorkspaceTutorialSteps(session, { groupId = null } = {}) {
  const canConfigure = canManageGroupConfiguration(session);
  const canUseStaff = canAccessStaffManagement(
    session,
    canManageStaffAccounts(session),
  );
  const billingAllowed = canViewBilling(session) && canManageSubscription(session);
  const groupRoute = groupId ? `/groups/${groupId}` : "/groups";
  const steps = [
    step("welcome", null, null, "Welcome to your CheckStation workspace", "This tour connects the main parts of CheckStation—from reusable people and Group setup to kiosks, attendance, staff, and Account tools."),
    step("overview-dashboard", "/dashboard", "workspace-dashboard", "Your Workspace at a glance", "Dashboard shows Member and Group totals alongside recent attendance activity, so you can see the shape of the Workspace quickly."),
    step("overview-dashboard-workflow", "/dashboard", "dashboard-workflow", "Recent activity and quick actions", "Review the latest check-ins, check-outs, and breaks, then use Quick actions to add people, create a Group, open History, or find a kiosk."),
  ];
  if (canViewGlobalMembers(session)) {
    steps.push(
      step("overview-members", "/members", "members-list", "Members are reusable people", "Create a person once, then attach that Member to multiple Groups without re-entering the same information."),
      step("overview-member-create", "/members/new", "member-create-form", "Start with only a name", "Only Name is required. Add a photo or other details later; an email is especially useful when reusing this Member across Groups. This tour does not create anyone."),
    );
  }
  steps.push(
    step("overview-groups", "/groups", "groups-list", "Groups define attendance operations", canCreateStructuredGroups(session) ? tTutorial("tutorial.descriptions.overviewGroupsStructured") : tTutorial("tutorial.descriptions.overviewGroupsStandardOnly")),
    step("overview-group-capacity", "/groups", "groups-status-filter", "Keep active work clear", groupsCapacityTutorialDescription(session)),
  );
  if (canConfigure) {
    steps.push(
      step("overview-group-create", "/groups", "groups-create", "Create each attendance flow here", "Open Create Group to define a new operational setup. The tour can show the form safely, but it never submits it."),
      step("overview-group-configuration", "/groups/new", "group-editor-form", "Shape the Group at a high level", `${groupTypeTutorialDescription(session)}${tTutorial("tutorial.descriptions.overviewGroupConfigSuffix")}`),
      step("overview-group-advanced", "/groups/new", "group-email-settings", "Advanced communication is still Group-specific", "Advanced is where the Group’s outgoing email configuration begins. Sender setup, after-action email, and forwarding remain separate from simply enabling an Action."),
    );
  }
  if (groupId) {
    steps.push(
      step("overview-kiosk-controls", groupRoute, "group-kiosk-actions", "One Group, one kiosk experience", "Each Group owns its Kiosk Settings, visual design, and Launch control, so different Groups can operate in different ways."),
    );
    if (canConfigure) {
      steps.push(
        step("overview-kiosk-settings", `${groupRoute}/kiosk-settings`, "kiosk-settings-overview", "Control kiosk behavior", "Choose Card or Input flow, the identification content participants use, optional PIN verification, and the protected exit code—without changing anything in this tour."),
        step("overview-kiosk-reset", `${groupRoute}/kiosk-settings`, "kiosk-settings-reset", "Define an attendance cycle", "Attendance Reset controls when participants begin a fresh cycle. Daily, rolling, and manual controls preserve History; this tour never triggers Reset now."),
        step("overview-kiosk-confirmation", `${groupRoute}/kiosk-settings`, "kiosk-settings-confirmation", "Finish each action clearly", "The Confirmation Screen controls the success message and return timing participants see after an enabled Action."),
        step("overview-kiosk-design", `${groupRoute}/kiosk-builder`, "kiosk-design-editor", "Design the participant experience", "Use Header, Main, Footer, branding, backgrounds, and presentation controls while the responsive preview shows the result. Undo and Redo are available; Save publishes changes. This tour saves nothing."),
      );
    }
    if (canLaunchKiosk(session)) {
      steps.push(
        step("overview-kiosk-launch", groupRoute, "kiosk-launch-action", "Launch the live kiosk", "Launch Kiosk starts the participant-facing flow using this Group’s enabled Actions. The exit code protects live mode; this tour explains Launch without entering it."),
      );
    }
  } else {
    steps.push(
      step("overview-kiosk-fallback", "/groups", null, "Kiosks begin with a Group", "Create and open a Group to reach Kiosk Settings, Edit Kiosk Design, and Launch Kiosk. No sample Group or kiosk is created for this tour."),
    );
  }
  steps.push(
    step("overview-history", "/history", "history-tabs", "Actions become useful History", "Activity Log shows individual check-ins, check-outs, and breaks. Attendance Report summarizes attendance by Member or Group."),
    step("overview-attendance-report", "/history?view=report", "attendance-report-filters", "Filter, report, and export", "Choose Member or Group reporting, narrow the date range and optional participant context, then export the same filtered report in formats available to the current plan."),
  );
  if (canConfigure && groupId) {
    const emailRoute = `/groups/${groupId}/edit?tutorial=email-sender`;
    steps.push(
      step("overview-email", emailRoute, "group-email-settings", "Every Group communicates its own way", "Advanced keeps the Group’s sender or SMTP setup, per-Action participant emails, and optional forwarding together. This tour neither changes credentials nor sends email."),
    );
  }
  if (canUseStaff) {
    steps.push(
      step("overview-staff-login", "/staff", "staff-workspace-id", "Operational accounts use the Workspace ID", "Admins and Staff combine this Workspace ID with their own credentials to sign in to the correct operational Workspace."),
      step("overview-staff-roles", "/staff", "staff-role-selection", "Give each account the right reach", "Admins manage operational Workspace areas allowed by their role. Staff work only with assigned Groups; Group access controls what they can operate. This tour creates and changes nothing."),
    );
  }
  steps.push(
    step("overview-account-security", "/account/security", "account-security", "Owner Account and security", "Security contains login email, password, two-factor authentication, backup email, and ownership-sensitive controls."),
    step("overview-account-sections", "/account/security", "account-navigation", "Plans, help, tutorials, and service health", billingAllowed ? tTutorial("tutorial.descriptions.overviewAccountSectionsBilling") : tTutorial("tutorial.descriptions.overviewAccountSectionsNoBilling")),
    step("overview-notifications", "/dashboard", "workspace-notifications", "Platform announcements stay close", "The notification bell shows CheckStation announcements. An unread badge means something is new; opening the panel marks visible announcements read for this account across devices."),
    step("overview-plan", "/dashboard", "workspace-plan-badge", "Your effective access at a glance", "The sidebar badge shows the Workspace’s current effective Basic, Plus, or Business access. An active Business trial is shown as Business."),
  );
  return steps;
}

export function availableTutorialModules(session, { groupId = null } = {}) {
  const canConfigure = canManageGroupConfiguration(session);
  const modules = [{
    id: "workspace-overview",
    title: tTutorial("tutorial.modules.workspace-overview.title"),
    description: tTutorial("tutorial.modules.workspace-overview.description"),
    duration: tTutorial("tutorial.modules.workspace-overview.duration"),
    steps: coreWorkspaceTutorialSteps(session, { groupId }),
  }];
  if (canViewGlobalMembers(session)) {
    modules.push({ id: "members", title: tTutorial("tutorial.modules.members.title"), description: tTutorial("tutorial.modules.members.description"), duration: tTutorial("tutorial.modules.members.duration"), steps: [
      step("members-list", "/members", "members-list", "Your reusable people", "Members can be attached to more than one Group without being recreated."),
      step("members-add", "/members", "members-add", "Add people when you’re ready", "Start with a name, then add more participant details as your workflow needs them."),
      step("member-create", "/members/new", "member-create-form", "Create a Member", "Only the name is required, so you can create a Member quickly and add more details later. A photo helps with recognition, and an email makes the Member easier to reuse across Groups."),
    ] });
  }
  modules.push({ id: "groups", title: tTutorial("tutorial.modules.groups.title"), description: tTutorial("tutorial.modules.groups.description"), duration: tTutorial("tutorial.modules.groups.duration"), steps: [
    step("groups-overview", "/groups", "groups-list", "Everything the flow needs", "A Group keeps participants, Actions, participation rules, operational settings, and after-action behavior together."),
    step("groups-capacity", "/groups", "groups-status-filter", "Active and archived Groups", groupsCapacityTutorialDescription(session)),
    ...(canConfigure ? [
      step("groups-create", "/groups", "groups-create", "Create a Group", "Open the real setup form without creating anything yet. This tutorial never saves or submits the Group."),
      step("group-type", "/groups/new", "group-editor-type", "Standard or Structured", groupTypeTutorialDescription(session)),
      step("group-name", "/groups/new", "group-editor-name", "Name the attendance flow", "Give the Group a clear name so people can recognize where this attendance flow belongs."),
      step("group-participation", "/groups/new", "group-editor-participation", "Choose participation requirements", "Require email and Require PIN define the participant details or identification this Group expects."),
      step("group-actions", "/groups/new", "group-editor-actions", "Enable only the Actions you need", "Use Check-in alone, add Check-out, or include Breaks. Every Group can run the combination that fits its workflow."),
      step("group-after-action", "/groups/new", "group-editor-after-action", "Actions and emails are separate", "Enabling an Action does not require an email. For example, allow Check-in and Check-out but send email only after Check-out."),
      step("group-email", "/groups/new", "group-email-settings", "Connect the Group’s sender", "Advanced holds the outgoing sender. Save the Group first, then configure and verify Gmail, Outlook / Microsoft 365, Yahoo, or Custom SMTP before enabling after-action email."),
      step("group-next", "/groups/new", null, "Ready for people and attendance", "After creation, attach reusable Members or manage Group-specific participants. This setup becomes the basis for the Group’s kiosk and attendance flow."),
    ] : []),
  ] });
  modules.push({ id: "kiosks", title: tTutorial("tutorial.modules.kiosks.title"), description: tTutorial("tutorial.modules.kiosks.description"), duration: tTutorial("tutorial.modules.kiosks.duration"), steps: kioskOverviewTutorialSteps(session, groupId) });
  if (groupId && canConfigure) {
    modules.push(
      { id: "kiosk-settings", title: tTutorial("tutorial.modules.kiosk-settings.title"), description: tTutorial("tutorial.modules.kiosk-settings.description"), duration: tTutorial("tutorial.modules.kiosk-settings.duration"), steps: kioskSettingsTutorialSteps(groupId) },
      { id: "kiosk-design", title: tTutorial("tutorial.modules.kiosk-design.title"), description: tTutorial("tutorial.modules.kiosk-design.description"), duration: tTutorial("tutorial.modules.kiosk-design.duration"), steps: kioskDesignTutorialSteps(groupId) },
    );
  }
  if (groupId && canLaunchKiosk(session)) {
    modules.push({ id: "launch-kiosk", title: tTutorial("tutorial.modules.launch-kiosk.title"), description: tTutorial("tutorial.modules.launch-kiosk.description"), duration: tTutorial("tutorial.modules.launch-kiosk.duration"), steps: kioskLaunchTutorialSteps(groupId) });
  }
  modules.push({ id: "attendance-history", title: tTutorial("tutorial.modules.attendance-history.title"), description: tTutorial("tutorial.modules.attendance-history.description"), duration: tTutorial("tutorial.modules.attendance-history.duration"), steps: [
    step("history-tabs", "/history", "history-tabs", "Activity Log or Attendance Report", "Activity Log shows individual check-ins, check-outs, and breaks. Attendance Report summarizes attendance for one Group and date range."),
    step("activity-log-filters", "/history", "activity-log-filters", "Find the actions you need", "Filter Activity Log by Group, Action, participant search, or Day to focus the timeline."),
    step("attendance-report", "/history?view=report", "attendance-report-filters", "Build an Attendance Report", "Report by reusable Member across their Groups, or by Group with an optional participant. Then choose Today, This week, This month, or a custom range."),
    step("attendance-export", "/history?view=report", "attendance-report-export", "Export the current report", attendanceExportTutorialDescription(session)),
  ] });
  if (canConfigure) {
    const emailRoute = groupId ? `/groups/${groupId}/edit` : "";
    modules.push({ id: "email-notifications", title: tTutorial("tutorial.modules.email-notifications.title"), description: tTutorial("tutorial.modules.email-notifications.description"), duration: tTutorial("tutorial.modules.email-notifications.duration"), steps: groupId ? [
      step("group-email-overview", emailRoute, "group-email-settings", "Communication belongs to this Group", "Each Group independently controls its outgoing sender, participant emails, and forwarding behavior."),
      step("group-email-advanced", `${emailRoute}?tutorial=email-advanced`, "group-email-advanced-toggle", "Open Advanced", "Advanced keeps this Group’s sender and forwarding configuration together. The tutorial opens it without changing or saving settings."),
      step("group-email-sender", `${emailRoute}?tutorial=email-sender`, "group-email-sender", "Choose the outgoing sender", "Use Custom SMTP, Gmail, Outlook / Microsoft 365, or Yahoo Mail. This determines the account this Group uses for outgoing email; credentials remain private."),
      step("group-email-after-action", `${emailRoute}?tutorial=email-sender`, "group-editor-after-action", "Actions and emails stay separate", "A Group can allow Check-in, Check-out, or Breaks without emailing every time. Once the sender is verified, choose participant email separately for each enabled action—for example, email after Check-out only."),
      step("group-email-forwarding", `${emailRoute}?tutorial=email-forward`, "group-forward-emails", "Copy the right people", groupForwardingTutorialDescription(session)),
    ] : [
      step("group-email-fallback", "/groups", null, "Communication is configured per Group", canUseGroupForwardEmails(session) ? tTutorial("tutorial.descriptions.groupEmailFallbackWithForward") : tTutorial("tutorial.descriptions.groupEmailFallbackNoForward")),
    ] });
  }
  if (canAccessStaffManagement(session, canManageStaffAccounts(session))) {
    modules.push({ id: "staff-permissions", title: tTutorial("tutorial.modules.staff-permissions.title"), description: tTutorial("tutorial.modules.staff-permissions.description"), duration: tTutorial("tutorial.modules.staff-permissions.duration"), steps: [
      step("staff-login", "/staff", "staff-workspace-id", "One ID identifies the Workspace", "Admins and Staff sign in with this Workspace ID plus their own username and password. It connects their credentials to the correct CheckStation Workspace."),
      step("staff-create", "/staff", "staff-create-account", "Create an operational account", "Choose a username, password, and role. Admin accounts require an email; Staff email is optional. This tutorial never submits the form."),
      step("staff-admin-role", "/staff", "staff-role-selection", "Admin: workspace-wide operations", "Admins can manage Members, Groups, participants, Group and kiosk configuration, attendance, and Staff accounts. They cannot access owner security, subscription or billing, and cannot create or manage other Admin accounts."),
      step("staff-role", "/staff", "staff-role-selection", "Staff: assigned operations only", "Staff can work with participants, launch kiosks, and view or export attendance for assigned Groups. They cannot manage global Members, Group or kiosk configuration, Staff accounts, owner Account pages, or unrelated Groups."),
      step("staff-group-access", "/staff?tutorial=group-access", "staff-group-access", "Assign the Groups Staff can operate", "Staff receive no automatic Group access. Choose their permitted Groups here; Admins instead have workspace-wide operational access. The tutorial opens this editor without changing or saving assignments."),
      step("staff-account-management", "/staff?tutorial=group-access", "staff-account-actions", "Keep operational access under control", "Deactivate or reactivate an account, or reset its password. Deactivation revokes sign-in access without deleting Workspace attendance or Group data."),
    ] });
  }
  const accountBillingAllowed = canViewBilling(session) && canManageSubscription(session);
  modules.push({
    id: "account-security",
    title: tTutorial("tutorial.modules.account-security.title"),
    description: tTutorial("tutorial.modules.account-security.description"),
    duration: accountBillingAllowed
      ? tTutorial("tutorial.modules.account-security.duration")
      : tTutorial("tutorial.modules.account-security.durationShort"),
    steps: accountSecurityTutorialSteps(session),
  });
  return modules.filter((module) => module.steps.length > 0);
}

export function tutorialModuleById(session, moduleId, context = {}) {
  return availableTutorialModules(session, context).find((module) => module.id === moduleId) || null;
}

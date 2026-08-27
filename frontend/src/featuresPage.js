export const FEATURES_META = {
  title: "Features — Check Station",
  description:
    "Configurable check-in, dedicated kiosks, Members, Groups, history, reports, staff access, and email — designed for browser, iPhone, iPad, Android, Mac, and Windows.",
};

export const FEATURES_HERO = {
  eyebrow: "Check Station features",
  headline: "Check-in that matches how your organization actually works.",
  lead:
    "Set up people, Groups, and kiosks the way you already operate. Participants check in on a dedicated screen. Your workspace stays private. Every action is recorded.",
  primaryCta: { to: "/register", label: "Get started free" },
  secondaryCta: { to: "/pricing", label: "See plans" },
  highlights: ["Dedicated kiosks", "Complete history", "Works in the browser today"],
};

export const FEATURES_SHOWCASE = {
  eyebrow: "Product",
  title: "See the workspace, the kiosk, and the record.",
  lead:
    "Check Station connects the screens your staff use with the screens your participants see — without mixing the two.",
  slots: [
    {
      id: "workspace",
      label: "Organization workspace",
      caption: "Manage Members, Groups, staff, and settings in one isolated workspace.",
      aspect: "16 / 10",
    },
    {
      id: "kiosk",
      label: "Participant kiosk",
      caption: "A dedicated check-in experience owned by each Group.",
      aspect: "16 / 10",
    },
    {
      id: "history",
      label: "History and reports",
      caption: "Every check-in, check-out, and break becomes a lasting record.",
      aspect: "16 / 10",
    },
  ],
};

export const FEATURE_STORIES = [
  {
    id: "kiosk",
    eyebrow: "Kiosk",
    title: "A check-in screen that never opens your workspace.",
    body:
      "Each Group owns its own kiosk. Participants identify themselves, choose an allowed action, and see a clear confirmation — without ever reaching Members, settings, or billing.",
    points: [
      "Card or input identification, with optional PIN",
      "Check-in, check-out, and break actions you choose",
      "Branded header, footer, colors, and background",
    ],
    slot: { label: "Live Group kiosk", caption: "Participant-facing check-in, owned by the Group." },
  },
  {
    id: "groups",
    eyebrow: "Groups",
    title: "Different Groups, different rules — in one workspace.",
    body:
      "A Group is a lasting check-in context, not a folder of names. Configure identification, required fields, and actions once. Run a school class, a shift, and a club from the same workspace without forcing one workflow on everyone.",
    points: [
      "Standard Groups for everyday check-in",
      "Structured Groups with Classes when you need a schedule",
      "Group-only participants when a full Member profile is not needed",
    ],
    slot: { label: "Group configuration", caption: "Actions, requirements, and kiosk settings per Group." },
  },
  {
    id: "members",
    eyebrow: "People",
    title: "Reusable people, with room for Group-specific details.",
    body:
      "Members are the people you track — they do not log in. Attach a Member to several Groups without duplicating the profile. Override email, photo, or PIN for one Group without changing the canonical record.",
    points: [
      "Name plus optional photo, contact, and notes",
      "Membership overrides that leave the Member profile intact",
      "Archive, restore, or permanently remove when you are ready",
    ],
    slot: { label: "Member profile", caption: "One person, many Groups — without duplicate records." },
  },
  {
    id: "builder",
    eyebrow: "Kiosk Builder",
    title: "Design the kiosk your participants actually see.",
    body:
      "Kiosk Builder is a controlled design studio — not a page builder. Choose templates, type, color, logos, and layout. Preview with sample participants, then save. Launch is the live kiosk, not a second admin view.",
    points: [
      "Card and input templates for tablets and shared screens",
      "Logos, background image, and prepared visual options",
      "Confirmation messages with name, time, and Group details",
    ],
    slot: { label: "Kiosk Builder", caption: "Visual design for the kiosk, with a live preview canvas." },
  },
  {
    id: "history",
    eyebrow: "History",
    title: "Every action is kept — even after settings change.",
    body:
      "Check-in is not just a current status. Each performed action creates an Action Record you can filter, review, and report on. Later Group or kiosk changes do not rewrite what already happened.",
    points: [
      "Activity Log across Groups, people, actions, and days",
      "Attendance reports for the period you need",
      "CSV, Excel, and PDF export on Plus and Business",
    ],
    slot: { label: "Attendance report", caption: "Filter, review, and export the record you already have." },
  },
  {
    id: "staff",
    eyebrow: "Workspace",
    title: "Owners stay in control. Staff get the access they need.",
    body:
      "You own one isolated workspace. Invite workspace admins and staff with a Workspace ID, username, and password. Assign which Groups they can manage. Your login stays separate from the people you track.",
    points: [
      "Owner security, including optional two-factor authentication",
      "Workspace staff scoped to this workspace only",
      "Group assignments so staff see what they should",
    ],
    slot: { label: "Staff access", caption: "Workspace ID login for the people who run the workspace." },
  },
  {
    id: "email",
    eyebrow: "Email",
    title: "Tell the right people when someone checks in.",
    body:
      "After a successful action, send a private email through the Group’s own sender. Connect Gmail, Outlook / Microsoft 365, Yahoo, or custom SMTP. Participation emails and optional Forward Emails each get their own copy.",
    points: [
      "After-action email for check-in, check-out, and breaks",
      "Up to three participation emails per person",
      "Forward Emails for supervisors on Plus and Business",
    ],
    slot: { label: "Group email", caption: "Verified sender, then after-action messages that stay private." },
  },
];

export const FEATURES_PLATFORMS = {
  eyebrow: "Every screen",
  title: "Designed for the devices your organization already uses.",
  lead:
    "Check Station is a cross-platform product. Use the full web experience in the browser today. Native and downloadable apps for phone, tablet, Mac, and Windows are on the way — clearly marked until they ship.",
  items: [
    {
      id: "browser",
      name: "Browser",
      detail: "Phone, tablet, and computer",
      status: "available",
      statusLabel: "Available now",
    },
    {
      id: "iphone",
      name: "iPhone",
      detail: "Native iOS app",
      status: "coming-soon",
      statusLabel: "Coming soon",
    },
    {
      id: "ipad",
      name: "iPad",
      detail: "Native iPad app",
      status: "coming-soon",
      statusLabel: "Coming soon",
    },
    {
      id: "android-phone",
      name: "Android phone",
      detail: "Native Android app",
      status: "coming-soon",
      statusLabel: "Coming soon",
    },
    {
      id: "android-tablet",
      name: "Android tablet",
      detail: "Native Android tablet app",
      status: "coming-soon",
      statusLabel: "Coming soon",
    },
    {
      id: "mac",
      name: "Mac",
      detail: "Downloadable Mac app",
      status: "coming-soon",
      statusLabel: "Coming soon",
    },
    {
      id: "windows",
      name: "Windows",
      detail: "Downloadable Windows app",
      status: "coming-soon",
      statusLabel: "Coming soon",
    },
  ],
};

export const FEATURES_INCLUDED = {
  eyebrow: "At a glance",
  title: "Everything included",
  lead: "The capabilities you can use in Check Station today — in one place.",
  items: [
    { title: "Members", body: "Reusable people profiles with optional photo and contact details." },
    { title: "Groups", body: "Lasting check-in contexts with their own rules and kiosk." },
    { title: "Structured Groups", body: "Classes inside a Group when a schedule needs more structure." },
    { title: "Group-only participants", body: "Add someone to a Group without a full Member profile." },
    { title: "Membership overrides", body: "Group-specific email, photo, or PIN without changing the Member." },
    { title: "Dedicated kiosks", body: "Participant screens that never expose the workspace." },
    { title: "Kiosk Builder", body: "Templates, branding, and layout with a live design canvas." },
    { title: "Check-in, out, and breaks", body: "Enable the actions each Group actually needs." },
    { title: "Identification options", body: "Visible cards or typed input, with optional PIN." },
    { title: "Activity history", body: "A lasting Action Record for every performed action." },
    { title: "Attendance reports", body: "Review presence by Group, person, and date." },
    { title: "Report export", body: "CSV, Excel, and PDF on Plus and Business." },
    { title: "Workspace staff", body: "Admins and staff with Workspace ID login and Group access." },
    { title: "After-action email", body: "Private messages through Gmail, Outlook, Yahoo, or SMTP." },
    { title: "Forward Emails", body: "Extra private copies for supervisors on paid plans." },
    { title: "Isolated workspaces", body: "Your organization’s data stays in your tenant." },
    { title: "Owner security", body: "Email, password, backup email, and optional two-factor authentication." },
    { title: "Plans that scale", body: "Basic, Plus, and Business — plus a 7-day Business start for new workspaces." },
  ],
};

export const FEATURES_CTA = {
  title: "Put check-in on the screens you already have.",
  lead: "Create a workspace in the browser today. Native apps for iPhone, iPad, Android, Mac, and Windows are coming soon.",
  primaryCta: { to: "/register", label: "Create your workspace" },
  secondaryCta: { to: "/how-it-works", label: "See how it works" },
};

export function featuresPageHasComingSoonPlatforms(platforms = FEATURES_PLATFORMS.items) {
  return platforms.some((item) => item.status === "coming-soon");
}

export function availablePlatformNames(platforms = FEATURES_PLATFORMS.items) {
  return platforms.filter((item) => item.status === "available").map((item) => item.name);
}

export function comingSoonPlatformNames(platforms = FEATURES_PLATFORMS.items) {
  return platforms.filter((item) => item.status === "coming-soon").map((item) => item.name);
}

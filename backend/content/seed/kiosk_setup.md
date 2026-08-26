# Kiosk Setup

This guide covers configuring, previewing, launching, and exiting a CheckStation kiosk as the product works today. For the first-run path from registration to a test check-in, see [Getting Started](/getting-started).

## 1. What a CheckStation kiosk is

A kiosk is the participant-facing check-in screen. Participants identify themselves and perform actions such as check-in, check-out, or break. The kiosk must not expose the workspace dashboard.

Check Station kiosks are **not** a shared workspace resource you assign to arbitrary Groups.

## 2. Groups and kiosks

Each **Group** owns:

- **Kiosk Settings** — type, identification, confirmation timing, exit code
- **Kiosk Design** — Header / Main / Footer look, background, templates

Event-owned kiosks are not implemented.

Open a Group to find **Kiosk Settings**, **Edit Kiosk Design**, and **Launch Kiosk**.

## 3. Opening Kiosk Builder

From the Group, choose **Edit Kiosk Design**. That opens **Kiosk Builder**.

The left/center canvas is a live rendering of the kiosk. A floating editor holds the controls. On smaller screens the editor docks to the bottom and is not dragged.

Kiosk Settings is a separate screen from the visual builder.

## 4. Header, Main, and Footer

The kiosk shell always has three bands:

- **Header** — logo and optional title
- **Main** — titles, cards or input, actions, processing, confirmation
- **Footer** — optional one-line text and optional footer image

You cannot turn Header, Main, or Footer off. Heights are responsive (they scale with the viewport). There are no Header/Footer size sliders in the current builder.

Editor tabs: **Header**, **Main**, **Footer**, and **Cards** or **Input**. Structured Groups always use the **Cards** tab.

## 5. Background configuration

**Header** and **Footer** backgrounds: **Solid** or **Gradient** (second color and angle).

**Main** backgrounds: **Solid**, **Gradient**, or **Image**.

## 6. Main background images

On **Main**, when the background is **Image**:

- **Upload image**, **Replace image**, or **Remove image**
- The image always **covers** Main. There is no separate contain/cover toggle.
- **Drag the Main area on the canvas to pan.**
- **Background zoom** (1×–5×)
- **Horizontal position** and **Vertical position** (focal point)
- **Overlay** / **Overlay strength** (none, darker, or lighter)

## 7. Logos

**Header**

- Optional header logo: **Upload logo** / **Replace logo** / **Remove logo**
- **Logo size** 35%–100%
- Header **Content alignment** (Left / Center / Right) applies to logo and title together so they stay in one group and do not overlap. You cannot drag logo and title independently.

**Footer**

- Optional **Footer image**, independent of the header logo
- **Image position** and **Image size**

## 8. Header title and text style

Header **Title** is optional (max 150 characters). Placeholder: **Optional header title**.

**Title style**: font, font size, text color, effects (None / Shadow / Outline). Fonts include Inter, Roboto, Source Sans 3, Poppins, Nunito, and Merriweather.

## 9. Main title

**Main title** is optional (max 150 characters, single line). Alignment Left / Center / Right, with the same text style controls as the header.

## 10. Footer text

Footer **Text** is optional, one line, max 200 characters. Set text alignment separately from the footer image.

## 11. Card templates

On the **Cards** tab, choose a **Card template**. The catalog is available on **every plan** (including Basic). Templates are not plan-gated.

Examples of template intent: Clean, Compact, Large Touch, Photo, Business, and additional decorative or industry-styled cards. Changing the card template also themes processing, confirmation, and (when you use after-action email) the email visual family.

**Test participants** on this tab: fake editor-only people, counts 6 / 12 / 20 / 50 / 100 (default 12). They are not saved and are not live Members.

## 12. Input templates

On the **Input** tab (Standard Group, kiosk type Input), choose an **Input template**. The full catalog is available on every plan.

The active flow template is the Card template in card/structured mode, or the Input template in input mode. That family styles identify, processing, and confirmation. There is no separate confirmation-template picker.

## 13. Participant identification

Configured in **Kiosk Settings**, not in the visual builder. Group toggles **Require email** and **Require PIN** decide whether those capabilities exist.

**Card** (and Structured)

- Display fields: **Name**, **Group Participant Code** (or **Class Participant Code**), **Email**
- Email is unavailable until **Require email** is on for the Group
- Optional **Require PIN after card selection** (Group **Require PIN** must be on)
- At least one card display field is required
- If PIN after card is on, Group Participant Code must be visible

**Input** (Standard only)

- Field 1 is always **Group Participant Code**
- Optional Field 2: Name, Email, or PIN when the Group allows it

The Group Participant Code is assigned automatically when you add a Member or Visitor to the Group.

## 14. Check-in, check-out, and breaks

Actions come from **Group** configuration (**Edit configuration**), not from the builder:

- **Check in**
- **Check out**
- **Start break** / **End break** when **Breaks** is on (maximum 1–3)

Live screen title: **Choose action**. If nothing is available: **No actions available right now.**

## 15. Preview

The builder canvas is the preview (`mode="editor"`). There is no Preview toggle.

Fake **Test participants** apply in the editor only.

## 16. Undo and Redo

**Undo** and **Redo** in the floating editor (history limit 60 steps). Dragging or minimizing the editor window is not part of undo history.

## 17. Save and Cancel

- Status: **Unsaved** / **Saving…** / **Saved**
- **Save** — stores the design, then returns to the Group. Disabled when there are no changes. No autosave.
- **Cancel** — confirms **Discard unsaved kiosk design changes?** then returns to the Group
- Leaving the workspace or closing the tab while dirty warns: **You have unsaved kiosk design changes. Leave without saving?**

**Kiosk Settings** has its own **Save Kiosk Settings** and a similar leave warning.

## 18. Responsive behavior

One design is used on all viewports. Header, Main, and Footer heights clamp to the screen. Card and input layouts tighten on smaller widths.

In the builder at tablet/phone widths, the editor docks to the bottom; Undo/Redo labels may hide, leaving icons.

## 19. Launching the kiosk

From the Group, **Launch Kiosk** opens `/kiosk/{groupId}` and locks this browser session to that Group.

Launch is blocked when:

- Group setup is incomplete (missing required PIN/email; Structured Groups need at least one Class with participants)
- Kiosk Settings are invalid (no exit code, invalid identification)
- The Group is archived or plan-locked
- This session is already locked to another Group
- The signed-in role cannot launch

Banners: **Setup incomplete**, **Kiosk settings need attention**.

On Basic, an ad may appear **before** launch. Ads are not shown during the live participant flow.

## 20. Live kiosk lock

While locked, this browser cannot open the workspace dashboard or most workspace APIs. The app keeps you on the live kiosk URL.

Lock uses the existing Check Station session. Dedicated hardware device credentials are not implemented.

## 21. Loading and confirmation

Live start may show **Loading kiosk…**.

After a successful action, a confirmation view appears, themed by the flow template. Return delay is **1 sec / 3 sec / 5 sec** in Kiosk Settings. Message fields support `{name}`, `{time}` (24-hour), and `{group}` for check-in, check-out, break start, and break end.

## 22. Email and the kiosk

After-action email is configured on the Group (sender + After check-in / check-out / break). It is not a Builder screen.

If you send those emails, their visual theme follows the Group’s saved Card or Input template family.

Participants receive mail at the **Group email** on the participation record.

## 23. Exiting the live kiosk

1. Choose **Exit**.
2. Dialog **Exit kiosk**: enter the Group’s **Exit code**.
3. Confirm **Exit kiosk** (or **Unlock session** if you are recovering a locked browser).

The code is 4–10 letters or numbers, set under Kiosk Settings → **Exit Kiosk**. Status: **Exit code configured** or **Exit code required**. Changing it uses **Change exit code**.

Exit does **not** use the owner or staff password.

On Basic, an ad may appear after exit.

## 24. Editing the kiosk later

Reopen **Edit Kiosk Design** or **Kiosk Settings** from the Group at any time. You can edit design even when launch is still blocked by setup. Plan-locked Groups may hide configure and launch together.

## 25. Common readiness problems

- **Setup incomplete** — required Group email/PIN missing on a participant, or a Structured Group has no Class with people
- **Exit code required** — save a 4–10 character kiosk exit code
- **Select at least one card display field** — turn on Name, code, and/or Email in Kiosk Settings
- Email or PIN controls disabled — enable **Require email** / **Require PIN** on the Group first
- Launch disabled — finish setup, or the Group is archived, plan-locked, or you lack permission
- **kiosk_locked** — this browser is already in live kiosk; exit with the exit code

## 26. Structured Group kiosks

**Business** plan. Kiosk type is fixed: **Class cards → Participant cards**. Input mode is not offered.

Live flow:

1. **Choose your class**
2. **Enter class PIN** if **Require PIN for classes** is on, then **Continue**
3. **Choose participant** (optional participant PIN)
4. **Choose action**
5. Confirmation, then return to classes

Builder still uses Header / Main / Footer plus the **Cards** tab. Identification labels use **Class Participant Code** where applicable.

## 27. Next

- [Getting Started](/getting-started) — account, first Group, test check-in, History
- [Groups & Members](/groups-members) — people, Visitors, and plan-locked Groups
- [Billing & Plans](/billing-plans) — ads on Basic, exports, and plan limits
- [FAQ](/faq) — kiosk launch, lock, PIN, and exit code questions

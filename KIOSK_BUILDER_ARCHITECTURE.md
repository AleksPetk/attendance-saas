# Kiosk Builder Architecture

Source-of-truth architecture for the Check Station Kiosk Builder feature.

This document describes a **controlled, responsive visual kiosk builder** — not a Canva/Figma-style free-form editor and not an arbitrary page-builder. The builder provides substantial visual customization within enforced responsive guardrails so that one saved design adapts across phone, tablet, desktop, and future native app surfaces.

For general product rules see [PRODUCT.md](./PRODUCT.md). For confirmed decisions see [DECISIONS.md](./DECISIONS.md). For tenant/person architecture see [ARCHITECTURE.md](./ARCHITECTURE.md). For security see [SECURITY.md](./SECURITY.md).

---

## Document Status

| Field | Value |
|-------|-------|
| **Status** | Approved architecture; implemented through Phase 5 foundation |
| **Created** | 2026-08-19 |
| **Last updated** | 2026-08-23 |
| **Supersedes** | DEC-012 limited-theme-only assumption (see [Backward Compatibility](#backward-compatibility)) |

**Structured Groups:** live Main content uses Class cards then participant cards, but the same `KioskDesign` Builder (Header/Main/Footer, presets, backgrounds) applies. Builder fake sample content remains participant-card density testing; Class-card fake samples are not required for this stage.

---

## Table of Contents

- [Purpose](#purpose)
- [Product Principles](#product-principles)
- [Ownership](#ownership)
- [Behavior vs Visual Design](#behavior-vs-visual-design)
- [Data Architecture](#data-architecture)
- [Config Schema](#config-schema)
- [Editor Structure](#editor-structure)
- [Header](#header)
- [Main](#main)
- [Footer](#footer)
- [Shared Text System](#shared-text-system)
- [Button / Input / Card Presets](#button--input--card-presets)
- [Preset Architecture](#preset-architecture)
- [Responsive Rules](#responsive-rules)
- [Media Lifecycle](#media-lifecycle)
- [Renderer Architecture](#renderer-architecture)
- [Live Editor Canvas](#live-editor-canvas)
- [Editor State / Undo-Redo](#editor-state--undo-redo)
- [Workspace Actions](#workspace-actions)
- [Builder Density Testing](#builder-density-testing)
- [Real Kiosk Integration](#real-kiosk-integration)
- [Security / Tenant Isolation](#security--tenant-isolation)
- [Customer Staff Permissions](#customer-staff-permissions)
- [Backward Compatibility](#backward-compatibility)
- [Implementation Stages](#implementation-stages)
- [Deferred Decisions](#deferred-decisions)
- [Non-Goals](#non-goals)

---

## Purpose

Define the architecture for a controlled kiosk builder that allows Organization owners to visually customize their Group-owned kiosks. The builder balances substantial customization with responsive safety, so that any design created on any device looks correct on every other device.

This document is the durable reference for implementation. It should be readable independently of the chat conversations that produced it.

---

## Product Principles

1. **Controlled customization** — customers choose from curated options (presets, constrained drag areas, limited section sizing) rather than arbitrary CSS, layers, or free-form element placement.
2. **Responsive by construction** — one saved design works everywhere. No separate desktop/tablet/phone configurations. Positions and sizes are stored as normalized relative values.
3. **Visual design is separate from attendance behavior** — the builder answers "how does the kiosk look?" while kiosk mode, actions, identification, PIN, sequencing, and session lock remain in their own domain.
4. **Simple for normal customers** — the builder must be usable by non-technical Organization owners without design training.
5. **No draft persistence** — Save is the only way to persist. No autosave, no localStorage/sessionStorage drafts. Unsaved work may be lost on browser close.

---

## Ownership

Each **Group** owns one independent kiosk design. There is no shared workspace-level kiosk design and no design inheritance between Groups.

### Initial direction

A dedicated `KioskDesign` model relates **OneToOne** to `Group`. Group ownership is required. Event kiosks do not exist yet; when Event models are implemented later, add an explicit nullable OneToOne FK to Event via a dedicated migration. Do not keep speculative orphan `KioskDesign` rows for future Events.

Do not over-engineer Event polymorphism before Event exists. The initial implementation targets Group only, with required Group ownership. Event integration requires adding one FK and one API endpoint pattern — not a redesign.

### What is NOT supported

- No reusable kiosk template library
- No copying designs between kiosks
- No "save as template"
- No design sharing across Organizations

---

## Behavior vs Visual Design

This separation is a core architectural rule.

### Stays on Group (behavioral configuration)

These fields remain on the `Group` model. **Kiosk identification and exit security** live on `KioskSettings` (see DEC-057 / DEC-058). Visual Header/Main/Footer appearance lives on `KioskDesign`. Deprecated Group kiosk columns remain temporarily for migration compatibility.

| Field / Concept | Reason |
|---|---|
| `check_in_enabled`, `check_out_enabled`, `breaks_enabled`, `max_breaks` | Action configuration |
| `require_email`, `require_pin` | Group participation availability (not kiosk usage) |
| `automatic_check_in_enabled`, `automatic_check_in_time` | Preset/automatic behavior |
| `kiosk_return_delay_seconds`, welcome/success messages | **Deprecated on Group** — migrated to `KioskSettings` confirmation fields; welcome text remains on Group |
| Email notification toggles and templates | Post-action outcomes |
| Action sequencing and ActionRecord creation | Attendance logic |

**Deprecated on Group (retained in DB, not Kiosk Settings UI source of truth):** `kiosk_mode`, `kiosk_list_show_*`, `kiosk_input_field_*`, legacy identifier/PIN runtime coupling.

### KioskSettings (behavioral kiosk configuration)

| Concept | Owner |
|---|---|
| Card vs Input mode | `KioskSettings.mode` |
| Card display fields, kiosk PIN usage | `KioskSettings` card/PIN fields |
| Input field count / second field | `KioskSettings` |
| Kiosk exit code (hashed) | `KioskSettings.exit_code_hash` |
| Confirmation screen | `KioskSettings.confirmation_*` — preset template, per-action messages, return delay (1/3/5 sec) |

Header/Main/Footer always exist on the kiosk shell. Kiosk Settings does **not** toggle section presence. Visual appearance (including optional empty Header/Footer content and matching backgrounds) lives in `KioskDesign`. Confirmation screen uses preset styles with a safe readable surface over Main; not edited in Builder.

### Lives in KioskDesign (visual configuration)

| Concept | Examples |
|---|---|
| Section presence | Always Header + Main + Footer (not toggleable) |
| Section sizing | Automatic responsive clamps (not user-editable) |
| Backgrounds | Colors, gradients, images per section |
| Typography | Font, size, color, effects for titles and text |
| Header logo | Image + size within Header |
| Header content alignment | Left / center / right (logo + title as one group) |
| Main layout preset | Which polished layout template to use |
| Component style presets | Button, input, card visual presets |
| Main background image transform | Pan, zoom, overlay |
| Footer text | Optional single line, left/center/right |
| Footer image | Optional independent logo/image, left/center/right |

Display text that is genuinely part of the visual composition (e.g., a welcome heading, footer branding text) may live in the design config. Operational messages tied to attendance flow (success messages after actions, confirmation prompts) should remain behavioral. The exact boundary may be refined during implementation; when uncertain, prefer keeping text behavioral.

---

## Data Architecture

### KioskDesign Model

```
KioskDesign
├── id (PK)
├── organization (FK → Organization, PROTECT)
├── group (OneToOne → Group, CASCADE, required)
├── [future] event (OneToOne → Event, CASCADE, nullable)
├── config (JSONField)                               ← visual configuration
├── header_logo (ImageField)                         ← optimized logo file
├── main_background_image (ImageField)               ← optimized background file
├── created_at
└── updated_at
```

### Why this shape

| Alternative | Why not |
|---|---|
| Fields directly on Group | 50+ visual fields would make Group unwieldy. Mixes visual and behavioral concerns. Makes Event reuse require duplicating all fields. |
| Fully normalized models (KioskHeader, KioskMain, KioskFooter) | Over-engineered. The entire config is always loaded and saved atomically. Normalization adds join complexity for zero querying benefit. |
| JSON-only with image URLs inside JSON | Image lifecycle (upload, optimization, deletion, storage cleanup) is better handled by Django `ImageField` with explicit file management. |

### Why JSONField for config

- Allows iterating on design options (new presets, new text effects) without a migration for each change.
- The full config is always read/written as one unit — never partially queried or filtered by individual properties.
- Schema is validated at the application layer before save.
- A `schema_version` key inside the config enables forward-compatible evolution.

### JSONField validation rules

The config JSON is **not** an unvalidated free-form blob. Server-side validation must:

- Accept only documented keys
- Enforce value ranges (e.g., height ratios within min/max, colors as valid hex, font names from the allowed list)
- Accept only known preset identifiers
- Reject arbitrary CSS, HTML, `<script>`, or URL values where not expected
- Validate string lengths (e.g., title max 150 chars, footer lines max 200 chars each)

---

## Config Schema

The config JSON has a `schema_version` for forward compatibility. Below is the conceptual schema for version 1.

```jsonc
{
  "schema_version": 1,

  "header": {
    "enabled": true,
    "height": 0.12,                              // fraction of viewport height
    "background": {
      "mode": "solid",                            // "solid" | "gradient"
      "color": "#2563EB",                         // primary color
      "color2": null,                             // second gradient color
      "gradient_angle": 90                        // degrees, when mode is "gradient"
    },
    "logo": null | { "size": 0.75 },              // size relative to Header height; no free x/y
    "alignment": "left",                          // "left" | "center" | "right" — logo+title group
    "title": {
      "text": "Check In",
      "font": "Inter",
      "size_rem": 1.5,                            // rem-based for responsive scaling
      "color": "#FFFFFF",
      "effects": {
        "shadow": false,
        "outline": false
        // additional controlled effects may be added
      }
    }
  },

  "main": {
    "background": {
      "mode": "solid",                            // "solid" | "gradient" | "image"
      "color": "#FFFFFF",
      "color2": null,
      "gradient_angle": 180
    },
    "image_transform": {                          // only used when mode is "image"
      "focal_x": 0.5,                            // normalized focal point
      "focal_y": 0.5,
      "zoom": 1.0                                // >= 1.0 to maintain cover
    },
    "overlay": 0.0,                               // -1.0 (dark) to +1.0 (light), 0 = none
    "layout_preset": "centered",                  // Card-mode layout; also synced when an Input template is chosen
    "input_template": "clean",                    // canonical Input-mode complete look (10 curated templates)
    "title": {
      "text": "Welcome",
      "font": "Inter",
      "size_rem": 2.0,
      "color": "#111827",
      "alignment": "center",                      // "left" | "center" | "right" — title only
      "effects": { "shadow": false, "outline": false }
    },
    "button_preset": "rounded",                   // legacy / derived from input_template
    "input_preset": "outlined",                   // legacy / derived from input_template
    "card_preset": "elevated"                     // Card mode only
  },

  "footer": {
    "enabled": false,
    "height": 0.06,
    "background": {
      "mode": "solid",
      "color": "#1E293B",
      "color2": null,
      "gradient_angle": 90
    },
    "text": {
      "lines": ["Powered by Check Station"],      // max 3 lines
      "alignment": "center",                      // "left" | "center" | "right"
      "font": "Inter",
      "size_rem": 0.875,
      "color": "#94A3B8",
      "effects": { "shadow": false, "outline": false }
    }
  }
}
```

This is a conceptual reference, not a frozen contract. Keys and defaults may be refined during implementation. The `schema_version` field enables safe evolution.

---

## Editor Structure

The kiosk is divided into three vertical sections that **always exist**:

```
┌──────────────────────────┐
│        HEADER            │  ← always present; automatic height
├──────────────────────────┤
│                          │
│         MAIN             │  ← always present; fills remaining height
│                          │
├──────────────────────────┤
│        FOOTER            │  ← always present; automatic height
└──────────────────────────┘
```

### Section presence

Header, Main, and Footer are always rendered. Content may be empty. Customers who want an unobtrusive Header/Footer match its background to Main and leave content empty — sections never collapse.

### Section height

Heights are automatic and responsive (not user-editable in Builder):

- Header: `clamp(72px, 13vh, 130px)`
- Footer: `clamp(48px, 8vh, 82px)`
- Main: fills remaining viewport height

Same sizing applies in Builder and Live Kiosk.

---

## Header

### Background

Two modes:
1. **Solid color** — single color
2. **Two-color linear gradient** — two colors plus angle

Color editing uses the [shared color controls](#shared-text-system): visual picker, manual hex input, preset swatches.

### Logo

- Maximum one logo per Header.
- User uploads an image file.
- Size is controlled with a slider (relative to Header height), same idea as Footer image size.
- Position is **not** free-drag — Header uses a single content alignment (left / center / right).
- Logo and title share that alignment as a compact horizontal group (logo then title) so they cannot overlap.
- On **Save**: the logo is uploaded to the backend and optimized/compressed aggressively.
- On **replace or remove**: the previously stored logo file is deleted. No superseded images are retained.
- During editing (before Save), the image remains in browser memory as a local blob.

### Title

- Maximum one single-line title.
- Uses the [shared text system](#shared-text-system): font, size, color, hex input, swatches, outline/shadow effects.
- Position follows Header content alignment with the logo — **not** freely draggable.

### Content alignment

- Control: Left / Center / Right.
- Applies to the combined logo+title group (or whichever content exists).
- Responsive padding keeps content inside Header bounds; title ellipsizes if needed.

---

## Main

### Layout

Main layout is **preset-driven**. Users do not drag or freely position:

- participant input areas
- participant cards
- action buttons
- success/error states
- content blocks

Instead, the user selects polished presets:

- **Input mode:** one of **10 curated Input templates** (`input_template`) — complete looks for form container, field, and Continue button (not separate button/input style mix-and-match).
- **Card mode:** layout + card style presets (Card templates may be redesigned later).

Legacy `layout_preset` / `button_preset` / `input_preset` remain in config for compatibility; Input templates map onto them when selected. Missing `input_template` is derived from those legacy fields on normalize.

Component accent colors come from the Input template (or a neutral default), **never** from Header background.

### Main Title

- Uses the [shared text system](#shared-text-system).
- Horizontal alignment: **left / center / right** (`main.title.alignment`), independent of Input/form position.
- Not freely draggable.

### Background

Three modes:

1. **Solid color**
2. **Two-color linear gradient**
3. **Uploaded image**

#### Image mode

- The image must **always cover** the complete Main section with no blank/uncovered edges.
- Different aspect ratios use cover/crop behavior.
- User controls:
  - Horizontal pan
  - Vertical pan
  - Zoom
- Pan and zoom are constrained so the image always fully covers Main — the editor must not allow exposing blank background.
- Position is stored as a **normalized focal point** (`focal_x`, `focal_y` in 0.0–1.0 range) plus a **zoom factor** (≥ 1.0).
- The renderer uses these values to compute CSS `object-position` and `object-fit: cover` / `transform: scale()` behavior.
- During editing, the image remains in browser memory. Upload happens only on Save.

#### Image overlay

A tint/overlay control:
- Negative values → transparent black overlay (darker)
- Zero → no overlay
- Positive values → transparent white overlay (lighter)

This helps foreground content remain readable over varied background images.

#### Image lifecycle

- Optimize/compress aggressively on Save.
- On replace or remove, immediately delete the previous stored image.
- No old/replaced image history retained.

---

## Footer

### Background

Same two modes as Header: solid color or two-color linear gradient. Uses the same shared color controls.

### Text

- Up to **3 lines** of editable text.
- Uses the [shared text system](#shared-text-system).
- Text alignment: **left**, **center**, or **right**.
- Footer text is **NOT draggable** — alignment is the positioning control.

---

## Shared Text System

A single reusable text-style component used across Header title, Main title, and Footer text editing. Where applicable it provides:

- **Font selection** from a curated library
- **Font size** (rem-based for responsive scaling)
- **Text color**: visual picker, manual hex/code input, common preset swatches
- **Limited text effects**: outline, shadow, line-style — deliberately constrained set

Section-specific positioning rules remain distinct:

| Section | Position control |
|---|---|
| Header title | Left / center / right via Header content alignment |
| Main title | Left / center / right alignment (independent of form/cards) |
| Footer text | Left / center / right alignment |

### Font library

- Curated set of **6 self-hosted faces** (Inter, Roboto, Source Sans 3, Poppins, Nunito, Merriweather), bundled as Latin woff2 (400/700) with the renderer.
- Saved identifiers `open_sans` and `lato` remain valid and map onto hosted neighbors so old configs do not break.
- Kiosk rendering does **not** depend on a Google Fonts CDN. The workspace admin UI may still load Inter separately.
- The picker lists only hosted faces.

### Color controls

Used consistently wherever colors appear (backgrounds, text, gradients):

- Visual color picker
- Manual hex/code input (e.g., `#2563EB`)
- Quick preset swatches of common colors

Do not build separate color editors for each section.

---

## Button / Input / Card Presets

Users cannot directly edit individual component CSS properties (border-radius, border-width, shadows, glow, spacing, internal colors, etc.).

Instead, the builder provides polished **selectable presets** for:

- **Buttons** (action buttons in the kiosk flow)
- **Inputs** (text fields in input-mode identification)
- **Participant cards** (member cards in member-list mode)

Each preset is a self-contained visual treatment defined in application CSS. The user's only choice is which preset to apply. More presets can be added over time.

---

## Preset Architecture

Presets are **application-defined, not customer-created**. They exist as a shared contract between backend and frontend.

### Definition

Each preset category (main layouts, button styles, input styles, card styles) has a registry of identifiers. Each identifier maps to a CSS class (frontend) and a metadata entry (backend validation + API listing).

```
Preset Registry (conceptual)
├── main_layouts: { "centered", "compact", "split", "large_touch", "photo_cards" }
├── button_styles: { "rounded", "flat", "pill" }
├── input_styles: { "outlined", "filled", "minimal" }
└── card_styles: { "elevated", "flat", "bordered" }
```

### Backend role

- Validates that preset identifiers in the config JSON belong to the known registry.
- Provides a list API endpoint so the frontend can display available presets with labels/thumbnails.
- Identifiers are simple strings — no DB migration needed to add a new preset.

### Frontend role

- Maps preset identifiers to CSS classes.
- Renders preset previews/thumbnails in the builder.

### Avoiding identifier drift

The preset identifier list must be consistent between backend validation and frontend rendering. Recommended approach: define identifiers in a shared constants module or ensure the frontend reads available presets from the API rather than hardcoding a separate list.

---

## Responsive Rules

### Core principle

One saved configuration produces a correct kiosk on every device. There are no separate desktop/tablet/mobile design variants.

### Normalized positioning

All movable element positions and sizes are stored as fractions (0.0–1.0) relative to their containing section, not as fixed pixel values.

| Property | Stored as | Relative to |
|---|---|---|
| Header/Footer height | Fraction (legacy; rendering uses CSS clamps) | Viewport height |
| Header content alignment | Enum left/center/right | Header |
| Header logo size | Fraction | Header height |
| Footer image position | Enum left/center/right | Footer |
| Footer image size | Fraction | Footer height |
| Main image focal point | Fractions | Image natural dimensions |
| Main image zoom | Scale factor (≥ 1.0) | Natural image size |

### Enforcement

The editor enforces:

- **Alignment presets** — Header/Footer content use left/center/right; no free drag for Header logo/title.
- **Cover guarantee** — Main background image pan/zoom is constrained so the image always covers the full Main area.
- **Preset-driven Main** — Main content layout is selected from responsive presets / Input templates, not freely positioned.

### Font sizing

Font sizes use `rem` units for responsive scaling across devices. The shared text system stores `size_rem` values. The renderer honors the stored value at a typical 16px root, then applies CSS `clamp()` so extreme sizes remain usable on very small or very large screens.

---

## Media Lifecycle

### Files managed

| File | Field | Purpose |
|---|---|---|
| Header logo | `KioskDesign.header_logo` | Organization branding in kiosk header |
| Footer image | `KioskDesign.footer_logo` | Optional independent footer branding image |
| Main background image | `KioskDesign.main_background_image` | Visual background for main section |

### Storage path

Tenant-scoped paths, e.g.:

```
kiosks/{organization_id}/designs/{design_id}/logo.png
kiosks/{organization_id}/designs/{design_id}/footer-logo.png
kiosks/{organization_id}/designs/{design_id}/background.jpg
```

### Optimization

Images are optimized/compressed on Save using the existing `core/images.py` pipeline (Pillow-based: EXIF transpose, alpha flattening, resize, JPEG compression).

Practical optimization targets:
- **Logo**: smaller maximum dimension (suitable for a header element)
- **Background**: larger maximum dimension (fills the Main section)

Exact pixel dimensions and quality values will be tuned during implementation — they are not immutable product decisions.

### Lifecycle rules

1. **During editing** — new/replacement images exist only in browser memory as local blobs. No server upload until Save.
2. **On Save** — image is uploaded, optimized, and stored. The config JSON references the stored file via the `ImageField`, not an inline data URL.
3. **On replace** — the previous stored file is deleted before saving the new one.
4. **On remove** — the stored file is deleted.
5. **No history** — superseded images are not retained.
6. **Quality loss acknowledged** — if a previously optimized logo is later enlarged substantially in the editor, some quality loss is acceptable.

### Permanent account/workspace deletion

The existing tenant-deletion service (`accounts/deletion.py`) must be extended to:

1. Collect `KioskDesign` image file names before the deletion transaction.
2. Hard-delete `KioskDesign` rows inside the transaction.
3. Delete collected media files after the transaction.
4. Remove the `kiosks/{organization_id}/` media directory.

---

## Renderer Architecture

A **shared kiosk rendering component** should render the visual design from the `config` JSON across two contexts:

| Context | Behavior |
|---|---|
| **Builder canvas** | Full-size rendering inside the builder. Updates in real-time from unsaved editor state. Fake sample Main content only (Card density presets or Input sample). No attendance logic. |
| **Real kiosk** | Full-size rendering with real participant data, real attendance logic, real ActionRecord creation, real session lock. |

Both contexts use the **same rendering logic** for visual design (colors, gradients, backgrounds, fonts, presets, section layout). They differ only in data source and whether attendance side-effects are enabled.

This prevents visual divergence between what the owner sees in the builder and what participants see in the real kiosk.

There is **no separate Preview route or Preview screen**.

---

## Live Editor Canvas

The builder UI includes a live canvas that updates immediately as the user makes unsaved changes.

Changes that update the canvas in real-time:
- Colors and gradients
- Text content, font, size, effects, Main title alignment
- Logo upload/change/remove and size
- Header content alignment
- Main background image pan/zoom
- Image overlay
- Input templates / Card layout & card style presets
- Card-mode fake participant density (builder-only)

The canvas uses the shared renderer component fed by the current (unsaved) editor state.

**Minimize** collapses the floating editor to a restore pill so the owner can inspect the kiosk unobstructed. Minimized state remains editor mode (fake content, no ActionRecords, no session lock). Minimize is not Launch.

---

## Editor State / Undo-Redo

### State management

The editor maintains:

- **`history`** — an ordered list of config snapshots
- **`historyIndex`** — pointer to the current position in the list
- **`lastSavedIndex`** — pointer to the most recently saved position
- **`liveConfig`** — transient state during active gestures (drag/resize/pan/zoom), used to drive the preview without creating history entries

### Undo / Redo

- **Undo** decrements `historyIndex` (min 0).
- **Redo** increments `historyIndex` (max `history.length - 1`).
- Making a new change after Undo truncates the future history (standard branching behavior).

### Gesture coalescing

Continuous gestures (drag, resize, pan, zoom, divider adjustment) must produce **one history entry when the gesture ends**, not hundreds of entries for each pointer-movement event. During the gesture, `liveConfig` is updated for the preview. On gesture end (`pointerup` / `touchend`), the final state is pushed to history.

### Save

- Persists the current config (at `historyIndex`) to the backend.
- Uploads any new/changed images.
- Updates `lastSavedIndex` to `historyIndex`.

### Cancel

- Reverts the editor state to the config at `lastSavedIndex`.
- Discards any unsaved image blobs.
- Does not delete the last-saved server-side design.

### Unsaved changes warning

If `historyIndex !== lastSavedIndex`, the editor has unsaved changes. Navigating away or closing the browser triggers a confirmation dialog (via `beforeunload` and/or in-app route-change interception).

### No draft persistence

- No autosave
- No localStorage drafts
- No sessionStorage drafts

If the browser closes before Save, unsaved changes are lost. This is by design.

### History size

Cap the history list at a reasonable maximum (e.g., ~50 entries) to avoid unbounded memory growth. Config snapshots are lightweight JSON (~2KB each) since images are stored as file references, not inline data.

---

## Workspace Actions

After a kiosk design is saved, the workspace exposes these actions for that Group's kiosk:

| Action | Behavior |
|---|---|
| **Kiosk Settings** | Behavior only (Card/Input, fields, exit code) |
| **Edit Kiosk Design** | Opens the Kiosk Builder (visual design + fake density testing) |
| **Launch Kiosk** | Starts the real kiosk (session lock, real attendance) |

There is no separate Preview action. The Builder canvas (and Minimize) is the design inspection path.

---

## Builder Density Testing

### Purpose

In **Card** mode, let owners stress-test card layout density on the Builder canvas using fake participants — without a separate Preview page or simulated attendance flow.

### Behavior

- Builder-only UI state: **Test participants** counts exactly `6 / 12 / 20 / 50 / 100` (default `12`).
- Not saved to `KioskDesign`, `KioskSettings`, Group, or backend.
- Deterministic fake people (name, Group Participant Code, email); never real Members / memberships / visitors / attendance.
- Fake cards respect Kiosk Settings display flags (`card_show_name`, `card_show_participant_code`, `card_show_email`). PIN is never shown.
- Uses the same `.kiosk-people-grid` / card layout CSS as live kiosk wherever practical (wrapping, Main scroll).
- **Input** mode: no count selector; keep the Input sample form only.
- No ActionRecords, check-in simulation, or attendance API calls.

### Mutation-free guarantee

The Builder canvas **MUST NOT**:

- Create ActionRecords
- Alter attendance state
- Modify Members or GroupMemberships
- Perform real check-in / check-out / break actions
- Lock the kiosk session

---

## Real Kiosk Integration

The visual builder must **preserve** all existing real kiosk behavior:

- Group owns its kiosk
- Future: Event owns its kiosk
- Member-list mode and input mode
- Participant identification (name, email, identifier, PIN)
- PIN hashing and verification
- Allowed action sequencing (check-in → break → check-out rules)
- Check In / Check Out / Break Start / Break End
- ActionRecord creation with source and snapshot fields
- Kiosk session lock on the Check Station app session
- Secure owner/staff password reauthentication to exit kiosk
- Tenant isolation for all kiosk data

The real kiosk loads the `KioskDesign` config alongside the existing behavioral configuration and participant data. The shared renderer applies the visual design. Attendance logic remains in the existing `attendance/services.py` and `attendance/views.py` code paths — it is not duplicated or moved into the builder.

---

## Security / Tenant Isolation

| Requirement | Detail |
|---|---|
| Tenant scoping | `KioskDesign.organization` FK. All queries filter by the authenticated user's organization. |
| Cross-workspace access | Forbidden. A request from Organization A must never read or write Organization B's kiosk design. |
| Media file scoping | Upload paths include `organization_id`. Storage directories are tenant-scoped. |
| JSON validation | Server validates all config keys, value ranges, preset identifiers, and string lengths. No arbitrary CSS, HTML, or script values accepted. |
| Image validation | Upload endpoint validates file type (reject non-images), enforces size limits, and runs optimization before storage. |
| Builder does not bypass session security | The builder does not lock the kiosk session, does not create ActionRecords, and does not bypass authentication. |
| Builder fake content is mutation-free | Card density testing uses fake data and local UI state only. No attendance API mutations. |
| Permanent deletion | Tenant deletion removes all `KioskDesign` rows, logo files, background files, and kiosk media directories for that organization. |

---

## Customer Staff Permissions

**Intentionally deferred.**

Who may edit or launch kiosks among customer workspace roles (owner, admin, staff) is intentionally deferred until the customer admin/staff permission model is designed as a separate product/security stage.

Do not invent permanent owner-only or staff-edit rules as part of this architecture. During initial implementation, use whatever access level is consistent with the current kiosk launch permissions, and note that this will be refined when the WorkspaceStaffAccount capability matrix is designed.

---

## Backward Compatibility

### Superseded assumption

DEC-012 states: "Kiosk branding is limited to colors, optional logo, title, and basic theme choices. No arbitrary CSS or page-builder."

The Kiosk Builder described here is **more extensive** than "basic theme choices" but is still **not a page-builder**. All customization is constrained (presets, bounded drag areas, curated options). DEC-012's underlying intent — no arbitrary CSS, no page-builder — is preserved. The scope of "controlled options" is expanded to include the builder described in this document.

### Migration from current kiosk themes

Current Groups have a `kiosk_theme` field with values `classic` or `modern`.

Migration path:

1. Create a `KioskDesign` row for every existing Group.
2. Map `classic` to a default config with light neutral colors, standard font, no logo, no background image.
3. Map `modern` to a default config with dark colors, modern font, no logo, no background image.
4. Copy `kiosk_title` into the Header title text. Copy relevant display text into appropriate config fields.
5. The kiosk start API reads from `KioskDesign` if it exists, falling back to old fields temporarily.
6. After migration is validated, the old `kiosk_theme` field and related CSS classes (`kiosk-theme-classic`, `kiosk-theme-modern`) are retired in a cleanup step.

**Behavioral fields** (`kiosk_mode`, `kiosk_input_field_*`, `kiosk_list_show_*`, `kiosk_return_delay_seconds`, etc.) remain on Group. They are not moved into the visual config unnecessarily.

---

## Implementation Stages

Recommended meaningful, testable implementation chunks. These are not micro-tasks.

### Stage 1 — Backend data and media foundation

- `KioskDesign` model, migration, admin registration
- Data migration from old `kiosk_theme`/`kiosk_title` to default `KioskDesign` rows
- GET/PUT API endpoints for Group kiosk design
- Config JSON schema validation
- Logo and background image upload, optimization, replacement-deletion
- Permanent tenant-deletion integration
- Preset registry and list API endpoint
- Backend tests: model, API, media lifecycle, tenant isolation, validation

### Stage 2 — Shared responsive renderer + theme retirement

- Extract a shared `KioskRenderer` component from `GroupKioskScreen`
- Renderer accepts config as props and applies visual design via inline styles / CSS custom properties
- Renderer supports two modes: editor (builder canvas), live
- Preset CSS for Main layouts, buttons, inputs, cards
- Kiosk start API returns design config from `KioskDesign`
- Real kiosk uses the new renderer — verify no regression in attendance behavior
- Retire old `kiosk-theme-classic` / `kiosk-theme-modern` CSS after verification

### Stage 3 — Builder UI core

- Builder page with floating editor and live canvas
- Always-on Header / Main / Footer shell
- Automatic responsive section heights (not divider drag)
- Shared color picker component (picker + hex + swatches)
- Shared text style editor (font, size, color, effects)
- Background mode selection (solid / gradient / image) per section
- Input templates (Input mode) / Card layout & style (Card mode)
- Footer one-line text editor with alignment
- Footer independent image with left/center/right placement
- Undo/Redo system with gesture coalescing
- Save/Cancel with unsaved-changes warning
- Minimize for unobstructed canvas inspection

### Stage 4 — Header editing + media manipulation

- Logo upload with size control (alignment presets; no free drag)
- Header content alignment (left / center / right)
- Responsive bounds enforcement
- Main background image upload, pan/zoom, overlay
- Pan/zoom constraints (coverage guarantee)
- Font library loading

### Stage 5 — Workspace integration + Card density testing

- GroupDetailScreen: Kiosk Settings / Edit Kiosk Design / Launch Kiosk (no Preview)
- Card-mode fake participant counts: 6 / 12 / 20 / 50 / 100 (builder-only)
- Full kiosk regression testing (real kiosk still works correctly with new renderer)
- Polish pass across all stages

---

## Deferred Decisions

Items explicitly NOT finalized. They must be resolved during implementation or in a follow-up design pass. Do not silently convert these into permanent decisions.

| Item | Status |
|---|---|
| Exact Header/Footer min/max height percentages | Centralized in renderer; still tunable |
| Exact font library (which fonts, how many) | 6 self-hosted faces; `open_sans`/`lato` kept as saved-ID aliases |
| Fake Builder participant count options | Confirmed: 6 / 12 / 20 / 50 / 100 (builder-only; default 12) |
| Exact Main layout preset names and count | Conceptual examples given; final list is an implementation/UI decision |
| Exact button/input/card preset names and count | TBD |
| Exact optimized image dimensions and quality settings | Practical targets will be tuned; current `core/images.py` values are a starting point |
| Future Event model relationship to KioskDesign | OneToOne FK will be added when Event is implemented; exact Event model design is separate |
| Customer WorkspaceStaffAccount builder permissions | Deferred to the admin/staff permission model design |
| Future native Mac/iPad app kiosk rendering | Architecture supports it (responsive design, shared config), but native implementation is out of scope |
| Font hosting strategy | Self-hosted Latin woff2 with the renderer; no kiosk Google Fonts CDN |
| Color picker component choice | Native picker + hex + swatches; no extra library |
| Undo/redo history size cap | 60 in the editor; still tunable |

---

## Non-Goals

The following are explicitly **not part of this architecture** and must not be introduced:

- Full Canva/Figma-style free-form editor
- Arbitrary dragging/positioning of Main content elements
- Arbitrary layer/z-index system
- Reusable kiosk template library
- Copying designs between kiosks
- "Save as template" feature
- Separate desktop/tablet/phone design variants
- Autosaved drafts (localStorage, sessionStorage, or server-side)
- Customer-editable arbitrary component CSS
- Unlimited Header/Footer resizing
- Multiple Header logos
- Multiline Header title
- Arbitrary CSS, HTML, or script injection via the config JSON
- General-purpose workflow engine or automation inside the builder

---

## Consistency

This document must remain consistent with:

- [PRODUCT.md](./PRODUCT.md) — product behavior and kiosk ownership rules
- [ARCHITECTURE.md](./ARCHITECTURE.md) — tenant/person foundation and Group/Event kiosk ownership
- [DECISIONS.md](./DECISIONS.md) — confirmed decisions (this document supersedes the DEC-012 limited-theme assumption)
- [TERMINOLOGY.md](./TERMINOLOGY.md) — canonical terms
- [MVP.md](./MVP.md) — scope boundaries
- [SECURITY.md](./SECURITY.md) — session isolation, kiosk lock, tenant isolation, permanent deletion

When this document and another authoritative file conflict, stop and resolve the conflict explicitly.

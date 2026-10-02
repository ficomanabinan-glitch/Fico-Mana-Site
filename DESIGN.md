---
name: FICO MANA
description: The incumbent photography-first studio workspace, recorded from the implemented system.
colors:
  primary: "#0500D0"
  staff-primary: "#8FA0FF"
  staff-primary-foreground: "#11131B"
  staff-highlight: "#C4CEFF"
  focus: "#A5B4FC"
  studio-surface: "#222222"
  foreground: "#FFFFFF"
  staff-muted: "rgb(255 255 255 / 0.65)"
  public-muted: "rgb(255 255 255 / 0.65)"
  border: "rgba(255, 255, 255, 0.1)"
  portal-background: "#181819"
  portal-surface: "#1F1F21"
  portal-raised: "#242427"
  portal-muted: "#AAAAB1"
  extra-selection: "#E6C98B"
  destructive: "#DC2626"
typography:
  display:
    fontFamily: "Cormorant Garamond, Georgia, serif"
    fontSize: "clamp(2.25rem, 1.75rem + 2vw, 3.25rem)"
    lineHeight: 1.1
  page-title:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "clamp(1.75rem, 1.35rem + 1.5vw, 2.5rem)"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  h2:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "clamp(1.5rem, 1.25rem + 1vw, 2rem)"
    lineHeight: 1.2
  card-title:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "1.25rem"
    lineHeight: 1.25
  body:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "1rem"
    lineHeight: 1.6
  small:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "0.875rem"
    lineHeight: 1.5
  caption:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "0.75rem"
    lineHeight: 1.5
  label:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "0.06em"
  mono:
    fontFamily: "Geist Mono, monospace"
    fontSize: "0.75rem"
    lineHeight: 1.5
rounded:
  card: "1rem"
  control: "0.625rem"
  photo: "12px"
  pill: "999px"
  public-legacy: "0rem"
spacing:
  "1": "0.25rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "6": "1.5rem"
  "8": "2rem"
  "12": "3rem"
  "16": "4rem"
  "20": "5rem"
  card: "clamp(1rem, 0.75rem + 1vw, 1.5rem)"
  section: "clamp(3rem, 2rem + 4vw, 5rem)"
components:
  staff-button-primary:
    backgroundColor: "{colors.staff-primary}"
    textColor: "{colors.staff-primary-foreground}"
    typography: "{typography.small}"
    rounded: "{rounded.control}"
    height: "44px"
  staff-button-ghost:
    textColor: "rgb(255 255 255 / 0.7)"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    height: "44px"
  staff-input:
    backgroundColor: "rgb(255 255 255 / 0.06)"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "44px"
  staff-panel:
    backgroundColor: "{colors.studio-surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.card}"
  portal-button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "10px 18px"
    height: "44px"
  portal-photo:
    rounded: "{rounded.photo}"
  portal-navigation:
    rounded: "{rounded.card}"
    padding: "4px"
---

# Design System: FICO MANA

## Overview

**Creative North Star: "The Photography Workspace"**

This is a descriptive record of the incumbent FICO MANA system, not a replacement visual direction. Photography leads the public site and private portal; dark surfaces, restrained blue accents, and serif brand moments make room for the photographs. Operational workspaces use clear sans-serif headings, compact metadata, and rounded containers.

Keep the established identity and owner-approved assets. The public experience introduces the studio; staff screens organize high-volume production; the portal gives one client a focused photo workspace. These contexts share a visual family but do not use an identical density or accent treatment. New patterns should clarify work, not add decorative dashboard furniture.

**Key Characteristics:**

- Photography remains the visual evidence.
- Dark tonal layers with blue and lavender interaction accents.
- Rounded staff and portal controls with even spacing.
- Compact operational information with explicit next actions.
- Clear client language and contextual recovery.

Extraction authority: `app/globals.css`, `app/layout.tsx`, `lib/admin-ui.ts`, `components/dashboard-sidebar.tsx`, and `components/portal-workspace.module.css`. This document records source values as of 1 October 2026. It is not an accessibility conformance or production-readiness certificate. The sidecar's illustrative tonal ramps are not shipped runtime tokens.

## Colors

The palette is charcoal and off-black, with deep studio blue in the public/portal world and a softer lavender-blue in staff workspaces.

Runtime extraction keeps source values unchanged: `app/globals.css` defines `--fico-staff-surface` (`#222222`), `--fico-staff-primary` (`#8fa0ff`), `--fico-staff-primary-foreground` (`#11131b`), `--fico-staff-primary-hover` (`#aebaff`), `--fico-staff-highlight` (`#c4ceff`), and `--fico-focus` (`#a5b4fc`). Shared staff helpers consume the corresponding `staff-*` color utilities, including the existing 60% focus border and 40% focus ring. The `.admin-console` primary/accent/sidebar aliases retain their staff scope.

`--fico-portal-primary` retains studio blue (`#0500d0`) independently of staff `--primary`. The portal module's existing Editorial Light Table overrides keep local `--portal-action` (`#1b16dc`) and `--portal-action-hover` (`#2b25ef`) for current-stage and primary actions, including onboarding; they do not replace the studio-brand value used by add-on selection and policy checkboxes. `--portal-focus` consumes the shared `--fico-focus` value, while the existing onboarding outline and photo-selection highlight keep their distinct values. These source tokens describe the implemented cascade rather than introducing a new palette.

### Primary

- **Studio Blue** (`primary`): public and portal main actions, current portal stage, and established brand accent.
- **Staff Lavender Blue** (`staff-primary`): the staff scope overrides the primary accent for readable filled controls on charcoal. Use its dark foreground for contrast.
- **Pale Lavender Highlight** (`staff-highlight`): staff eyebrow labels and photo-selection emphasis. The focus token supports a visible outline.

### Secondary

- **Warm Extra Selection** (`extra-selection`): paid extra-photo selection in the portal, distinguishable from included lavender selections.

### Neutral

- **Studio Charcoal** (`studio-surface`): staff shell and panels.
- **Portal Ink / Surface / Raised**: increasingly raised private-photo surfaces without turning them into bright generic cards.
- **White / Staff Muted / Portal Muted**: readable hierarchy for primary information and metadata. The staff muted floor is already applied to legacy low-opacity utility classes; do not judge those classes without their effective scoped styles.
- **Quiet White Border**: boundaries and divisions, not a substitute for content hierarchy.

Status meanings are textual as well as colored: green/emerald for confirmed or successful state; amber for review/warning; red for rejection/failure; blue for completed-session status. A completed shoot is not a delivered photograph. Preserve the established finance meaning: revenue blue, expenses red, profit yellow. Do not turn static configuration descriptions into green health claims.

**The Known State Rule.** Unknown, loading, or failed evidence must never be painted as zero, healthy, approved, or delivered.

## Typography

**Display Font:** Cormorant Garamond with Georgia/serif fallback, for the established brand and editorial moments.

**Body Font:** Geist with Arial/sans-serif fallback, for workspaces, controls, and instructions.

**Label/Mono Font:** Geist Mono for identifiers and filename/reference metadata where it aids matching. Do not use it as the default reading face.

The frontmatter records the shared global scale. Weights remain component-specific where the source does not establish a universal weight. The portal uses a deliberate compact local scale, including 28px main headings, 13px descriptions, and 11px controls; do not silently normalize it to staff typography. Labels are compact and tracked; main operational headings are sentence case and lightly tightened.

**The Reading Hierarchy Rule.** Place the task and client identity above reference metadata. Keep explanatory sentences in normal case; reserve uppercase for short labels.

## Layout

Use the existing quarter-rem spacing rhythm and fluid card/section padding. Group information by the work the user needs to do. Staff content uses a persistent desktop sidebar (260px) and a scrollable main workspace; below the existing medium breakpoint the navigation becomes an explicit mobile menu rather than a squeezed desktop rail.

The portal shell is capped at 1840px with 52px total desktop margin. The photo workspace uses a gallery plus a sticky large preview on desktop, five thumbnail columns at its wide breakpoint, fewer columns at intermediate widths, and two columns on phones. Its 900px breakpoint changes interaction layout; it is not simply the staff breakpoint.

The public booking wizard uses a maximum-width workspace, vertically stacked mobile actions, a sticky desktop summary/calendar where useful, and explicit package-dependent steps. Ordinal progress numbers are presentation labels, not the internal form-state IDs.

Client Workspace uses identity and booking selection first, one prioritized next action, a lifecycle summary, and grouped progressively loaded sections. Summaries link into specialist workflows with the booking context preserved. It is a client record, not a duplicate editor console. Similar client identities remain separate until authoritative identity data resolves them.

## Elevation & Depth

Depth is primarily tonal and bounded by quiet borders. Staff panels add a soft structural shadow; staff cards use a slight tonal gradient and inset edge. The portal preview adds a subtle surround/inset edge, while its sticky header uses translucent ink and blur. Preserve these incumbent effects rather than introducing a new glass or high-gloss world.

### Shadow Vocabulary

- **Staff panel:** `0 8px 32px rgba(0,0,0,0.35)`; separates operational containers from the charcoal shell.
- **Staff card edge:** `inset 0 1px 0 rgba(255,255,255,0.04)`; a restrained tonal boundary.
- **Portal preview:** `0 0 0 5px rgba(255,255,255,0.018), inset 0 1px rgba(255,255,255,0.05)`; encloses the photograph without competing with it.

## Shapes

The shared staff/portal system uses softly rounded cards and smaller rounded controls; photographs have their own smaller radius and selected marks are circular. Pill filters are a distinct selection pattern. Keep focus rings outside the control and do not clip them behind overflow.

The global legacy public radius remains square in parts of the incumbent implementation. This is recorded as implementation debt, not a new square-corner brand rule. The owner's commitment is rounded corners. Introduce or refine new public controls consistently with that commitment, but do not use documentation to claim the entire existing public site has already been migrated.

## Components

### Buttons

Staff primary actions use lavender fill, dark text, 44px minimum height, and a compact rounded shape. Ghost actions use a quiet border, uppercase short labels, and hover contrast. Portal primary actions retain deep studio blue, white text, and a slight inset edge. Use one clear next action per recommendation; supporting actions remain visibly secondary. Receipt upload is a semantic keyboard-operable button with a selected filename, not an unlabeled clickable container.

Retain visible focus, hover, active, disabled, and pending states. Disabling an action must leave its reason understandable. Focus is not communicated by color alone. Motion is optional feedback; reduced-motion must keep state transitions and focus usable.

### Chips

Filters use compact grouped pills with text and an explicit selected state. Status badges are non-interactive unless they actually navigate. Do not reuse a status color to imply success for a static description.

### Cards / Containers

Use the shared staff panel/card styles for operational summaries and grouped detail. A dashboard begins with current work and blockers before summary metrics. Client Workspace keeps a recognizable client/booking header and independent evidence sections so a secondary read failure does not erase the main record.

### Inputs / Fields

Use associated visible labels, established dark surfaces, quiet borders, and a visible focus ring. Staff controls have a 44px minimum target; public fields preserve their current compact form rhythm. Place validation beside the task it blocks and use a live alert for failures. Do not expose backend implementation words where a customer-friendly action works.

### Navigation

Preserve active-state contrast, keyboard access, mobile menu semantics, and capability gating. Global client search is one reachable entry point; a result opens its unified client context rather than requiring a second name search in another module. The workspace exposes specialist destinations without duplicating their protected actions.

### Tables, lists, and lifecycle

Use compact sans-serif rows, quiet dividers, readable metadata, and horizontal overflow only for genuinely tabular content. On phones, essential identity/status/actions must remain usable without inspecting a desktop-width table. Lists show known states in human language; lifecycle stages explain status rather than inventing transitions or timestamps.

### Loading, empty, error, and success

Match skeletons to the eventual layout and reserve image proportions. An authoritative empty result explains what can be done next. A failed read identifies the unavailable section and offers a retry; it is not an empty state. Success confirms what was actually saved and points to the next known workflow. Portal submission remains read-only unless staff explicitly reopens it, and sample mode never implies a real booking mutation.

## Do's and Don'ts

### Do:

- **Do** keep FICO MANA's existing name, imagery, dark surfaces, and blue/lavender interaction family.
- **Do** use the shared rounded card/control tokens for new staff and portal patterns.
- **Do** show the client, booking, known state, next action, and recovery in the same context.
- **Do** preserve explicit photo selection, large desktop preview, mobile gestures, and package-specific limits.
- **Do** verify labels, keyboard focus, contrast, touch targets, and representative phone/tablet/desktop layouts in the rendered flow.
- **Do** keep loading and failed evidence distinct from empty or completed work.

### Don't:

- **Don't** replace the incumbent photography-led identity with a generic SaaS dashboard or new decorative visual world.
- **Don't** use color alone for status, selection, validation, or focus.
- **Don't** assume booking completion, an uploaded original, or a ready portal means enhanced files were delivered or downloaded.
- **Don't** hide essential mobile actions behind hover or off-screen desktop controls.
- **Don't** move protected data or mutate workflow rules to make a screen appear simpler.
- **Don't** treat the illustrative sidecar ramps or this documentation as production health or accessibility proof.

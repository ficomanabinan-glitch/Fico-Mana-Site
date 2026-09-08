# FICO MANA Client Portal — Final Frontend Design System

This document is the source of truth for the client-facing FICO MANA portal. The portal is a private photography experience first and a software interface second. Admin and editor tools may remain denser; the client portal should stay calm, visual, editorial, and easy to understand.

## 1. Product design principles

### Photography first

The photograph is the primary visual object. Interface chrome must recede around it. Avoid card-on-card dashboards, oversized utility panels, permanent sidebars, and decorative effects that compete with the image.

### Progressive disclosure

Secondary project information lives in the **Overview** drawer. Package, shoot date, payment information, QR access, and other metadata remain available without consuming gallery space.

This applies Hick's law: show clients only the choices required for the current step.

### Golden-ratio composition

For desktop photo-selection views, use the golden ratio as a soft proportional guide rather than a literal rule for every measurement:

- Gallery/contact sheet: approximately **61.8%** of the usable workspace.
- Sticky preview: approximately **38.2%**.
- CSS ratio token: `1.618`.

The ratio is also a guide for heading/body hierarchy and macro composition, but never at the expense of legibility or responsive behavior.

### 8-point grid + Fibonacci macro rhythm

Base interface spacing follows an 8px grid. Larger editorial gaps use a Fibonacci-inspired sequence that creates a naturally expanding rhythm:

- 8px
- 13px
- 21px
- 34px
- 55px
- 89px

Do not mechanically force every margin into this sequence; use it for major grouping and page rhythm.

### Gestalt principles

Use:

- **Proximity** to group related metadata without extra containers.
- **Similarity** for repeated photo tiles, controls, and workflow states.
- **Common region** only when a visible boundary actually clarifies a section.
- **Continuity** in the Photos → Free Prints → Add-ons → Review workflow.
- **Figure/ground** so photographs remain visually dominant over controls.

### Fitts's law

Interactive mobile controls must provide reliable touch targets. Aim for at least 44px minimum target height/width for primary controls, step navigation, icon buttons, and drawer triggers.

### Visual hierarchy

Priority order during selection:

1. Photographs
2. Current workflow step
3. Selection progress
4. Primary action
5. Client identity
6. Secondary project metadata

On mobile, the project/booking ID is intentionally hidden in the compact sticky state before any of the first five priorities are sacrificed.

## 2. Typography

Use the fonts already configured in FICO MANA. Do not introduce a competing type family without a design-system revision.

### Cormorant Garamond

Use for editorial/display moments:

- client name
- gallery title
- final-delivery title
- large photography headings

Keep weight restrained, usually 400–500, with slightly negative tracking.

### Geist

Use for:

- navigation
- controls
- body copy
- labels
- payment information
- status text

### Geist Mono

Use selectively for technical metadata:

- booking/project IDs
- filenames
- machine-like identifiers

Do not use mono for ordinary paragraphs.

## 3. Color and surfaces

The client portal uses dark editorial minimalism.

Core tokens:

- Background: `#111111`
- Primary surface: `#171717`
- Raised surface: `#1C1C1C`
- Paper / primary text: `#F4F2EE`
- Muted text: approximately 50% paper opacity
- Border: `rgba(255,255,255,.08)`
- FICO MANA indigo: `#0500D0`
- Soft accent: `#C4CEFF`

Rules:

- Indigo is an accent, not a large decorative fill.
- Avoid heavy gradients and excessive glow.
- Avoid overusing glassmorphism.
- Use subtle borders, spacing, and typography before adding another container.

## 4. Component architecture

The portal continues to use the existing stack:

- Next.js
- React
- Tailwind CSS
- shadcn-style components / Base UI primitives
- Lucide icons
- Motion (`framer-motion` in the current repository)

Do **not** add MUI, Ant Design, Chakra, Mantine, PrimeReact, or another competing visual component framework to the client portal.

The internal FICO MANA layer should own visual identity. Reusable client-facing patterns should conceptually map to:

- `PhotoTile`
- `PhotoPreview`
- `WorkflowStep`
- `SelectionProgress`
- `OverviewDrawer`
- `EditorialHeading`
- `MetadataLabel`
- `DeliveryGallery`
- `ExpiryNotice`

Existing production components may keep their current names; the point is to preserve a consistent design role.

## 5. Workflow

The business workflow remains:

1. **Photos** — select included enhanced photos and editing preference.
2. **Free Prints** — allocate package-included prints.
3. **Add-ons** — optional paid add-ons, respecting the existing maximum type rules.
4. **Review** — confirm selections, acknowledgment, and final submission.

The redesign must never change package rules, pricing calculations, selection limits, authentication, or submission semantics merely for visual convenience.

## 6. Desktop behavior

- Full-width editorial header.
- Gallery/contact sheet is the primary work area.
- Sticky large preview remains visible while the contact sheet scrolls when viewport size permits.
- Approximately 61.8/38.2 gallery-to-preview composition.
- No permanent project-information sidebar.
- Overview opens as a drawer.
- Workflow navigation is a restrained editorial strip, not four large dashboard cards.

## 7. Mobile behavior

### Expanded state

The header displays:

- FICO MANA
- client name
- booking/project ID
- selected count
- Overview trigger

The four workflow steps appear immediately below as part of the same sticky navigation system.

### Compact scroll state

When scrolling:

- project/booking ID fades and collapses
- client name remains
- selection count remains
- all four workflow steps remain visible
- header height decreases
- step strip visually docks to the header

Implementation should prefer `position: sticky`, CSS transitions, and `IntersectionObserver` rather than per-pixel React scroll state.

Account for `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`.

## 8. Motion

Motion must communicate state, not decorate the page.

Timing tokens:

- Fast: 160ms
- Normal: 240ms
- Slow: 360ms
- Preferred ease: `cubic-bezier(.2,.8,.2,1)`

Appropriate uses:

- compact/expanded header transition
- active workflow-step movement
- final-deliverables reveal
- drawer opening
- subtle photo-tile hover feedback

Avoid:

- constant floating animation
- excessive glow
- large parallax
- animations that delay selection
- motion that causes layout jump

Respect `prefers-reduced-motion`.

## 9. Accessibility

- Preserve semantic buttons and links.
- Provide visible `:focus-visible` treatment.
- Do not communicate selected state by color alone.
- Keep text contrast appropriate against dark backgrounds.
- Images require meaningful `alt` labels where possible.
- Icon-only controls require accessible names.
- Dialog/sheet focus trapping and keyboard behavior should remain with the accessible primitive.
- Workflow state should expose `aria-current="step"` or equivalent.

## 10. Portal expiry — final policy

The final-gallery access countdown must **not** start from:

- first portal visit
- first selection-ready email
- selection submission
- page refresh
- first download

It starts only after the editor uploads/releases the **final deliverables** and the editing workflow reaches delivery.

Canonical flow:

`Selection portal → client submits → editor works → final files uploaded → DELIVERED → expiry starts → final-gallery expiry appears`

The start timestamp is immutable for that delivery window. Reopening or extending access must be an explicit staff action, not an accidental side effect of another email or page visit.

## 11. Quality bar

A client-facing change is not finished until it is checked at minimum at:

- 320px
- 360px
- 375px
- 390px
- 414px
- 430px
- tablet
- 1280px desktop
- 1440px+ desktop

Verify:

- no horizontal overflow
- no navigation label wrapping
- long client names truncate safely
- preview/gallery proportions remain useful
- sticky layers do not overlap dialogs
- keyboard focus remains visible
- reduced motion works
- desktop and mobile preserve all production workflow logic

## 12. Design guardrails

Future frontend work should preserve this direction:

- photography over dashboard chrome
- hierarchy over decoration
- whitespace over nested cards
- one restrained accent over many competing colors
- progressive disclosure over permanent utility panels
- consistent tokens over one-off magic numbers
- accessible motion over spectacle
- business logic stability over cosmetic rewrites

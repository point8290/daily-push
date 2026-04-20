# Daily Push — Design System

> Build the habit. Make the push daily.

Daily Push is a personal upskilling platform. A user signs up, describes a goal in their own words, and the app (1) asks a few clarifying questions, (2) decomposes the goal into prerequisite-ordered learning topics and concept nodes, (3) picks one thing to study each day, (4) tracks confidence and spaced-repetition reviews, and (5) surfaces progress through streaks, heatmaps, and a live knowledge map.

This folder contains the complete brand + UI foundation for designing across the Daily Push product.

---

## Index

| Path | What it is |
|---|---|
| `README.md` | This file — product context, content rules, visual foundations, iconography |
| `colors_and_type.css` | All design tokens: colors, type, spacing, shadows, radii, motion |
| `SKILL.md` | Claude-Skill front-matter for portable use |
| `assets/` | Logos (mark, wordmark, inverse), icons, visual artifacts |
| `preview/` | Design-system preview cards (rendered in the Design System tab) |
| `ui_kits/app/` | React recreations of the Daily Push web app |

## Sources explored

- **Codebase** (read-only, mounted): `frontend/` — Vite + React 18 + TypeScript + Tailwind 3, react-router-dom v6, `@xyflow/react` for the knowledge map. Read files: `App.tsx`, all of `src/pages/*.tsx`, `src/components/ReflectionModal.tsx`, Tailwind config (default, no theme extensions). No external Figma was provided.

---

## Product context

Daily Push is **a single web product** (marketing + app live in the same frontend today). Core surfaces:

1. **Goal intake** (`/goals/new`) — plain-text goal input + clarifying-question Q&A flow.
2. **Goal detail** (`/goals/:id`) — shows structured goal, skill gaps, learning topics, concept nodes; confirm-or-correct flow before the plan goes active.
3. **Today** (`/`) — the daily driver: picks today's concept node, runs a timeboxed study session (15/30/60m), rates confidence 1–5, supports an optional "explain it back" AI check.
4. **Map** (`/map`) — full-bleed knowledge-graph visualization of concept nodes with depth filters (surface → advanced) and a side panel for details.
5. **Goals index** (`/goals`) — list of all goals with status + primary badge.
6. **History** (`/history`) — streak, total sessions, 90-day heatmap.
7. **Settings** (`/settings`) — schedule, timezone, digest time, weekly summary toggle.
8. **Login / Register** (`/login`) — split-toggle auth card.

Supporting: a `ReflectionModal` that surfaces when a reflection prompt is due (polled 3s after load).

---

## Content Fundamentals

**Voice: calm coach, second-person.** The app talks *to* the user, never about them. "Tell us your situation." "This looks right — start my plan →." "Rate your understanding." Never corporate, never motivational-speaker hype.

**"We" means the product, "you" means the learner.** e.g. *"We'll break each topic into prerequisite-ordered concept nodes"* / *"You finished every node in your learning plan."*

**Casing:** Sentence case throughout. Never Title Case for buttons or headings. Headings are declarative phrases, not marketing capitalised labels. Examples from the codebase:
- `"What are you trying to achieve?"` (heading)
- `"A few quick questions"` (heading)
- `"Something wrong or missing? Correct it →"` (ghost CTA)
- `"Build my plan →"` (primary CTA)
- `"Rate your understanding"` (eyebrow)

**Punctuation & length:** Short sentences. Ems dashes (—) for asides. Trailing `→` arrow on forward CTAs (`Continue →`, `Build my plan →`, `Start 30min session →`). Ellipses for async loading only (`"Reading your goal..."`, `"Identifying skill gaps..."`, `"Building your learning path..."`).

**Tone:** Encouraging but honest. *"Almost done!"*, *"All available nodes studied!"*, *"Keep going."*, *"Good work, {firstName}."* Success messages acknowledge effort: *"That took real commitment."* Never "Awesome!!!" or "You crushed it!" — one notch down.

**Emoji:** Used sparingly as functional accents, never as decoration:
- `🏆` — one-off goal-complete celebration
- `🔥` — day streak (implicit via amber color more than the glyph)
- `✓` — checkmarks via SVG, not emoji

**Empty states are warm, not apologetic:** *"No goals yet. Tell us what you want to achieve and we'll build your learning path."* Never "You don't have any…".

**Loading copy is informative:** Instead of "Loading…", say what is happening — *"Extracting your profile"*, *"Classifying your goal"*, *"Building your learning path"*. This keeps 10–20s AI waits feeling productive.

---

## Visual Foundations

### Overall vibe

**Quiet, focused, slightly studious.** Light slate canvas, one confident dark nav on top, white cards with thin borders and barely-there shadows. Color is used to *mean* things (status, confidence, longevity), not to decorate. No gradients as decoration anywhere — the one exception is the goal-detail hero (`sky-600 → indigo-600`) which marks the "this plan is yours" moment. Otherwise everything is flat.

### Color

- **Primary:** `sky-600` for CTAs, progress fills, focus rings (via `sky-400`), hover states step to `sky-700`.
- **Ink / nav:** `slate-900` for the top nav (white text, `sky-400` active link) and for body copy.
- **Canvas:** `slate-50` app background; `#ffffff` surfaces.
- **Semantic status palette** — learned during code read:
  - `emerald` → done / high confidence / high longevity
  - `sky` → available / next / primary action
  - `amber` → in progress / streaks / confidence 3 (getting there)
  - `orange` → review due (spaced repetition)
  - `indigo` → planning / decomposing (transient system state)
  - `red` → barely-recall / errors
  - `slate` → locked / disabled / muted

### Type

- **Display (`Plus Jakarta Sans`, 800/700)** — goal titles, page headings, hero copy. Slightly warmer than Inter; feels human.
- **Body (`Inter`, 400/500/600/700)** — everything else.
- **Mono (`JetBrains Mono`)** — tokens, timing, `NN/NN` progress readouts (`12/25`, `18:42`).
- Tracking is tight on display (`-0.02em`) and uppercase eyebrows are wide (`0.12em`). All-caps is *only* used at 12px for eyebrows/captions, never on buttons.

### Spacing & layout

- 4pt grid (`space/1` = 4, `space/2` = 8 … `space/16` = 64).
- App content is a single `max-w-3xl mx-auto` column (`768px`) with `px-4 py-8`. Map breaks out full-bleed.
- Card padding defaults to `20px`–`24px`; nested groups use `16px`.
- Stacks use 16–24px gaps; inline rows use 8–12px.

### Backgrounds & imagery

- **No imagery on marketing/app surfaces** in the current build — pure CSS.
- The goal-detail hero uses a `sky-600 → indigo-600` gradient (the *only* gradient in the product).
- No repeating patterns, no textures, no hand-drawn illustrations.

### Corner radii

- Inputs / chips: `8–10px`
- Buttons: `10–12px`
- Cards: `12–16px`
- Big feature cards (hero, login card): `16–20px`
- Pills / dots / avatars: `999px`

### Borders

- Default `1px solid slate-200`.
- Hover on interactive cards steps up to `sky-200` or `sky-300`.
- Node chips in the Map have `2px` colored borders matching their status.
- Dashed `slate-200` on the "correct your plan" affordance — communicates "optional / add".

### Shadows

Shadows are **whisper-soft** — the brand has a high information density and shadow never fights type.
- `shadow-xs` — 1px 2px at 4% ink — card rest state
- `shadow-sm` — default raised card / login
- `shadow-md` — hovered card, floating tooltips
- `shadow-lg` — modals (ReflectionModal), side panel
- `shadow-focus` — `0 0 0 3px sky-400/25` on focused inputs

### Hover & press states

- **Buttons**: hover darkens primary (`sky-600 → sky-700`), ghost/secondary lightens bg to `sky-50`. No scale on buttons.
- **Cards (clickable)**: border `slate-200 → sky-300` + reveal `shadow-sm`. No translate. 200ms `ease-out`.
- **Nav links**: color-only (`slate-300 → white`, active = `sky-400`).
- **Press (rating)**: selected confidence chip gets a soft `scale(1.05)` and its semantic tint.
- **Focus**: `ring-2 sky-400` (3px soft) — **always visible** for accessibility.

### Motion

Motion is minimal and purposeful.
- `dur-fast` 120ms — button color transitions
- `dur-base` 200ms — hover state transitions, chip selection
- `dur-slow` 400ms — progress bar fill, session-ring stroke sweep
- Easing: `cubic-bezier(.2, .8, .2, 1)` (soft-out) everywhere.
- Spinners: simple border-rotate, no bouncy/elastic physics.
- Reflection modal fades in — no slide, no bounce.

### Transparency & blur

- **Transparency is reserved** for overlays (modal scrim `rgba(15,23,42,0.5)`) and opacity ramps on inactive icons.
- No backdrop-blur anywhere in the codebase — maintain this; it's part of the "quiet" identity.

### Layout rules

- Top nav is **fixed in flow** (not sticky / not fixed-to-viewport) — it's 49px tall, sits flush at the top, then content scrolls under it. Map uses `fixed inset-0 top-[49px]` to claim the remainder.
- Main content column is always centered.
- CTAs are **full-width inside their card** on Today / intake screens. The ink button (`Mark complete →`) and primary sky button (`Start 30min session →`) are the two visual anchors of a session.

### Cards

- White (`#fff`), `1px` border (`slate-200`), `radius-xl` (16px), `shadow-xs`, padding 16–20px.
- Section title uses the eyebrow pattern (`text-xs`, `uppercase`, `tracking-widest`, `slate-400`).
- Value + meta stack: bold title in `slate-900`, description in `slate-500 text-sm`.

---

## Iconography

**Current state of the codebase:** no icon library is installed. Every icon is **hand-rolled inline SVG** or an emoji (used in 2 places: `🏆` on goal-completion, `×` as a close button). The checkmark in "session complete" and the bell/arrow affordances are simple inline `<svg>` with `stroke="currentColor"` at `strokeWidth 2.5`.

**System going forward — pick one.** For this design system we've selected **[Lucide](https://lucide.dev)** as the canonical icon set:

- Matches the codebase aesthetic (2px stroke, rounded line caps, geometric).
- CDN-available, tree-shakeable when installed.
- The existing hand-drawn SVGs (the ✓, the × close button, the chevron nav arrow) match Lucide's style *exactly*, so adoption is drop-in.

> **⚠️ Flagged substitution.** The original codebase ships **no icon system** — I've proposed Lucide as the best fit based on the stroke style already present. Confirm this choice or name your preference; I'll switch.

Usage:
```html
<!-- CDN -->
<script src="https://unpkg.com/lucide@latest"></script>
<i data-lucide="flame"></i>
```

**Emoji** — avoid in product chrome. Allowed in ambient/celebration moments only (goal-completion `🏆`). **Unicode characters** are used for punctuation accents: `·` (center-dot separator), `→` (forward arrow on CTAs), `×` (close).

**Imagery / illustration** — there is none in the current build. Before adding any, ask whether we want a Daily Push illustration voice (I'd recommend: simple line-drawings matching the Lucide stroke, amber/sky accents only).

**The brand mark** (`assets/logo-mark.svg`) is a stacked-chevron "upward push" inside a rounded sky tile — the second chevron sits beneath the first at 55% opacity, implying "again, tomorrow." This is the only brand illustration that exists.

---

## What you'll find in `ui_kits/app/`

High-fidelity React recreations of the main product surfaces:
- `Login.jsx` — split-toggle sign-in / register card
- `TodayDashboard.jsx` — the idle Today state with streak, progress, today's node, review card
- `GoalSetup.jsx` — goal-intake form with quick picks
- `SessionTimer.jsx` — in-session timer + rating screen
- `ConceptNode.jsx` + `MapPreview.jsx` — knowledge-map node and mini-graph
- `HistoryView.jsx` — streak stats + heatmap
- `AppShell.jsx` + `TopNav.jsx` — chrome wrapping the above
- `index.html` — a click-through assembling the kit into the real product flow

These are cosmetic recreations — logic is faked, routing is local state.

---

## Quick-use for AI

Load `colors_and_type.css` and you have every token. Wrap designs in `.p`/`.h1`/`.caption` semantic classes or reference variables directly. For app-surface designs, copy components from `ui_kits/app/` as primitives. See `SKILL.md` for more.

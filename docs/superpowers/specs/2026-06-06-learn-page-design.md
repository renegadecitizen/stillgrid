# Learn page (`/learn`) — design

**Date:** 2026-06-06
**Status:** Approved (brainstorming) — pending implementation plan
**Roadmap item:** Phase 2 #10 ("Learn sudoku" page)

## Goal

Ship a `/learn` page that does double duty:

1. **Teaching asset** — teaches a beginner how to play, then walks up the exact
   technique ladder the grader uses, so a player understands *why* Stillgrid's
   difficulty labels mean what they do.
2. **SEO/GEO content asset** — a unique, crawlable, liftable page that wins
   "how to play sudoku" / "sudoku techniques" / "what is killer sudoku" style
   queries in Google and AI answer engines. This is the reason the page is on
   the roadmap, so the SEO properties are non-negotiable.

For a visual learner the page leans on **animated, lightly interactive diagrams**
rather than walls of text — but every animated concept also exists as prerendered
text so the SEO/GEO value and accessibility survive with JS off.

## Architecture: hybrid static page + progressive-enhancement JS layer

The four existing variant landing pages (`web/public/{classic,killer,jigsaw,xsudoku}.html`)
are pure static HTML + `landing.css` with **zero JavaScript**, copied verbatim by
Vite's `public/` dir and served by `express.static`. `/learn` is the first landing
page that needs JavaScript (the animations), so it diverges in exactly one way:

- **`learn.html` becomes a second Vite entry** — placed in the web root next to
  `index.html` and registered via `build.rollupOptions.input` in
  `web/vite.config.ts`. Vite processes it, injects the hashed module script tag,
  and emits `dist/learn.html` as **fully prerendered static HTML**. All teaching
  copy is authored directly in this HTML, so crawlers and JS-off users get the
  complete content.
- The interactive layer is a **dedicated vanilla-TS widget module** under
  `web/src/learn/` — **not React, not the game's `Grid` component**. Rationale:
  TS-strict + typechecked + linted (passes the existing CI gates), tiny bundle,
  no coupling to game state. It mounts into placeholder elements that already
  contain a static fallback diagram.
- The other four landing pages stay untouched static files in `public/`.

**Why not a full React view in the SPA:** it would be client-rendered and lose
the prerendered-SEO value that put `/learn` on the roadmap. Recovering that needs
real SSR (roadmap #8, multi-day). Rejected.

### Build / output contract

- `learn.html` lives at `web/learn.html` (web root). `vite.config.ts` gains:
  ```ts
  build: { rollupOptions: { input: { main: 'index.html', learn: 'learn.html' } } }
  ```
- `npm run build` emits `dist/learn.html` + a hashed JS chunk for the widget.
- `landing.css` (in `public/`, served at `/landing.css`) is linked by `learn.html`
  for the shared page chrome; learn-specific styles live in a small `<style>` block
  or a co-located CSS file imported by the widget entry.
- The page must render its full content with the script removed (verified by
  reading the built `dist/learn.html`).

## The tutorial widget

A single small reusable renderer, driven by data — no per-technique bespoke code.

### Data model

```ts
type Cell = { given?: number; value?: number; cands?: number[] };
type Highlight = { cells: number[]; kind: 'unit' | 'target' | 'elim' | 'place' };
type Step = { caption: string; grid: Cell[]; highlights: Highlight[] };
type Lesson = {
  id: string;          // e.g. 'naked-single'
  size: 6 | 9 | 16;    // core ladder = 9; Variants & sizes section uses 6/9/16
  steps: Step[];
  interactive?: { stepIndex: number; answerCell: number; answerDigit: number };
};
```

Lessons are authored as plain data (a `lessons.ts` table), keeping the renderer
generic. **The core ladder teaches on the canonical 9×9 board** (the default game).
To keep a full 9×9 from feeling busy, the renderer spotlights just the relevant
unit(s) for a step — the active row/column/box/diagonal/cage is highlighted and
the rest of the grid is dimmed — so the learner's eye lands on the pattern. The
size field still exists because the Variants & sizes section uses smaller/larger
boards (see below).

### Rendering & animation

- Grid rendered as an HTML/CSS grid styled to match the app (Fraunces/Inter,
  cream palette, per-variant accents for the variant section).
- Transitioning between steps animates via CSS transitions: highlight a unit
  (row/col/box/diagonal/cage), fade out eliminated candidates, place a digit.
- Controls: **auto-play** (default, gentle pacing) + **Next / Prev** + **Restart**.
- The current step's `caption` is the teaching text.

### Interactivity (Getting started only)

One or two "your turn" moments: the widget asks "click the cell that must be a 4,"
the learner clicks, the widget validates (correct → place + advance; wrong → gentle
nudge). This is click-to-validate against the lesson data — **no game engine, no
solver**. Kept minimal and only in the intro.

### Accessibility (first-class — must not regress site standards)

- Each diagram is `role="img"` with an `aria-label` summarizing the state; the
  per-step `caption` is announced through an `aria-live="polite"` region (the
  caption is also the full text alternative to the animation).
- `prefers-reduced-motion: reduce` → no motion; the widget jumps to each step's
  end-state on Next, and auto-play is disabled (manual stepping only).
- Controls are real `<button>`s, keyboard operable, visible `:focus-visible` rings.
- Interactive cells are buttons with clear labels; success/failure announced via
  the live region. Colour is never the only signal (highlights also use
  border/weight, eliminated candidates get strikethrough + fade).
- Static fallback (JS off): each placeholder contains the lesson's final-state
  diagram as static HTML + the step captions as an ordered list.

## Content (the ladder)

Five sections. Each technique explicitly names the grader **tier** it defines, so
the page also explains technique-graded difficulty. Treatment column: **A** =
full animated step-through, **S** = static highlighted diagram + caption.

### 0. Getting started — *animated + interactive*
- What a sudoku is; the row / column / box rule; what "one solution" means.
- **Using notes (pencil marks):** what candidates are, when to jot them, and that
  every technique past singles operates on your notes. Calls out that Stillgrid's
  **auto-pencil** fills them for you, and notes/undo are one tap away. (Product tie-in.)

### 1. Beginning — *Easy tier*
- Naked Single (A) — the only candidate left in a cell.
- Hidden Single (A) — the only cell in a unit that can hold a digit.

### 2. Middle — *Medium tier* (all operate on notes)
- Naked Pair (A)
- Hidden Pair (S)
- Pointing Pair (A)

### 3. Advanced — *Hard / Diabolical tier*
- X-Wing (A)
- Swordfish (S), XY-Wing (S), a taste of chains/coloring (S).
- Honest note: these are rare; most graded puzzles never need them.

### 4. Variants & sizes — *what changes beyond the default 9×9 classic*

**Rule variants** (same core logic, different/extra units):
- X-Sudoku — the two diagonals are extra units (A).
- Jigsaw — irregular regions replace the 3×3 boxes; same logic, new unit shapes (A).
- Killer — cages with target sums; intro to cage-sum combination logic (A);
  deeper combos (S). Links to the killer landing page for rules detail.

**Board sizes** (cover only shipped sizes — every link must be playable):
- 6×6 — 2×3 boxes, digits 1–6; a gentle, single-difficulty board (S, small grid).
- 9×9 — the default everything else teaches on (referenced, not re-taught).
- 16×16 — 4×4 boxes, digits 1–16 rendered as 1–9 then A–G (S, large grid). Note
  honestly that 16×16 is currently **Classic and X-Sudoku only** (Jigsaw/Killer
  at 16×16 are not yet available). Best on a larger screen.
- **4×4 is intentionally omitted** — it is not a shipped size, so the page never
  teaches a board a reader can't open. (Revisit if roadmap #13 ships 4×4.)

Each section ends with a one-line "this is what '<Tier>' means on Stillgrid" and a
link to play that tier/variant/size.

## SEO / GEO & site wiring

- **JSON-LD** in `learn.html`:
  - `HowTo` — how to play (steps mirror the Getting-started rules).
  - `FAQPage` — 4–6 Q&As whose `text` matches visible copy **byte-for-byte**
    (Google's match requirement, as done on the variant pages). Candidate Qs:
    "How do I start a sudoku?", "What is a naked single / hidden single?",
    "What do notes / pencil marks do?", "How is sudoku difficulty graded?",
    "What's different about killer / jigsaw / X-sudoku?".
  - `LearningResource` — `learningResourceType: "Tutorial"`, `teaches` list of the
    techniques, `isAccessibleForFree: true`, `inLanguage: "en"`.
  - All blocks validated as parseable JSON.
- **Server route:** add `"learn"` to `LANDING_ROUTES` in `server/src/index.ts`
  (so `GET /learn` sends `dist/learn.html`).
- **`sitemap.xml`:** add `<loc>https://stillgrid.app/learn</loc>`, weekly, priority 0.7.
- **`llms.txt`:** add a `/learn` line under a "Learn" or the "About" section with a
  one-line description.
- **Topbar link:** `web/src/App.tsx` Learn link (`href="#"`, ~line 387) → `href="/learn"`.
- **Variant landing pages:** add a "Learn how to play" link into each page's
  "Try a variant" row (or a small adjacent link), per roadmap #10.
- Title/meta/canonical/OG/Twitter card set like the variant pages. OG image can
  reuse `og-image.png` initially (a dedicated `og-learn.png` is a nice-to-have,
  out of scope for v1).

## Non-goals / YAGNI

- No full playable game on `/learn` (the SPA is for that). Interactivity is limited
  to click-to-validate in the intro.
- No solver/engine integration; all lessons are static authored data.
- No per-variant deep-dive sub-pages (`/learn/killer` etc.) — one page, a Variants
  section. (Could revisit if SEO data justifies it.)
- No dedicated `og-learn.png` in v1.
- No new analytics event names required; if we want engagement signal, reuse a
  generic page interaction later — not in scope here.

## Testing & verification

- **Build:** `npm run build` emits `dist/learn.html` + widget chunk; verify the
  built HTML contains the full teaching text and all JSON-LD with the script removed.
- **JSON-LD:** parse each `<script type="application/ld+json">` block; assert
  `FAQPage` answer `text` matches the visible `<p>` copy exactly.
- **Widget unit tests (vitest):** lesson-data integrity (every step has a caption;
  highlight cell indices in range; interactive `answerCell` valid); step
  advancement logic; reduced-motion path jumps to end-state.
- **Server:** `GET /learn` returns the HTML (route ordering: static → api → landing
  routes → SPA fallback, unchanged).
- **A11y:** keyboard-operate controls; confirm `aria-live` announces captions;
  confirm reduced-motion disables auto-play; Lighthouse a11y stays 100.
- **CI gates (per project memory):** server build+test, web build+test+lint all green
  before any push.

## Open items deferred to the plan

- Exact lesson grids (the per-step 9×9 states for each core technique, plus the
  6×6 and 16×16 example boards in the sizes section) — authored during
  implementation; the renderer and data shape are fixed here.
- Final FAQ question wording.
- Whether the Variants section reuses each variant's accent colour per sub-block
  (nice-to-have; default to the page's neutral accent).

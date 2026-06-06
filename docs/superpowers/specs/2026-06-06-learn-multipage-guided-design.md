# Learn — multi-page split + guided first game — design

**Date:** 2026-06-06
**Status:** Approved (brainstorming) — pending implementation plan
**Builds on:** `docs/superpowers/specs/2026-06-06-learn-page-design.md` (the single-page Learn, already shipped on branch `learn-page`)

## Why

User feedback after viewing the live single `/learn` page:

1. The lesson grid didn't render the bold 3×3 box borders the real game has. **(Already fixed** — `feat(learn): bold 3×3 box dividers`. Out of scope for this doc.)
2. One long page is good for SEO but overwhelming for a beginner. Split into focused pages, lead with a **guided first game** that holds a new player's hand, and push techniques/variants behind their own pages.

## Goal

Restructure Learn from one page into **four focused, cross-linked, prerendered pages**, and add a **guided first-game** interactive on the front page. Preserve the SEO/GEO properties (prerendered HTML, JSON-LD, JS-off fallback) and the first-class accessibility of the existing widget.

## Pages & content

| URL | Title | Content |
|-----|-------|---------|
| `/learn` | How to play | The goal, the rules, notes/pencil-marks, the **guided first game** (hero), and the naked-single + hidden-single animated diagrams framed as "the two moves you just used." |
| `/learn/core` | Core techniques | Naked pair, hidden pair, pointing pair (the "Medium" tier). |
| `/learn/advanced` | Advanced techniques | X-Wing, then Swordfish / XY-Wing / chains ("Nightmare"). |
| `/learn/variants` | Variants & sizes | X-Sudoku, Jigsaw, Killer + the 6/9/16 sizes. |

Content is **moved** from the current single `learn.html`, not rewritten — same copy, redistributed. Each page keeps the relevant `data-lesson` placeholders + their static `.lesson-fallback` prose.

**Shared chrome (each page):**
- A sub-nav row: `How to play · Core techniques · Advanced · Variants` with the current page marked (`aria-current="page"`).
- A "next →" link at the foot to the next page in sequence (`/learn` → core → advanced → variants).
- Same `landing.css` chrome, brand link, footer.

## Routing & build

### Vite: 4 entries, absolute base
- New entry HTML files in the web root: `learn.html` (exists), `learn-core.html`, `learn-advanced.html`, `learn-variants.html`. Vite emits them flat into `dist/`.
- **Change `vite.config.ts` `base: "./"` → `base: "/"`.** Nested URLs (`/learn/core`) make relative `./assets/…` paths resolve to `/learn/assets/…` (404); absolute `/assets/…` fixes this at any depth. This is the correct base for a root-domain deploy.
- **Risk to verify:** the SPA (`index.html` at `/`), the PWA service worker (`public/sw.js` app-shell + asset caching), the manifest, and the 4 existing landing pages must all still load with `base: "/"`. The landing pages already use absolute paths, so they're unaffected; the SPA is served at `/` where `/assets/…` resolves fine. Build + load-test all of them.

### Server: nested routes
- `server/src/index.ts`: keep the flat `LANDING_ROUTES` loop (classic/killer/jigsaw/xsudoku/privacy/learn). Add explicit nested handlers mapping the learn sub-pages to their flat dist filenames:
  - `/learn/core` → `learn-core.html`
  - `/learn/advanced` → `learn-advanced.html`
  - `/learn/variants` → `learn-variants.html`
- Register a small `LEARN_SUBPAGES` map and loop, before the SPA `/` route and 404. The existing trailing-slash 301 already canonicalizes `/learn/core/` → `/learn/core`.
- Route ordering stays: redirect → static → flat landing routes → learn sub-routes → `/` → 404.

## The guided first game

A new interactive on `/learn` that coaches a beginner through the opening of a real puzzle.

### Data
`web/src/learn/guided.ts` (data + controller) or data in `lessons.ts`:
```ts
interface GuidedMove {
  cell: number;     // flat index the learner must fill
  digit: number;    // the forced digit
  caption: string;  // why it's forced (the coaching line)
  unit: number[];   // cells to highlight as the forcing row/col/box
}
interface GuidedGame {
  size: 9;
  givens: Record<number, number>; // starting clues
  moves: GuidedMove[];            // ~10–12 forced singles, in teaching order
}
```
- A single hand-authored **easy** puzzle with a known solution. Only the opening ~10–12 forced placements are scripted (naked/hidden singles) — enough to teach the scanning loop, not the full ~50-cell slog.
- Each move is logically sound: at that board state, `cell` really is forced to `digit` (verified the way Task 5 lessons were).

### Behaviour
- Renders the board (givens shown, box dividers). The current move highlights its target cell + forcing `unit`, with the coaching caption in the `aria-live` region.
- The learner clicks the target cell → the digit is placed (accumulating into the board state) → advance to the next move. Wrong cell → gentle retry (no advance). A "Show me" affordance may place it for them (optional, nice-to-have).
- After the last move: a completion caption + a **"You've got the rhythm — play a full game →"** CTA linking to `/`.
- Respects `prefers-reduced-motion` (no transitions); fully keyboard/AT operable with the same dynamic-role + per-cell-label model as the existing widget.

### Code reuse (DRY)
Extract the board rendering shared by the step widget and the guided controller into a small module (`web/src/learn/grid.ts`): cell-grid construction (incl. box-divider classes), `digitChar`, and a `paintCell(el, cell, highlightKind)` helper. `widget.ts` (stepper diagrams) and `guided.ts` (guided game) both consume it. `main.ts` mounts `[data-lesson]` widgets (all pages) **and** a `[data-guided]` game (only `/learn`).

### JS-off fallback
The `[data-guided]` element contains a static prose walkthrough of the same opening moves (so JS-off readers still learn the loop), replaced by the interactive on mount — same pattern as `.lesson-fallback`.

## SEO / GEO per page
- Each page: own `<title>`, meta description, canonical (`https://stillgrid.app/learn[/sub]`), OG/Twitter.
- JSON-LD distributed:
  - `/learn`: `HowTo` (how to play) + `LearningResource` + a `FAQPage` (the beginner Q&As).
  - `/learn/core`, `/learn/advanced`: `LearningResource` (+ technique-relevant FAQ if any).
  - `/learn/variants`: the variant FAQ Q&As as `FAQPage`.
- The existing 5 FAQ Q&As are distributed to the page they belong to; **the byte-match test generalizes to all 4 pages** (every `FAQPage` answer must appear verbatim in that page's visible copy).
- `sitemap.xml`: add the 3 new URLs (priority 0.6, weekly). `llms.txt`: list the sub-pages under the Learn entry.
- Topbar `Learn` link and the variant pages' "Learn how to play" link continue to point at `/learn` (the front door).

## Testing
- **Guided logic** (pure, TDD): a `createGuided`/move-validation core (advance on correct cell, retry on wrong, completion at end) — mirrors `stepper.ts`/`answer.ts`.
- **Guided data integrity** (TDD): every move's `cell`/`unit` in range, digit 1–9, captions non-empty, and (authored-verified) each move is genuinely forced at its board state.
- **JSON-LD/FAQ byte-match**: generalize `learn-html.test.ts` to iterate all 4 `learn*.html` files — each parses, and every `FAQPage` answer is verbatim in that file's visible copy (JSON-LD stripped).
- **Server**: a test asserting the 3 nested learn sub-routes are registered (extend `landing-routes.test.ts`).
- **Build/CI**: web build + 4 entries emitted; `tsc -b`; all vitest green; server build + tests.
- **Browser (Task-9-style)**: all 4 pages load at their nested URLs with assets resolving (the `base:"/"` check); the guided game plays start→finish (correct/wrong clicks, completion CTA); reduced-motion; JS-off prose present; **Lighthouse a11y 100 on each page**; the SPA + PWA still load after the base change.

## Non-goals / YAGNI
- No full ~50-cell guided solve — stop at ~10–12 coached moves, then CTA to the real game.
- No solver/engine integration — the guided game is hand-authored static data.
- No leaving the guided board in free-play mode after coaching (CTA to the real app instead).
- No new analytics events.
- 4×4 still omitted (not shipped).

## Migration notes
- The current single `learn.html` is the basis for `/learn`; its core/advanced/variant sections move out to the new files. The `intro` lesson (single interactive step) is **replaced** by the guided game and removed from `LESSONS`/`learn.html`.
- All work continues on branch `learn-page` (not yet merged).

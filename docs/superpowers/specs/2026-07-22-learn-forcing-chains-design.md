# `/learn/forcing-chains` — technique deep page

**Date:** 2026-07-22
**Status:** approved (design)
**Author:** Rob + Claude (growth Phase 4 continuation)

## Goal

Add a fifth `/learn` technique deep page for **forcing chains**, following the
established swordfish/coloring pattern. It fills the last high-value gap in the
technique ladder, teaches the "solve without guessing" framing the evil-sudoku
search queries are really asking for, and fixes three links that currently point
`ForcingChain` at a mismatched anchor.

This is deliverable #1 of the pass-3 growth recommendations. The on-page rank
edits to `/evil-sudoku` and `/killer-sudoku-calculator` are a separate second
change and are **out of scope here**.

## Context

- The grader's T5 arsenal exposes three techniques: `Coloring` (has
  `/learn/coloring`), `ForcingChain`, and `Als`. `ForcingChain` is the label the
  grader emits for both its AIC (`find_aic`) and bivalue-forcing
  (`find_bivalue_forcing`) solvers — see `engine/src/techniques.rs`.
- Existing technique deep pages: `/learn/xy-wing`, `/learn/swordfish`,
  `/learn/coloring`. Each is a Vite MPA entry (`web/learn-*.html`) with an
  interactive stepper lesson (`data-lesson` → a `Lesson` in
  `web/src/learn/lessons.ts`) and an engine-certified sample board pinned via
  `data-sample-seed` + guarded by a test.
- `ForcingChain` currently deep-links to `/learn/advanced#swordfish` (a wrong
  anchor) in three places: `web/src/grade/ladder.ts:42`,
  `server/src/daily-pages.ts:115`, and the `/evil-sudoku` tech-list
  (`web/public/evil-sudoku.html:78`). This page gives them a correct target.
- ALS (`Als`) also points at the same wrong anchor, but has near-zero search
  demand and stays gated on forcing-chains indexing — **not** in this change.

## Honest caveat

Unlike xy-wing/swordfish, GSC shows **no direct "forcing chain" query demand**
yet (as of the 2026-07-22 pass). The case rests on: the evil "how do you solve
sudoku evil puzzles without guessing?" query (13 impr @ pos 40), topical
completeness of the ladder, and fixing the three broken links. This is a
topical-authority play, not a proven-keyword play. Watch its indexation next
pass before deciding on an ALS page.

## Scope

### New file: `web/learn-forcing-chains.html`

Mirror `web/learn-swordfish.html` structure exactly (same `<head>` boilerplate,
`landing.css`, Umami tag with `data-domains="stillgrid.app"`, board `<style>`):

- **Head:** unique title (e.g. "Forcing chains sudoku — solve the hardest grids
  without guessing | Stillgrid"), meta description, `canonical`
  `https://stillgrid.app/learn/forcing-chains`, OG/Twitter tags.
- **JSON-LD:** `LearningResource` (`teaches: ["Forcing chain"]`,
  `educationalLevel: "Advanced"`) + `FAQPage` whose answer `text` byte-matches
  the visible "Common questions" copy (Google requirement).
- **Body sections:**
  1. brand link, `<h1>Forcing chains</h1>`, lede, CTA `→ /?v=classic&tier=nightmare`, shared `learn-nav`.
  2. **The idea** — pick a bivalue cell; follow *both* branches; a candidate
     eliminated in *both* is provably gone. Deduction, not trial-and-error —
     lead with this differentiator (directly answers "without guessing").
  3. **Interactive lesson** — `<div class="lesson" data-lesson="forcing-chains">`
     with a `lesson-fallback` paragraph.
  4. **Why it works** — proof by cases; both outcomes agree, so no guess.
  5. **AIC vs. bivalue forcing** — short note that the grader labels both as one
     "Forcing chain" tier.
  6. **How to spot one** — `<ul>` of bullets.
  7. **A puzzle that needs one** — engine-certified sample `<table class="board">`
     + `data-sample-seed` / `data-sample-givens` / `sample-meta` line.
  8. **Common questions** — 3 Q&As in `.faq` matching the FAQPage JSON-LD.
  9. prev/next nav + "Try a variant" row + footer.
  10. `<script type="module" src="/src/learn/main.ts"></script>`.

### New lesson: `web/src/learn/lessons.ts`

Add a `forcing-chains` `Lesson` object (candidate grid + multi-step branch
walkthrough: bivalue cell → branch A implications → branch B implications → the
cell forced false in both). Register it in the exported `lessons` array. Keep it
small and provably correct (hand-constructed candidates, like the `coloring`
lesson).

### Certified sample

Find an engine seed whose puzzle grades **Nightmare** and requires a
`ForcingChain` as the decisive technique (minimal other T5 noise, so the example
reads cleanly). Bake its givens into the board markup and pin `data-sample-seed`.
Add a guard test mirroring the existing seed guards (evil-sudoku seed 113,
swordfish 310, coloring 50) so a future engine change that alters the puzzle
fails loudly.

### Wiring

- `server/src/index.ts`: the `/learn/*` sub-page map (currently
  `/learn/core`, `/learn/advanced`, `/learn/variants`, `/learn/xy-wing`,
  `/learn/swordfish`, `/learn/coloring`, around lines 326–331) gains
  `"/learn/forcing-chains": "learn-forcing-chains.html"`. No change to the
  `LANDING_ROUTES` array — that is for top-level slugs only; `/learn/*` sub-pages
  live in this separate map.
- `web/vite.config.ts`: add `learnForcingChains: "learn-forcing-chains.html"` to
  `rollupOptions.input`.
- `web/public/sitemap.xml`: add `https://stillgrid.app/learn/forcing-chains`.
- **Fix the three ForcingChain links** → `/learn/forcing-chains`:
  `web/src/grade/ladder.ts:42`, `server/src/daily-pages.ts:115`,
  `web/public/evil-sudoku.html:78`.
- **prev/next re-thread:** coloring's next-link (`web/learn-coloring.html:98`)
  → forcing-chains; forcing-chains prev → `/learn/coloring`, next → back to
  `/learn/advanced`.
- Add `/learn/forcing-chains` to the "Advanced" / cross-link rows where the
  other technique deep pages are listed, matching how coloring was linked.

### Testing

- `web/src/learn/learn-html.test.ts`: add the new page to the `PAGES` map (picks
  up canonical/JSON-LD-parse/FAQ-match structural assertions automatically).
- `web/src/learn/lessons.test.ts`: add `"forcing-chains"` to the covered lesson
  ids.
- Engine sample-seed guard test for the pinned seed.
- Run all CI gates before ship: engine `fmt`/`clippy`/`test`, server build+test,
  web build+test.

## Out of scope

- On-page rank edits to `/evil-sudoku` and `/killer-sudoku-calculator` (separate
  change).
- An ALS (`/learn/als`) page — gated on forcing-chains indexing.
- Any change to the grader engine itself.

## Success criteria

- `/learn/forcing-chains` renders in prod, is in the sitemap, canonical resolves,
  JSON-LD parses.
- The interactive lesson steps through correctly.
- The pinned sample regrades as Nightmare with a Forcing chain on the live grader.
- All three previously-mismatched `ForcingChain` links now resolve to the new page.
- All CI gates green.

# On-page pass: `/evil-sudoku` (substantive) + `/killer-sudoku-calculator` (light)

**Date:** 2026-07-22
**Status:** approved (design)
**Author:** Rob + Claude (growth Phase 4, pass-3 recommendation #1)

## Goal

Improve on-page rank signals for the two biggest impression pools that sit deep
in the SERPs, focusing effort where the data says it can actually move:

- **`/evil-sudoku`** (279 impr, avg pos ~51) — thin page; close on near-miss
  long-tail ("how do you solve sudoku evil puzzles without guessing?" @40;
  "sudoku evil level" @56). Add depth targeting those queries and strengthen the
  internal link to the freshly-shipped `/learn/forcing-chains`.
- **`/killer-sudoku-calculator`** (159 impr, avg pos ~29) — already exhaustive;
  the head-term gap ("killer sudoku combinations" @52) is competition-bound, so
  only a light framing touch, no bloat.

Honest scope note: the head term "sudoku evil"/"evil sudoku" (~200 impr @ ~54)
is competition-bound; we are NOT chasing it. We target the two queries we're
genuinely close on (@40, @56) and the difficulty already covered by the existing
"evil vs extreme/expert" FAQ.

## Context

- Both pages already exist and are routed; no new routes/sitemap entries.
- `/evil-sudoku` is `web/public/evil-sudoku.html` (static). Its only test is the
  engine baked-sample guard (seed 113) in `server/src/engine.test.ts` — this
  change does NOT touch the sample, so that stays green.
- `/killer-sudoku-calculator` is `web/killer-sudoku-calculator.html`, covered by
  `web/src/calculator/calc-html.test.ts`, which asserts (a) JSON-LD parses,
  (b) every FAQ answer appears verbatim in visible copy, (c) the combination
  tables exactly match the engine fixture. The light touch only edits lede prose
  — it must not disturb the `<section id="tables-*">` blocks or the FAQ.
- There is currently **no** FAQ-verbatim test for `/evil-sudoku`. This change
  adds one (mirroring `calc-html.test.ts`) so the new FAQ copy is locked.

## Scope

### `/evil-sudoku` — substantive

**1. New section "Do you have to guess?"** — inserted after the existing "How to
solve one" `<ul>` (and before "Common questions"). Quiet brand voice, ~2 short
paragraphs. Thesis: a genuine evil puzzle never *requires* a guess; when the
simple moves run out you escalate to patterns and, at the hardest step, a
**forcing chain** — assume both of a bivalue cell's candidates, keep only what
both branches agree on (proof by cases, not trial-and-error). Contains an inline
prose link to `/learn/forcing-chains` (deep dive) and may reference `/grade`.
This both answers the @40 query and adds an internal link to the forcing-chains
page (helping its indexation — the current canary).

**2. Two new FAQs** — appended to BOTH the visible `.faq` block and the
`FAQPage` JSON-LD `mainEntity` array, answer text byte-identical between them:
- *"How do you solve an evil sudoku without guessing?"* — crisp, verbatim-
  quotable (GEO play); names forcing chains; ~2–3 sentences.
- *"Is evil the hardest level of sudoku?"* — explains Nightmare is the top honest
  tier and a puzzle beyond it grades *stuck*; ~2–3 sentences.
The existing three FAQs are unchanged. Draft copy lives in the implementation
plan (must be finalized there and kept identical across the two locations).

**3. Meta description refinement** — fold a "solve with logic, never guessing"
angle into the `<meta name="description">` to better match the question-query
intent. Keep it within ~160 chars. Title unchanged (already strong, includes
"extreme"). OG/Twitter unchanged.

**4. New test** — `web/src/landing/evil-html.test.ts` (new file, new dir), a
Vitest that raw-imports `../../public/evil-sudoku.html?raw` and asserts:
(a) every JSON-LD block parses, (b) exactly one `FAQPage`, (c) every FAQ answer
appears verbatim in the visible copy. Mirrors `calc-html.test.ts`. Confirm the
`?raw` import resolves from `web/public/` under Vitest; if it does not, fall back
to `fs.readFileSync` of the resolved path (same approach as
`server/src/engine.test.ts`).

### `/killer-sudoku-calculator` — light touch

**Single framing edit:** surface the exact phrase **"killer sudoku
combinations"** once in the lede/intro prose (it ranks @52 for that term despite
listing all 502). No new links (the page already cross-links well via the play
CTA + variant row), no change to the FAQ, the JSON-LD, or any
`<section id="tables-*">` block (the fixture test must stay green). This is the
entire calculator change — the page is already comprehensive; no padding.

## Out of scope

- The `/kakuro-combinations` page (still gated on kakuro impressions — zero).
- Any attempt at the competition-bound head terms.
- A second certified sample, difficulty tables, or structural redesign
  (rejected Approach C).
- Changes to the certified sample, engine, routes, or sitemap.

## Success criteria

- `/evil-sudoku` gains the new section (with a working `/learn/forcing-chains`
  link) and two new FAQs; visible copy and `FAQPage` JSON-LD match byte-for-byte;
  the new `evil-html.test.ts` passes.
- `/killer-sudoku-calculator` lede carries "killer sudoku combinations";
  `calc-html.test.ts` (FAQ + tables fixture) stays green.
- Web build clean, all web tests pass; engine seed-113 guard still green.
- Post-ship prod spot-check: both pages 200, the new evil section + FAQs render,
  the forcing-chains link resolves.

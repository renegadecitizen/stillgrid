# `/learn/forcing-chains` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a fifth `/learn` technique deep page for forcing chains — a prerendered SEO page with an interactive stepper lesson and an engine-certified sample — and fix the three links that currently point `ForcingChain` at a wrong anchor.

**Architecture:** Follow the existing swordfish/coloring pattern exactly: a Vite MPA HTML entry (`web/learn-forcing-chains.html`), a `Lesson` object in `web/src/learn/lessons.ts` wired by a `data-lesson` attribute, an engine-pinned sample board guarded by a server test, and route registration in `server/src/index.ts`. No engine changes.

**Tech Stack:** Static HTML + `landing.css`, TypeScript lesson modules (Vitest), Express route map, Rust engine CLI (used only to certify the sample seed — already done).

**Certified sample (already found & verified):**
- Seed `361`, `--min-clues 22`, classic 9×9.
- Givens: `......32...7425...8.........6...9.....3..8.79...64.....94...7..2...9..45....3..8.` (24 clues).
- Grade: `nightmare`, `58` steps, `technique_counts` = `{NakedSingle:40, HiddenSingleRow:10, HiddenSingleCol:6, ForcingChain:1, HiddenSingleBox:1}` — i.e. **ForcingChain × 1 and zero X-Wing/Swordfish/XY-Wing/Coloring/ALS**. Cleanest possible teaching case.

---

## File map

- **Create** `web/learn-forcing-chains.html` — the page (Task 1).
- **Modify** `web/vite.config.ts` — add MPA input (Task 1).
- **Modify** `web/src/learn/learn-html.test.ts` — register page in `PAGES` (Task 1).
- **Modify** `server/src/engine.test.ts` — engine baked-sample guard (Task 2).
- **Modify** `web/src/learn/lessons.ts` — add `forcing-chains` lesson (Task 3).
- **Modify** `web/src/learn/lessons.test.ts` — add id to `REQUIRED_IDS` (Task 3).
- **Modify** `server/src/index.ts` — add `/learn/forcing-chains` to `LEARN_SUBPAGES` (Task 4).
- **Modify** `server/src/landing-routes.test.ts` — assert the new route (Task 4).
- **Modify** `web/src/grade/ladder.ts`, `server/src/daily-pages.ts`, `web/public/evil-sudoku.html` — fix the three `ForcingChain` links (Task 5).
- **Modify** `web/learn-coloring.html` — re-thread next-link (Task 5).
- **Modify** `web/public/sitemap.xml` — add the URL (Task 5).

---

## Task 1: Create the page + Vite input + structural test

**Files:**
- Create: `web/learn-forcing-chains.html`
- Modify: `web/vite.config.ts:17-27` (rollupOptions.input)
- Modify: `web/src/learn/learn-html.test.ts:1-10`

- [ ] **Step 1: Create `web/learn-forcing-chains.html`** with this exact content:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#FAF7F2" />
    <title>Forcing chains sudoku — solve the hardest grids without guessing | Stillgrid</title>
    <meta name="description" content="Learn forcing chains: assume a cell's two candidates in turn, follow each to its conclusion, and eliminate what both agree on. Interactive walkthrough, the no-guessing proof, and a certified puzzle that needs exactly one." />
    <link rel="canonical" href="https://stillgrid.app/learn/forcing-chains" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta property="og:title" content="Forcing chains — Stillgrid" />
    <meta property="og:description" content="Assume, follow, and compare: the technique that cracks evil sudoku without a single guess. Interactive walkthrough plus a certified example." />
    <meta property="og:url" content="https://stillgrid.app/learn/forcing-chains" />
    <meta property="og:type" content="article" />
    <meta property="og:image" content="https://stillgrid.app/og-image.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Learn sudoku on Stillgrid." />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="https://stillgrid.app/og-image.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap" />
    <link rel="stylesheet" href="/landing.css" />
    <!-- Privacy-friendly analytics by Umami -->
    <script defer src="https://cloud.umami.is/script.js" data-website-id="a623ea5c-9c7e-45c2-9d15-6c56bdfe0593" data-domains="stillgrid.app"></script>
    <style>
.board { border-collapse: separate; border-spacing: 0; border: 2px solid var(--color-ink); margin: 1.5rem auto; }
.board td { width: 44px; height: 44px; padding: 0; text-align: center; vertical-align: middle;
  font-family: "Fraunces", Georgia, serif; font-size: 1.3rem; color: var(--color-ink);
  border-top: 1px solid var(--color-border); border-left: 1px solid var(--color-border); }
.board tr:first-child td { border-top: none; }
.board td:first-child { border-left: none; }
.board td.bt { border-top: 2px solid var(--color-ink); }
.board td.bl { border-left: 2px solid var(--color-ink); }
@media (max-width: 480px) { .board td { width: 34px; height: 34px; font-size: 1.05rem; } }
.sample-meta { text-align: center; color: var(--color-ink-soft); font-size: 0.9rem; }
    </style>
    <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"LearningResource","name":"Forcing chains in sudoku","description":"Assume a bivalue cell's two candidates in turn, follow each to its conclusion, and eliminate what both agree on — a proof, not a guess. Interactive walkthrough plus a certified example puzzle.","learningResourceType":"Tutorial","educationalLevel":"Advanced","teaches":["Forcing chain"],"inLanguage":"en","isAccessibleForFree":true,"url":"https://stillgrid.app/learn/forcing-chains","publisher":{"@type":"Organization","name":"Stillgrid","url":"https://stillgrid.app"}}
    </script>
    <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"What is a forcing chain in sudoku?","acceptedAnswer":{"@type":"Answer","text":"A forcing chain starts from one cell that has just two candidates. You assume the first candidate and follow the ripple of forced placements it causes, then do the same for the second. Any elimination both assumptions produce is certain — it holds no matter which candidate is true — so you can make it without ever guessing."}},{"@type":"Question","name":"Is a forcing chain the same as guessing?","acceptedAnswer":{"@type":"Answer","text":"No. A guess keeps one assumption and hopes it holds. A forcing chain tries both of a cell's candidates and acts only on what they agree about, so the conclusion is proven either way. It is bookkeeping, not trial and error — nothing is ever left standing on an unverified guess."}},{"@type":"Question","name":"How hard is a puzzle that needs a forcing chain?","acceptedAnswer":{"@type":"Answer","text":"Stillgrid grades forcing chains in the Nightmare tier, the top of the ladder — the same beast other sites call evil or extreme. A grid only earns it when simpler techniques, up through coloring, provably run out before the chain. The certified sample on this page is pure: singles solve all of it except one forcing chain."}}]}
    </script>
  </head>
  <body>
    <main>
      <a class="brand" href="/">Stillgrid</a>
      <h1>Forcing chains</h1>
      <p class="lede">The technique that cracks the hardest grids — and does it without a single guess.</p>
      <p><a class="cta" href="/?v=classic&amp;tier=nightmare">Play evil sudoku</a></p>
      <nav class="learn-nav" aria-label="Learn sections">
        <a href="/learn">How to play</a>
        <a href="/learn/core">Core techniques</a>
        <a href="/learn/advanced">Advanced</a>
        <a href="/learn/variants">Variants &amp; sizes</a>
      </nav>

      <h2>The idea</h2>
      <p>Find a cell with exactly <strong>two candidates</strong> — call it the pivot. One of them is true; you just don't know which yet. So try both. Assume the first and follow the chain of forced placements it sets off; then assume the second and follow that chain. Anywhere <strong>both assumptions reach the same conclusion</strong> — the same candidate removed from the same cell — that conclusion is certain, because it holds whichever candidate the pivot really has. You eliminate it, and you never guessed.</p>
      <div class="lesson" data-lesson="forcing-chains">
        <p class="lesson-fallback">Take a cell with two candidates, say 1 and 2. Assume 1 and follow the forced placements; assume 2 and follow those. If both roads put a 7 into the same row, any other cell in that row can't be 7 — remove it, no guess required.</p>
      </div>

      <h2>Why it isn't guessing</h2>
      <p>A guess commits to one branch and hopes. A forcing chain commits to nothing: it explores <em>both</em> branches of a two-way cell and keeps only what they share. Since the pivot must be one value or the other, a shared consequence is true in every possible world — that's a proof by cases, the same logic a mathematician uses. If the two branches ever <em>disagree</em>, you learn nothing there and move on; only agreement lets you act.</p>

      <h2>AIC or bivalue forcing — one grade</h2>
      <p>There are two common ways to run the argument. A <strong>bivalue forcing chain</strong> is the direct version above: push both assumptions, compare. An <strong>alternating inference chain</strong> (AIC) threads a single path of strong and weak links to the same end without splitting. Stillgrid's grader can find either, and labels both simply <strong>Forcing chain</strong> — the top rung of its technique ladder.</p>

      <h2>How to spot one</h2>
      <ul>
        <li><strong>Start from bivalue cells.</strong> Two candidates is the smallest fork — the easiest to follow both ways in your head.</li>
        <li><strong>Follow forced moves only.</strong> After the assumption, take a step only when a cell is left with one candidate. No branching within a branch.</li>
        <li><strong>Watch for a shared elimination.</strong> You're hunting a cell that loses the same candidate in <em>both</em> branches — that's the payoff.</li>
        <li><strong>Keep the chains short.</strong> The best forcing chains are two or three links each; if you're a dozen deep, look for a simpler cell first.</li>
        <li><strong>Reach for it last.</strong> Forcing chains are the top of the ladder — exhaust singles, pairs, fish, and coloring before you assume anything.</li>
      </ul>

      <h2>A puzzle that needs one</h2>
      <p>Generated and verified by our grader: naked and hidden singles carry this grid almost to the end — then it wedges, and a single <strong>forcing chain</strong> is the only way through. That one move is what earns it the Nightmare grade.</p>
      <div class="sample" data-sample-seed="361" data-sample-min-clues="22" data-sample-givens="......32...7425...8.........6...9.....3..8.79...64.....94...7..2...9..45....3..8.">
        <table class="board" role="img" aria-label="A 24-given sudoku graded Nightmare: singles solve all of it except one forcing chain."><tbody><tr><td></td><td></td><td></td><td class="bl"></td><td></td><td></td><td class="bl g">3</td><td class="g">2</td><td></td></tr><tr><td></td><td></td><td class="g">7</td><td class="bl g">4</td><td class="g">2</td><td class="g">5</td><td class="bl"></td><td></td><td></td></tr><tr><td class="g">8</td><td></td><td></td><td class="bl"></td><td></td><td></td><td class="bl"></td><td></td><td></td></tr><tr><td class="bt"></td><td class="bt g">6</td><td class="bt"></td><td class="bt bl"></td><td class="bt"></td><td class="bt g">9</td><td class="bt bl"></td><td class="bt"></td><td class="bt"></td></tr><tr><td></td><td></td><td class="g">3</td><td class="bl"></td><td></td><td class="g">8</td><td class="bl"></td><td class="g">7</td><td class="g">9</td></tr><tr><td></td><td></td><td></td><td class="bl g">6</td><td class="g">4</td><td></td><td class="bl"></td><td></td><td></td></tr><tr><td class="bt"></td><td class="bt g">9</td><td class="bt g">4</td><td class="bt bl"></td><td class="bt"></td><td class="bt"></td><td class="bt bl g">7</td><td class="bt"></td><td class="bt"></td></tr><tr><td class="g">2</td><td></td><td></td><td class="bl"></td><td class="g">9</td><td></td><td class="bl"></td><td class="g">4</td><td class="g">5</td></tr><tr><td></td><td></td><td></td><td class="bl"></td><td class="g">3</td><td></td><td class="bl"></td><td class="g">8</td><td></td></tr></tbody></table>
      </div>
      <p class="sample-meta">24 givens · graded <strong>Nightmare</strong> · 58 solver steps · Forcing chain × 1</p>
      <p>Copy it into the <a href="/grade">difficulty grader</a> to see the certificate yourself — then go hunting on a fresh board.</p>

      <h2>Common questions</h2>
      <div class="faq">
        <h3>What is a forcing chain in sudoku?</h3>
        <p>A forcing chain starts from one cell that has just two candidates. You assume the first candidate and follow the ripple of forced placements it causes, then do the same for the second. Any elimination both assumptions produce is certain — it holds no matter which candidate is true — so you can make it without ever guessing.</p>
        <h3>Is a forcing chain the same as guessing?</h3>
        <p>No. A guess keeps one assumption and hopes it holds. A forcing chain tries both of a cell's candidates and acts only on what they agree about, so the conclusion is proven either way. It is bookkeeping, not trial and error — nothing is ever left standing on an unverified guess.</p>
        <h3>How hard is a puzzle that needs a forcing chain?</h3>
        <p>Stillgrid grades forcing chains in the Nightmare tier, the top of the ladder — the same beast other sites call evil or extreme. A grid only earns it when simpler techniques, up through coloring, provably run out before the chain. The certified sample on this page is pure: singles solve all of it except one forcing chain.</p>
      </div>

      <p class="learn-prev"><a href="/learn/coloring">← Deep dive: Simple Coloring</a></p>
      <p class="learn-next"><a href="/learn/advanced">Back to Advanced techniques →</a></p>

      <h2>Try a variant</h2>
      <div class="variant-row">
        <a href="/classic">Classic Sudoku</a>
        <a href="/xsudoku">X-Sudoku</a>
        <a href="/jigsaw">Jigsaw Sudoku</a>
        <a href="/killer">Killer Sudoku</a>
        <a href="/evil-sudoku">Evil Sudoku</a>
        <a href="/killer-sudoku-calculator">Killer Sudoku Calculator</a>
        <a href="/grade">Sudoku Difficulty Grader</a>
        <a href="/daily">Daily Sudoku Archive</a>
      </div>

      <footer>
        <a href="/">Stillgrid home</a> · sudoku, the quiet way
      </footer>
    </main>
    <script type="module" src="/src/learn/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Add the Vite MPA input.** In `web/vite.config.ts`, in `rollupOptions.input`, add the line after `learnColoring`:

```ts
        learnColoring: "learn-coloring.html",
        learnForcingChains: "learn-forcing-chains.html",
```

- [ ] **Step 3: Register the page in the structural test.** In `web/src/learn/learn-html.test.ts`, add the import and map entry:

```ts
import coloring from "../../learn-coloring.html?raw";
import forcingChains from "../../learn-forcing-chains.html?raw";

const PAGES: Record<string, string> = { learn, core, advanced, variants, xyWing, swordfish, coloring, forcingChains };
```

- [ ] **Step 4: Run the structural test — expect PASS** (JSON-LD parses; every FAQ answer appears verbatim in the visible copy).

Run: `cd web && npx vitest run src/learn/learn-html.test.ts`
Expected: PASS, including the new `forcingChains` cases. If the FAQ-verbatim assertion fails, a JSON-LD answer string and its visible `<p>` have drifted — make them byte-identical.

- [ ] **Step 5: Commit**

```bash
git add web/learn-forcing-chains.html web/vite.config.ts web/src/learn/learn-html.test.ts
git commit -m "feat(growth): /learn/forcing-chains page + certified sample (Phase 4)"
```

---

## Task 2: Engine-certified sample guard

**Files:**
- Modify: `server/src/engine.test.ts:112-155` (inside the `learn technique-page baked samples` describe)

- [ ] **Step 1: Add the guard test.** Append this `it` block after the `coloring sample` test (before the closing `});` at line 155):

```ts
  it("forcing-chains sample: Nightmare via exactly one Forcing chain, nothing else advanced", async () => {
    const g = await pageSample("learn-forcing-chains.html");
    expect(g?.tier_label).toBe("nightmare");
    expect(g?.steps).toBe(58);
    expect(g?.technique_counts["ForcingChain"]).toBe(1);
    expect(g?.technique_counts["Coloring"] ?? 0).toBe(0);
    expect(g?.technique_counts["Als"] ?? 0).toBe(0);
    expect(g?.technique_counts["XYWing"] ?? 0).toBe(0);
    expect(
      (g?.technique_counts["SwordfishRow"] ?? 0) + (g?.technique_counts["SwordfishCol"] ?? 0),
    ).toBe(0);
  });
```

- [ ] **Step 2: Run it — expect PASS.** (Requires the release binaries on PATH / built; the suite `skipIf(!HAVE_ENGINE)`. Build them first if needed: `make engine`.)

Run: `cd server && npx vitest run src/engine.test.ts -t "forcing-chains sample"`
Expected: PASS — seed 361 regenerates the baked givens and grades nightmare/58/ForcingChain×1.

- [ ] **Step 3: Commit**

```bash
git add server/src/engine.test.ts
git commit -m "test(server): pin /learn/forcing-chains sample to engine seed 361"
```

---

## Task 3: Interactive forcing-chains lesson

**Files:**
- Modify: `web/src/learn/lessons.ts` (add lesson + append to `LESSONS`)
- Modify: `web/src/learn/lessons.test.ts:4-16` (add id to `REQUIRED_IDS`)

- [ ] **Step 1: Add the id to the test first (TDD).** In `web/src/learn/lessons.test.ts`, add `"forcing-chains"` to `REQUIRED_IDS` after `"coloring"`:

```ts
  "swordfish",
  "coloring",
  "forcing-chains",
  "x-sudoku",
```

- [ ] **Step 2: Run the lesson test — expect FAIL.**

Run: `cd web && npx vitest run src/learn/lessons.test.ts`
Expected: FAIL — `LESSONS` length is 11, required list is now 12; and the "exactly once" check fails for `forcing-chains`.

- [ ] **Step 3: Add the lesson.** In `web/src/learn/lessons.ts`, insert this block immediately after the `coloring` lesson definition (after its closing `};`, around line 382), before the `// --- x-sudoku` comment:

```ts
// --- forcing chain: one bivalue pivot, two branches that agree ---
// Pivot (4,4)={1,2}. Branch 1: (4,4)=1 ⇒ (4,8) drops 1 ⇒ =5 ⇒ (0,8) drops 5 ⇒ =7.
// Branch 2: (4,4)=2 ⇒ (0,4) drops 2 ⇒ =7. Either branch puts a 7 in row 0, so the
// bivalue victim (0,1)={7,9} loses its 7 whichever candidate the pivot truly holds.
const forcingCands: Record<number, number[]> = {
  [ix(4, 4)]: [1, 2],
  [ix(4, 8)]: [1, 5], [ix(0, 8)]: [5, 7],
  [ix(0, 4)]: [2, 7],
  [ix(0, 1)]: [7, 9],
};
const forcingBranchA = [ix(4, 8), ix(0, 8)];
const forcingBranchB = [ix(0, 4)];

const forcingChain: Lesson = {
  id: "forcing-chains",
  title: "Forcing chains",
  size: 9,
  steps: [
    {
      caption: "Start at a cell with exactly two candidates — the pivot, {1,2}. One is true; we don't know which, so we'll try both.",
      grid: grid9Cands({}, forcingCands),
      highlights: [{ cells: [ix(4, 4)], kind: "target" }],
    },
    {
      caption: "Assume the pivot is 1. That drops 1 from its neighbour → it becomes 5 → which drops 5 from the cell above → it becomes 7. A 7 lands in the top row.",
      grid: grid9Cands({}, { ...forcingCands, [ix(4, 4)]: [1], [ix(4, 8)]: [5], [ix(0, 8)]: [7] }),
      highlights: [
        { cells: [ix(4, 4)], kind: "target" },
        { cells: forcingBranchA, kind: "unit" },
        { cells: [ix(0, 1)], kind: "elim" },
      ],
    },
    {
      caption: "Now assume the pivot is 2 instead. Following the other neighbour, a 7 again lands in the top row — a different cell, same row.",
      grid: grid9Cands({}, { ...forcingCands, [ix(4, 4)]: [2], [ix(0, 4)]: [7] }),
      highlights: [
        { cells: [ix(4, 4)], kind: "target" },
        { cells: forcingBranchB, kind: "unit" },
        { cells: [ix(0, 1)], kind: "elim" },
      ],
    },
    {
      caption: "Either way the top row already has its 7, so this two-candidate cell can't be 7. Cross it off — only 9 remains. No guess was ever kept.",
      grid: grid9Cands({}, { ...forcingCands, [ix(0, 1)]: [9] }),
      highlights: [{ cells: [ix(0, 1)], kind: "elim" }],
    },
  ],
};
```

- [ ] **Step 4: Register it in `LESSONS`.** In the `export const LESSONS: Lesson[] = [ ... ]` array, add after `coloring,`:

```ts
  coloring,
  forcingChain,
  xSudoku,
```

- [ ] **Step 5: Run the lesson test — expect PASS.**

Run: `cd web && npx vitest run src/learn/lessons.test.ts`
Expected: PASS — 12 lessons, `forcing-chains` present once, grids are 81 cells, all candidates in 1..9, highlights in range.

- [ ] **Step 6: Typecheck the web package.**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add web/src/learn/lessons.ts web/src/learn/lessons.test.ts
git commit -m "feat(learn): interactive forcing-chains stepper lesson"
```

---

## Task 4: Server route registration

**Files:**
- Modify: `server/src/index.ts:325-332` (`LEARN_SUBPAGES`)
- Modify: `server/src/landing-routes.test.ts:13-29`

- [ ] **Step 1: Update the route test first (TDD).** In `server/src/landing-routes.test.ts`, add `"/learn/forcing-chains"` to the expected keys array and add the file assertion:

```ts
      "/learn/swordfish",
      "/learn/coloring",
      "/learn/forcing-chains",
    ]);
```
and after the coloring assertion:
```ts
    expect(LEARN_SUBPAGES["/learn/coloring"]).toBe("learn-coloring.html");
    expect(LEARN_SUBPAGES["/learn/forcing-chains"]).toBe("learn-forcing-chains.html");
```

- [ ] **Step 2: Run the route test — expect FAIL.**

Run: `cd server && npx vitest run src/landing-routes.test.ts`
Expected: FAIL — `LEARN_SUBPAGES` keys don't include `/learn/forcing-chains` yet.

- [ ] **Step 3: Add the route.** In `server/src/index.ts`, add to `LEARN_SUBPAGES` after the coloring entry:

```ts
  "/learn/coloring": "learn-coloring.html",
  "/learn/forcing-chains": "learn-forcing-chains.html",
} as const;
```

- [ ] **Step 4: Run the route test — expect PASS.**

Run: `cd server && npx vitest run src/landing-routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/index.ts server/src/landing-routes.test.ts
git commit -m "feat(server): route /learn/forcing-chains"
```

---

## Task 5: Fix the three ForcingChain links, re-thread nav, sitemap

**Files:**
- Modify: `web/src/grade/ladder.ts:42`
- Modify: `server/src/daily-pages.ts:115`
- Modify: `web/public/evil-sudoku.html:78`
- Modify: `web/learn-coloring.html:98`
- Modify: `web/learn-advanced.html:56` (the "Deep dives" cross-link row)
- Modify: `web/public/sitemap.xml:104-105`

- [ ] **Step 1: Fix `ladder.ts`.** Change line 42's href from `/learn/advanced#swordfish` to the new page:

```ts
  { label: "Forcing chain", keys: ["ForcingChain"], tier: 5, href: "/learn/forcing-chains" },
```

- [ ] **Step 2: Fix `daily-pages.ts`.** Change line 115's href identically:

```ts
  { label: "Forcing chain", keys: ["ForcingChain"], tier: 5, href: "/learn/forcing-chains" },
```

- [ ] **Step 3: Fix the evil-sudoku tech-list link.** In `web/public/evil-sudoku.html`, line 78, the "Forcing chain" row currently links to `/learn/advanced#swordfish`. Replace:

```html
        <li><span><a href="/learn/forcing-chains">Forcing chain</a></span><span class="n">× 5</span></li>
```

- [ ] **Step 4: Re-thread the coloring page's next-link.** In `web/learn-coloring.html`, line 98, change the next-link from "Back to Advanced" to point forward to the new page:

```html
      <p class="learn-next"><a href="/learn/forcing-chains">Next deep dive: Forcing chains →</a></p>
```

- [ ] **Step 5: Add forcing-chains to the "Deep dives" cross-link row.** In `web/learn-advanced.html`, line 56, extend the deep-dives list with the new page:

```html
      <p>Deep dives with interactive walkthroughs and certified example puzzles: <a href="/learn/swordfish">Swordfish, step by step</a> · <a href="/learn/xy-wing">XY-Wing, step by step</a> · <a href="/learn/coloring">Simple Coloring, step by step</a> · <a href="/learn/forcing-chains">Forcing chains, step by step</a>.</p>
```

- [ ] **Step 6: Add the sitemap entry.** In `web/public/sitemap.xml`, add a `<url>` block after the coloring block (after line 104, before `</urlset>`):

```xml
  <url>
    <loc>https://stillgrid.app/learn/forcing-chains</loc>
    <lastmod>2026-07-22</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>
</urlset>
```

- [ ] **Step 7: Verify the grade-ladder test still passes** (ladder.ts has unit coverage of the technique families).

Run: `cd web && npx vitest run src/grade`
Expected: PASS.

- [ ] **Step 8: Verify daily-pages tests still pass.**

Run: `cd server && npx vitest run src/daily-pages.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add web/src/grade/ladder.ts server/src/daily-pages.ts web/public/evil-sudoku.html web/learn-coloring.html web/learn-advanced.html web/public/sitemap.xml
git commit -m "fix(learn): point ForcingChain links at /learn/forcing-chains; thread nav + sitemap"
```

---

## Task 6: Full CI gates + build + local prod smoke

- [ ] **Step 1: Engine gates** (unchanged code, but the sample test in Task 2 needs the binaries; confirm nothing regressed).

Run: `cd engine && cargo fmt --check && cargo clippy --release --all-targets -- -D warnings && cargo test --release`
Expected: all green.

- [ ] **Step 2: Server build + tests.**

Run: `cd server && npm run build && npx vitest run`
Expected: tsc clean; all tests pass (incl. the new route + engine sample guard).

- [ ] **Step 3: Web build + tests.**

Run: `cd web && npm run build && npx vitest run`
Expected: Vite build emits `learn-forcing-chains.html`; all tests pass.

- [ ] **Step 4: Local prod smoke** — serve the built dist and confirm the page + route resolve and the sample regrades.

```bash
# from repo root, with server built and web dist present:
PORT=3002 node server/dist/index.js &
sleep 1
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3002/learn/forcing-chains   # expect 200
curl -sS http://localhost:3002/sitemap.xml | grep forcing-chains                        # expect the loc line
kill %1
```
Expected: `200`, and the sitemap contains `/learn/forcing-chains`.

- [ ] **Step 5: Browser verification** (optional but recommended) — open `http://localhost:3002/learn/forcing-chains` in the preview browser, step through the interactive lesson (4 steps), confirm the sample board renders and no console errors.

- [ ] **Step 6: Final commit if any smoke-fix was needed** (otherwise nothing to commit — the feature commits already landed in Tasks 1–5).

---

## Notes for the executor

- **Do not push to `main`.** Per the repo's standing rule, pushing to `main` triggers a prod deploy and requires explicit per-action confirmation from Rob. Stop after Task 6 and report; the deploy is handled separately via the `ship` skill.
- The certified seed is already verified against the live binaries; if Task 2's test fails on `p.givens`, the engine's generator output has changed — do **not** silently re-pick a seed, surface it.
- FAQ answer strings must stay byte-identical between the JSON-LD `text` fields and the visible `<p>` copy (Google's match requirement + `learn-html.test.ts` enforces it).

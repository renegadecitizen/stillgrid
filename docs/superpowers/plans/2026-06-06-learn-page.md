# Learn page (`/learn`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a prerendered `/learn` page that teaches sudoku on the default 9×9 board (rules → notes → the grader's technique ladder → variants & sizes), enhanced by a small data-driven animated tutorial widget, wired into the site's nav, sitemap, llms.txt, and SEO/GEO structured data.

**Architecture:** A single static `learn.html` authored in the web root and added as a **second Vite rollup entry**, so it ships as fully-prerendered HTML (the SEO/GEO asset, works with JS off) while a co-located **vanilla-TS widget** (`web/src/learn/`) progressively enhances placeholder elements with animated, lightly-interactive grid diagrams. No React, no game engine, no solver. The other four landing pages and the SPA are untouched.

**Tech Stack:** Vite 5 (multi-page build), TypeScript (strict), vanilla DOM + CSS transitions, vitest (jsdom), Express static + landing routes (`server/src/index.ts`), `landing.css` for shared chrome.

**Spec:** `docs/superpowers/specs/2026-06-06-learn-page-design.md`

**Branch note:** This plan is written on `main`. Execute on a feature branch (e.g. `learn-page`); do **not** push to `main` (triggers prod deploy) without explicit confirmation, and run all CI gates locally first (web: `npm run build && npm test && npm run lint`; server: `npm run build && npm test`).

---

## File Structure

**Create:**
- `web/learn.html` — prerendered page: head (meta/OG/canonical/JSON-LD), all teaching copy, widget placeholder elements with static fallbacks. Vite entry.
- `web/src/learn/types.ts` — `Cell`, `Highlight`, `Step`, `Interactive`, `Lesson` types.
- `web/src/learn/stepper.ts` — pure step-state machine (no DOM).
- `web/src/learn/stepper.test.ts` — stepper unit tests.
- `web/src/learn/lessons.ts` — all animated lesson data.
- `web/src/learn/lessons.test.ts` — lesson-data integrity tests.
- `web/src/learn/widget.ts` — DOM render + mount + controls + interactive validate + reduced-motion.
- `web/src/learn/answer.ts` — pure `checkAnswer()` helper (testable interactivity logic).
- `web/src/learn/answer.test.ts` — interactivity logic tests.
- `web/src/learn/main.ts` — entry: find `[data-lesson]` placeholders, mount widgets, import CSS.
- `web/src/learn/learn.css` — widget grid + controls styling.
- `web/src/learn/learn-html.test.ts` — reads `learn.html`, asserts FAQ JSON-LD `text` appears verbatim in visible copy and all JSON-LD parses.

**Modify:**
- `web/vite.config.ts` — add `build.rollupOptions.input` with `main` + `learn`.
- `server/src/index.ts` — add `"learn"` to `LANDING_ROUTES`; `export` it.
- `server/src/landing-routes.test.ts` — **create** — assert `LANDING_ROUTES` includes `learn`.
- `web/public/sitemap.xml` — add `/learn`.
- `web/public/llms.txt` — add `/learn` line.
- `web/src/App.tsx` — Learn nav link `href="#"` → `href="/learn"`.
- `web/public/{classic,killer,jigsaw,xsudoku}.html` — add a "Learn how to play" link in the "Try a variant" row.

---

## Task 1: Vite second entry + page shell + server route + verify served

**Files:**
- Create: `web/learn.html`
- Modify: `web/vite.config.ts`
- Modify: `server/src/index.ts:224`
- Create: `server/src/landing-routes.test.ts`

- [ ] **Step 1: Create `web/learn.html` shell** (head + minimal body; content arrives in later tasks)

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#FAF7F2" />
    <title>How to play sudoku — rules, techniques & difficulty | Stillgrid</title>
    <meta name="description" content="Learn how to play sudoku: the rules, how to use pencil-mark notes, and the exact technique ladder Stillgrid grades difficulty by — singles, pairs, X-Wing, and beyond. Free, no signup needed." />
    <link rel="canonical" href="https://stillgrid.app/learn" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta property="og:title" content="How to play sudoku — Stillgrid" />
    <meta property="og:description" content="The rules, pencil-mark notes, and the technique ladder Stillgrid grades difficulty by." />
    <meta property="og:url" content="https://stillgrid.app/learn" />
    <meta property="og:type" content="article" />
    <meta property="og:image" content="https://stillgrid.app/og-image.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Learn sudoku on Stillgrid." />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="https://stillgrid.app/og-image.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap" />
    <link rel="stylesheet" href="/landing.css" />
    <!-- Privacy-friendly analytics by Plausible -->
    <script async src="https://plausible.io/js/pa-HB79xhSO4XQqtCrZGd-vn.js"></script>
    <script>window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()</script>
  </head>
  <body>
    <main>
      <a class="brand" href="/">Stillgrid</a>
      <h1>How to play sudoku</h1>
      <p class="lede">The rules, then the exact ladder of techniques Stillgrid uses to grade difficulty — from your first naked single to X-Wing.</p>
      <p><a class="cta" href="/">Play now</a></p>
      <!-- Content sections added in Task 2; JSON-LD in Task 3 -->
      <footer>
        <a href="/">Stillgrid home</a> · sudoku, the quiet way
      </footer>
    </main>
    <script type="module" src="/src/learn/main.ts"></script>
  </body>
</html>
```

> Note: `main.ts` does not exist until Task 7. Vite dev/build tolerates this only once the file exists. To keep this task self-contained, **temporarily** create an empty `web/src/learn/main.ts` containing `export {};` now; Task 7 replaces it.

- [ ] **Step 2: Create the temporary entry stub**

```bash
mkdir -p web/src/learn && printf 'export {};\n' > web/src/learn/main.ts
```

- [ ] **Step 3: Add the second Vite entry** — edit `web/vite.config.ts`, add a `build` block inside `defineConfig({...})` (alongside `plugins`, `base`, `server`, `test`):

```ts
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        learn: "learn.html",
      },
    },
  },
```

- [ ] **Step 4: Build and verify `dist/learn.html` is emitted and prerendered**

Run: `cd web && npm run build`
Expected: build succeeds; then:
Run: `test -f web/dist/learn.html && grep -c "How to play sudoku" web/dist/learn.html`
Expected: prints `1` or more (the title/H1 text is present in the built HTML — confirms prerender).
Run: `grep -o 'src="[^"]*learn[^"]*\.js"' web/dist/learn.html`
Expected: a hashed `./assets/learn-*.js` script tag (confirms the entry was bundled).

- [ ] **Step 5: Wire the server route** — edit `server/src/index.ts:224`, add `"learn"` and `export`:

```ts
export const LANDING_ROUTES = ["classic", "killer", "jigsaw", "xsudoku", "privacy", "learn"] as const;
```

(The existing `for (const slug of LANDING_ROUTES)` loop now serves `/learn` → `dist/learn.html`. No other change needed.)

- [ ] **Step 6: Write the server route test**

`server/src/landing-routes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { LANDING_ROUTES } from "./index.js";

describe("LANDING_ROUTES", () => {
  it("includes the learn page so /learn resolves to a prerendered file", () => {
    expect(LANDING_ROUTES).toContain("learn");
  });
});
```

- [ ] **Step 7: Run server tests**

Run: `cd server && npm test`
Expected: PASS (new test green; engine-spawning tests skip if no binary).

- [ ] **Step 8: Commit**

```bash
git add web/learn.html web/vite.config.ts web/src/learn/main.ts server/src/index.ts server/src/landing-routes.test.ts
git commit -m "feat(learn): prerendered /learn page shell + Vite entry + server route"
```

---

## Task 2: Static teaching content (the full SEO asset, no JS)

This task makes `/learn` a complete, shippable static teaching page. The widget (later tasks) only enhances it. Each animated technique gets a placeholder `<div data-lesson="…">` that **contains a static fallback** (a short worked-example description) so JS-off readers lose nothing.

**Files:**
- Modify: `web/learn.html`

- [ ] **Step 1: Insert the content sections** between the `<p><a class="cta" …></p>` line and the `<footer>` in `web/learn.html`. Use this exact structure and copy:

```html
      <h2>The goal</h2>
      <p>A sudoku is a 9×9 grid split into nine 3×3 boxes. Fill every empty cell with a digit from 1 to 9 so that each row, each column, and each 3×3 box contains all nine digits exactly once — no repeats anywhere. A proper puzzle has exactly one solution, so you never have to guess: every digit can be reasoned out.</p>

      <h2>Notes (pencil marks)</h2>
      <p>Once the obvious cells are filled, you track <em>candidates</em> — the digits still possible in a cell — as small "pencil marks." Notes are the backbone of every technique past the basics: pairs, pointing, and X-Wing are all patterns you spot in the candidates, not the solved digits. On Stillgrid you can pencil marks in by hand, or tap <strong>auto-pencil</strong> to fill every cell's candidates at once, and undo/redo is always one tap away.</p>

      <div class="lesson" data-lesson="intro">
        <p class="lesson-fallback">Worked example: when a cell's row, column, and box already use eight different digits, only one digit is left for it — place that digit.</p>
      </div>

      <h2>Beginning — what "Easy" means</h2>
      <p>Easy puzzles on Stillgrid are fully solvable with the two single-cell techniques below. If a puzzle never needs anything harder, the grader labels it Easy.</p>

      <h3>Naked single</h3>
      <p>A cell whose row, column, and box together already contain eight different digits has only one candidate left. That digit is forced.</p>
      <div class="lesson" data-lesson="naked-single">
        <p class="lesson-fallback">In the highlighted cell, the digits 1, 2, 3, 4, 5, 6, 8, and 9 already appear in its row, column, or box — so the cell must be 7.</p>
      </div>

      <h3>Hidden single</h3>
      <p>Sometimes a cell has several candidates, but within a whole row, column, or box only one cell can hold a particular digit. That digit is "hidden" among other candidates, but it's still forced into that one cell.</p>
      <div class="lesson" data-lesson="hidden-single">
        <p class="lesson-fallback">Across this box, only one cell can possibly hold a 4 — the other cells are blocked by a 4 elsewhere in their row or column — so that cell is 4.</p>
      </div>

      <h2>Middle — what "Medium" means</h2>
      <p>Medium puzzles need techniques that eliminate candidates across several cells before any single is revealed. They all operate on your notes.</p>

      <h3>Naked pair</h3>
      <p>If two cells in the same unit share the same two candidates and nothing else (say, only 3 and 7), then 3 and 7 are locked to those two cells — you can erase 3 and 7 from every other cell in that unit.</p>
      <div class="lesson" data-lesson="naked-pair">
        <p class="lesson-fallback">Two cells in this row both show only {3, 7}. So 3 and 7 can be removed from the other cells in the row, often exposing a single elsewhere.</p>
      </div>

      <h3>Hidden pair</h3>
      <p>The mirror image of a naked pair: if two digits can each only go in the same two cells of a unit, those cells form a pair — you can erase every <em>other</em> candidate from those two cells.</p>
      <div class="lesson" data-lesson="hidden-pair">
        <p class="lesson-fallback">In this box, the digits 2 and 5 can each only land in the same two cells. Those two cells are therefore {2, 5}, and any other candidates in them are removed.</p>
      </div>

      <h3>Pointing pair</h3>
      <p>When a digit's only candidates inside a box all sit in one row (or one column), that digit must come from that box along that line — so it can be erased from the rest of the row (or column) outside the box.</p>
      <div class="lesson" data-lesson="pointing-pair">
        <p class="lesson-fallback">Inside this box, the only cells that can hold a 6 lie in a single row. So 6 is removed from that row everywhere outside the box.</p>
      </div>

      <h2>Advanced — what "Hard" and "Diabolical" mean</h2>
      <p>These patterns span multiple rows and columns at once. They're powerful but rare — most graded puzzles never require them, which is why Hard and Diabolical puzzles are uncommon.</p>

      <h3>X-Wing</h3>
      <p>When a digit is a candidate in exactly two cells of one row, and in exactly two cells of a second row that line up in the same two columns, those four cells form a rectangle. The digit must occupy opposite corners — so it can be erased from those two columns everywhere else.</p>
      <div class="lesson" data-lesson="x-wing">
        <p class="lesson-fallback">A candidate 5 appears in just two columns across two rows, forming a rectangle. 5 is then removed from those two columns in all other rows.</p>
      </div>

      <h3>Swordfish, XY-Wing, and chains</h3>
      <p>Swordfish extends the X-Wing idea to three rows and columns. XY-Wing links three bivalue cells so a digit is eliminated where two of them see the same cell. Chains (coloring and alternating inference chains) follow strong/weak links between candidates to force eliminations. Stillgrid's grader uses all of these to label the very hardest puzzles — but generated puzzles rarely need them.</p>

      <h2>Variants &amp; sizes</h2>
      <p>Every technique above still applies in the variants — they just add or reshape the units you check.</p>

      <h3>X-Sudoku</h3>
      <p>Classic rules plus both main diagonals must each contain 1–9. The diagonals are two extra units to scan for singles, pairs, and pointing logic. <a href="/xsudoku">More about X-Sudoku →</a></p>
      <div class="lesson" data-lesson="x-sudoku">
        <p class="lesson-fallback">The two diagonals (highlighted) behave like extra rows: a digit already on a diagonal can't repeat anywhere else on it.</p>
      </div>

      <h3>Jigsaw</h3>
      <p>Nine irregular connected regions replace the 3×3 boxes. The logic is identical — each region still needs 1–9 exactly once — but the shapes change which cells "see" each other. <a href="/jigsaw">More about Jigsaw →</a></p>
      <div class="lesson" data-lesson="jigsaw">
        <p class="lesson-fallback">Each coloured region must contain 1–9 once, just like a box — but the region's odd shape changes which cells share a unit.</p>
      </div>

      <h3>Killer</h3>
      <p>Dashed cages with target sums replace given digits. On top of classic rules, the cells in a cage must add up to the target with no repeats — so cage-sum combinations become a technique of their own (a 3-cell cage summing to 6 can only be 1+2+3). <a href="/killer">More about Killer →</a></p>
      <div class="lesson" data-lesson="killer">
        <p class="lesson-fallback">A 3-cell cage summing to 7 can only be {1, 2, 4} — so 3, 5, 6, 7, 8, 9 are removed from every cell in the cage.</p>
      </div>

      <h3>Board sizes</h3>
      <p>Stillgrid plays at more than one size:</p>
      <ul>
        <li><strong>6×6</strong> — 2×3 boxes, digits 1–6. A gentle introduction; the same row/column/box logic on a smaller board.</li>
        <li><strong>9×9</strong> — the classic board everything above is taught on.</li>
        <li><strong>16×16</strong> — 4×4 boxes, digits shown as 1–9 then A–G. Much larger; best on a bigger screen. Currently available for Classic and X-Sudoku.</li>
      </ul>

      <h2>Common questions</h2>
      <div class="faq">
        <h3>How do I start a sudoku?</h3>
        <p>Scan each row, column, and 3×3 box for a cell that can only hold one digit — a naked single — and fill it in. As you place digits, more singles appear. When the obvious cells run out, start tracking candidates as pencil-mark notes and look for pairs and pointing patterns.</p>
        <h3>What is a naked single and a hidden single?</h3>
        <p>A naked single is a cell whose row, column, and box already use eight different digits, leaving only one possible digit for it. A hidden single is a digit that can only go in one cell of a given row, column, or box, even if that cell still shows other candidates.</p>
        <h3>What do notes or pencil marks do?</h3>
        <p>Notes let you record the candidate digits still possible in a cell. They're the basis of every technique past singles — pairs, pointing, and X-Wing are all patterns in the candidates. Stillgrid can auto-fill every cell's notes for you with auto-pencil.</p>
        <h3>How is sudoku difficulty graded on Stillgrid?</h3>
        <p>Stillgrid grades each puzzle by the hardest solving technique it actually requires, not by clue count. Easy solves with naked and hidden singles, Medium needs pairs and pointing, and Hard or Diabolical needs X-Wing, Swordfish, XY-Wing, or chains.</p>
        <h3>Is Stillgrid free?</h3>
        <p>Yes. Every puzzle, variant, and size is free to play, with no signup needed to start a puzzle.</p>
      </div>

      <h2>Try a variant</h2>
      <div class="variant-row">
        <a href="/classic">Classic</a>
        <a href="/xsudoku">X-Sudoku</a>
        <a href="/jigsaw">Jigsaw</a>
        <a href="/killer">Killer</a>
      </div>
```

- [ ] **Step 2: Verify the page renders with content**

Run: `cd web && npm run build && grep -c "Naked single" web/dist/learn.html`
Expected: prints `1` or more.

- [ ] **Step 3: Commit**

```bash
git add web/learn.html
git commit -m "feat(learn): full static teaching content (rules, notes, technique ladder, variants, FAQ)"
```

---

## Task 3: JSON-LD structured data + FAQ byte-match test

The `FAQPage` answer `text` must match the visible `<p>` copy **byte-for-byte** (Google requirement). A test enforces this so future edits can't silently break it.

**Files:**
- Modify: `web/learn.html`
- Create: `web/src/learn/learn-html.test.ts`

- [ ] **Step 1: Add three JSON-LD blocks** to the `<head>` of `web/learn.html`, just before `</head>`:

```html
    <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"HowTo","name":"How to play sudoku","description":"Fill a 9×9 grid so every row, column, and 3×3 box contains the digits 1 to 9 exactly once.","step":[{"@type":"HowToStep","name":"Understand the goal","text":"Fill every empty cell with a digit 1–9 so each row, column, and 3×3 box contains all nine digits exactly once."},{"@type":"HowToStep","name":"Place naked singles","text":"Find a cell whose row, column, and box already use eight different digits — only one digit is left, so place it."},{"@type":"HowToStep","name":"Find hidden singles","text":"Look for a digit that can only go in one cell of a row, column, or box, and place it there."},{"@type":"HowToStep","name":"Use pencil-mark notes","text":"When the obvious cells run out, track each cell's remaining candidates as notes and look for pairs and pointing patterns."}]}
    </script>
    <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"LearningResource","name":"How to play sudoku","description":"A tutorial covering sudoku rules, pencil-mark notes, and the technique ladder Stillgrid grades difficulty by.","learningResourceType":"Tutorial","educationalLevel":"Beginner to advanced","teaches":["Naked single","Hidden single","Naked pair","Hidden pair","Pointing pair","X-Wing","Swordfish","XY-Wing","Killer cage sums"],"inLanguage":"en","isAccessibleForFree":true,"url":"https://stillgrid.app/learn","publisher":{"@type":"Organization","name":"Stillgrid","url":"https://stillgrid.app"}}
    </script>
    <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"How do I start a sudoku?","acceptedAnswer":{"@type":"Answer","text":"Scan each row, column, and 3×3 box for a cell that can only hold one digit — a naked single — and fill it in. As you place digits, more singles appear. When the obvious cells run out, start tracking candidates as pencil-mark notes and look for pairs and pointing patterns."}},{"@type":"Question","name":"What is a naked single and a hidden single?","acceptedAnswer":{"@type":"Answer","text":"A naked single is a cell whose row, column, and box already use eight different digits, leaving only one possible digit for it. A hidden single is a digit that can only go in one cell of a given row, column, or box, even if that cell still shows other candidates."}},{"@type":"Question","name":"What do notes or pencil marks do?","acceptedAnswer":{"@type":"Answer","text":"Notes let you record the candidate digits still possible in a cell. They're the basis of every technique past singles — pairs, pointing, and X-Wing are all patterns in the candidates. Stillgrid can auto-fill every cell's notes for you with auto-pencil."}},{"@type":"Question","name":"How is sudoku difficulty graded on Stillgrid?","acceptedAnswer":{"@type":"Answer","text":"Stillgrid grades each puzzle by the hardest solving technique it actually requires, not by clue count. Easy solves with naked and hidden singles, Medium needs pairs and pointing, and Hard or Diabolical needs X-Wing, Swordfish, XY-Wing, or chains."}},{"@type":"Question","name":"Is Stillgrid free?","acceptedAnswer":{"@type":"Answer","text":"Yes. Every puzzle, variant, and size is free to play, with no signup needed to start a puzzle."}}]}
    </script>
```

> The `text` values above are copied verbatim from the visible FAQ `<p>` copy in Task 2. If you edit one, edit the other identically.

- [ ] **Step 2: Write the JSON-LD / FAQ-match test**

`web/src/learn/learn-html.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// web is ESM ("type": "module") — use import.meta.dirname, not __dirname.
const html = readFileSync(resolve(import.meta.dirname, "../../learn.html"), "utf8");

function jsonLdBlocks(src: string): unknown[] {
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  const out: unknown[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push(JSON.parse(m[1]!));
  return out;
}

describe("learn.html structured data", () => {
  const blocks = jsonLdBlocks(html);

  it("has HowTo, LearningResource, and FAQPage blocks that all parse", () => {
    const types = blocks.map((b) => (b as { "@type": string })["@type"]);
    expect(types).toContain("HowTo");
    expect(types).toContain("LearningResource");
    expect(types).toContain("FAQPage");
  });

  it("FAQ answer text appears verbatim in the visible HTML", () => {
    const faq = blocks.find((b) => (b as { "@type": string })["@type"] === "FAQPage") as {
      mainEntity: { acceptedAnswer: { text: string } }[];
    };
    for (const q of faq.mainEntity) {
      const text = q.acceptedAnswer.text;
      expect(html, `FAQ answer not found verbatim: ${text.slice(0, 40)}…`).toContain(text);
    }
  });
});
```

- [ ] **Step 3: Run the test**

Run: `cd web && npx vitest run src/learn/learn-html.test.ts`
Expected: PASS (3 blocks parse; every FAQ answer found verbatim). If the byte-match fails, reconcile the JSON-LD `text` with the visible `<p>`.

- [ ] **Step 4: Commit**

```bash
git add web/learn.html web/src/learn/learn-html.test.ts
git commit -m "feat(learn): HowTo + LearningResource + FAQPage JSON-LD with byte-match test"
```

---

## Task 4: Widget types + stepper (pure logic, TDD)

**Files:**
- Create: `web/src/learn/types.ts`
- Create: `web/src/learn/stepper.ts`
- Create: `web/src/learn/stepper.test.ts`

- [ ] **Step 1: Define the types**

`web/src/learn/types.ts`:

```ts
export type HighlightKind = "unit" | "target" | "elim" | "place";

export interface Highlight {
  cells: number[]; // flat indices into the size×size grid
  kind: HighlightKind;
}

export interface Cell {
  given?: number; // a clue/solved digit shown filled
  value?: number; // a digit placed by this step (animated "place")
  cands?: number[]; // pencil-mark candidates
}

export interface Step {
  caption: string;
  grid: Cell[]; // length === size*size
  highlights: Highlight[];
}

export interface Interactive {
  stepIndex: number; // which step accepts a click
  answerCell: number; // the correct cell index
  answerDigit: number; // the digit the learner should identify
}

export interface Lesson {
  id: string; // matches a data-lesson attribute in learn.html
  title: string;
  size: 6 | 9 | 16;
  steps: Step[];
  interactive?: Interactive;
}
```

- [ ] **Step 2: Write the failing stepper test**

`web/src/learn/stepper.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createStepper } from "./stepper";
import type { Lesson } from "./types";

const lesson: Lesson = {
  id: "t",
  title: "t",
  size: 9,
  steps: [
    { caption: "a", grid: Array(81).fill({}), highlights: [] },
    { caption: "b", grid: Array(81).fill({}), highlights: [] },
    { caption: "c", grid: Array(81).fill({}), highlights: [] },
  ],
};

describe("createStepper", () => {
  it("starts at 0", () => {
    const s = createStepper(lesson);
    expect(s.index).toBe(0);
    expect(s.atStart).toBe(true);
    expect(s.atEnd).toBe(false);
  });

  it("advances and clamps at the end", () => {
    const s = createStepper(lesson);
    expect(s.next()).toBe(true);
    expect(s.index).toBe(1);
    s.next();
    expect(s.atEnd).toBe(true);
    expect(s.next()).toBe(false); // no-op past the end
    expect(s.index).toBe(2);
  });

  it("goes back and clamps at the start", () => {
    const s = createStepper(lesson);
    s.next();
    expect(s.prev()).toBe(true);
    expect(s.index).toBe(0);
    expect(s.prev()).toBe(false);
  });

  it("restart returns to 0", () => {
    const s = createStepper(lesson);
    s.next();
    s.next();
    s.restart();
    expect(s.index).toBe(0);
  });

  it("current() returns the step at the index", () => {
    const s = createStepper(lesson);
    s.next();
    expect(s.current().caption).toBe("b");
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `cd web && npx vitest run src/learn/stepper.test.ts`
Expected: FAIL — `createStepper` is not defined / module not found.

- [ ] **Step 4: Implement the stepper**

`web/src/learn/stepper.ts`:

```ts
import type { Lesson, Step } from "./types";

export interface Stepper {
  readonly index: number;
  readonly atStart: boolean;
  readonly atEnd: boolean;
  current(): Step;
  next(): boolean;
  prev(): boolean;
  goTo(i: number): void;
  restart(): void;
}

export function createStepper(lesson: Lesson): Stepper {
  const last = lesson.steps.length - 1;
  let i = 0;
  const clamp = (n: number) => Math.max(0, Math.min(last, n));
  return {
    get index() {
      return i;
    },
    get atStart() {
      return i === 0;
    },
    get atEnd() {
      return i === last;
    },
    current() {
      return lesson.steps[i]!;
    },
    next() {
      if (i >= last) return false;
      i += 1;
      return true;
    },
    prev() {
      if (i <= 0) return false;
      i -= 1;
      return true;
    },
    goTo(n: number) {
      i = clamp(n);
    },
    restart() {
      i = 0;
    },
  };
}
```

- [ ] **Step 5: Run it to confirm it passes**

Run: `cd web && npx vitest run src/learn/stepper.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add web/src/learn/types.ts web/src/learn/stepper.ts web/src/learn/stepper.test.ts
git commit -m "feat(learn): lesson types + pure stepper state machine"
```

---

## Task 5: Lesson data + integrity test (TDD)

Author the animated lessons as data. **Write the integrity test first**, then add lessons until it passes for each. Below is one **fully worked lesson** (`naked-single`) as the template; author the rest the same way. All animated lessons use `size: 9`.

**Animated lessons to author** (ids must match the `data-lesson` placeholders from Task 2): `intro`, `naked-single`, `hidden-single`, `naked-pair`, `pointing-pair`, `x-wing`, `x-sudoku`, `jigsaw`, `killer`.
(`hidden-pair` has only a static fallback — no lesson data needed.)

**Files:**
- Create: `web/src/learn/lessons.ts`
- Create: `web/src/learn/lessons.test.ts`

- [ ] **Step 1: Write the failing integrity test**

`web/src/learn/lessons.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { LESSONS } from "./lessons";

const REQUIRED_IDS = [
  "intro",
  "naked-single",
  "hidden-single",
  "naked-pair",
  "pointing-pair",
  "x-wing",
  "x-sudoku",
  "jigsaw",
  "killer",
];

describe("LESSONS", () => {
  it("includes every required lesson id exactly once", () => {
    const ids = LESSONS.map((l) => l.id);
    for (const id of REQUIRED_IDS) {
      expect(ids.filter((x) => x === id)).toHaveLength(1);
    }
  });

  it("each lesson is internally consistent", () => {
    for (const l of LESSONS) {
      const cells = l.size * l.size;
      expect(l.steps.length, `${l.id} has steps`).toBeGreaterThan(0);
      for (const step of l.steps) {
        expect(step.caption.trim().length, `${l.id} caption non-empty`).toBeGreaterThan(0);
        expect(step.grid.length, `${l.id} grid is size²`).toBe(cells);
        for (const h of step.highlights) {
          for (const c of h.cells) {
            expect(c, `${l.id} highlight in range`).toBeGreaterThanOrEqual(0);
            expect(c, `${l.id} highlight in range`).toBeLessThan(cells);
          }
        }
        for (const cell of step.grid) {
          for (const d of cell.cands ?? []) {
            expect(d).toBeGreaterThanOrEqual(1);
            expect(d).toBeLessThanOrEqual(l.size);
          }
        }
      }
      if (l.interactive) {
        expect(l.interactive.stepIndex).toBeLessThan(l.steps.length);
        expect(l.interactive.answerCell).toBeGreaterThanOrEqual(0);
        expect(l.interactive.answerCell).toBeLessThan(cells);
        expect(l.interactive.answerDigit).toBeGreaterThanOrEqual(1);
        expect(l.interactive.answerDigit).toBeLessThanOrEqual(l.size);
      }
    }
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd web && npx vitest run src/learn/lessons.test.ts`
Expected: FAIL — `LESSONS` not defined.

- [ ] **Step 3: Create `lessons.ts` with the worked `naked-single` template**

`web/src/learn/lessons.ts`:

```ts
import type { Lesson } from "./types";

// Helper: build a 9×9 grid (81 cells). `givens` maps cell index → digit.
function grid9(givens: Record<number, number>): Lesson["steps"][number]["grid"] {
  return Array.from({ length: 81 }, (_, i) =>
    givens[i] !== undefined ? { given: givens[i] } : {},
  );
}

// row r (0-based), col c → flat index
const ix = (r: number, c: number) => r * 9 + c;

// --- naked-single: cell (4,4) sees 1,2,3,4,5,6,8,9 → must be 7 ---
const nakedSingleGivens: Record<number, number> = {
  // row 4 contributes 1,2,3 (cols 0,1,2) ; col 4 contributes 4,5,6 (rows 0,1,2) ;
  // box centre contributes 8,9 (cells (3,3),(5,5))
  [ix(4, 0)]: 1,
  [ix(4, 1)]: 2,
  [ix(4, 2)]: 3,
  [ix(0, 4)]: 4,
  [ix(1, 4)]: 5,
  [ix(2, 4)]: 6,
  [ix(3, 3)]: 8,
  [ix(5, 5)]: 9,
};

const nakedSingle: Lesson = {
  id: "naked-single",
  title: "Naked single",
  size: 9,
  steps: [
    {
      caption: "Look at the highlighted cell. What can it be?",
      grid: grid9(nakedSingleGivens),
      highlights: [{ cells: [ix(4, 4)], kind: "target" }],
    },
    {
      caption: "Its row already has 1, 2, 3; its column has 4, 5, 6; its box has 8, 9.",
      grid: grid9(nakedSingleGivens),
      highlights: [
        { cells: [ix(4, 0), ix(4, 1), ix(4, 2), ix(0, 4), ix(1, 4), ix(2, 4), ix(3, 3), ix(5, 5)], kind: "unit" },
        { cells: [ix(4, 4)], kind: "target" },
      ],
    },
    {
      caption: "Eight digits are used. Only 7 is left — place it.",
      grid: { ...grid9(nakedSingleGivens), [ix(4, 4)]: { value: 7 } } as Lesson["steps"][number]["grid"],
      highlights: [{ cells: [ix(4, 4)], kind: "place" }],
    },
  ],
};

export const LESSONS: Lesson[] = [nakedSingle];
```

> **Note on the step-3 grid:** spreading an array with a numeric key then casting is awkward; prefer a small mutable build. Replace the third step's `grid` with:
> ```ts
> grid: (() => { const g = grid9(nakedSingleGivens); g[ix(4, 4)] = { value: 7 }; return g; })(),
> ```

- [ ] **Step 4: Author the remaining eight lessons** following the same template, appending each to the `LESSONS` array. For each, build a small, valid worked example and 2–4 steps with captions. Use these specs (each must satisfy the integrity test):

  - **`intro`** — the most basic single, with an interactive moment. 2 steps; `interactive: { stepIndex: 0, answerCell: <the forced cell>, answerDigit: <digit> }`. Caption step 0: "Click the only cell that can be a 4." Step 1 confirms.
  - **`hidden-single`** — a box where only one cell can hold a 4 (the other cells blocked by a 4 in their row/column). Steps: show the box → highlight the blocked cells (kind `elim`) → place the 4 (kind `place`).
  - **`naked-pair`** — a row with two cells showing only `{3,7}` (use `cands: [3,7]`), other cells showing supersets. Steps: highlight the pair (`target`) → mark 3,7 removable elsewhere (`elim`) → result.
  - **`pointing-pair`** — a box where candidate 6 sits only in one row; remove 6 from that row outside the box. Steps: highlight box candidates → highlight the line (`unit`) → eliminations (`elim`) outside the box.
  - **`x-wing`** — candidate 5 in exactly two columns across two rows (rectangle). Steps: highlight the four corners (`target`) → highlight the two columns (`unit`) → eliminations (`elim`).
  - **`x-sudoku`** — same board idea but highlight a main diagonal as a `unit`; show a digit forced because the diagonal already holds the others. 2–3 steps.
  - **`jigsaw`** — represent one irregular region by listing its 9 cell indices in a `unit` highlight; show 1–9 must appear once. 2 steps. (Region shape is illustrative; pick any 9 connected indices.)
  - **`killer`** — a 3-cell cage summing to 7. Use three adjacent cells; caption walks {1,2,4} as the only combination. Steps: highlight the cage (`target`) → caption the combination → result candidates (`place`/`elim`). Cage borders are drawn by the widget from the highlight; sum text lives in the caption.

  After each lesson is added, re-run the integrity test (Step 5) to keep it green.

- [ ] **Step 5: Run the integrity test until green**

Run: `cd web && npx vitest run src/learn/lessons.test.ts`
Expected: PASS once all nine ids are present and consistent.

- [ ] **Step 6: Commit**

```bash
git add web/src/learn/lessons.ts web/src/learn/lessons.test.ts
git commit -m "feat(learn): animated lesson data + integrity tests"
```

---

## Task 6: Interactivity logic (`checkAnswer`, TDD)

**Files:**
- Create: `web/src/learn/answer.ts`
- Create: `web/src/learn/answer.test.ts`

- [ ] **Step 1: Write the failing test**

`web/src/learn/answer.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { checkAnswer } from "./answer";
import type { Interactive } from "./types";

const it_: Interactive = { stepIndex: 0, answerCell: 40, answerDigit: 4 };

describe("checkAnswer", () => {
  it("accepts the correct cell", () => {
    expect(checkAnswer(it_, 40)).toEqual({ correct: true, digit: 4 });
  });
  it("rejects a wrong cell", () => {
    expect(checkAnswer(it_, 12)).toEqual({ correct: false, digit: 4 });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd web && npx vitest run src/learn/answer.test.ts`
Expected: FAIL — `checkAnswer` not defined.

- [ ] **Step 3: Implement**

`web/src/learn/answer.ts`:

```ts
import type { Interactive } from "./types";

export interface AnswerResult {
  correct: boolean;
  digit: number;
}

export function checkAnswer(interactive: Interactive, clickedCell: number): AnswerResult {
  return { correct: clickedCell === interactive.answerCell, digit: interactive.answerDigit };
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `cd web && npx vitest run src/learn/answer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/learn/answer.ts web/src/learn/answer.test.ts
git commit -m "feat(learn): pure checkAnswer helper for interactive lessons"
```

---

## Task 7: DOM widget, mount, reduced-motion, CSS

This is the rendering layer — thin, wraps the tested logic. jsdom can't measure CSS transitions, so this task is verified by build + manual browser checks rather than unit assertions on animation.

**Files:**
- Create: `web/src/learn/widget.ts`
- Create: `web/src/learn/learn.css`
- Replace: `web/src/learn/main.ts` (the Task 1 stub)

- [ ] **Step 1: Write the widget renderer**

`web/src/learn/widget.ts`:

```ts
import type { Lesson, Step } from "./types";
import { createStepper } from "./stepper";
import { checkAnswer } from "./answer";

const prefersReducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const DIGITS = "123456789ABCDEFG"; // 16×16 renders 10–16 as A–G

function digitChar(d: number): string {
  return DIGITS[d - 1] ?? "";
}

export function mountLesson(host: HTMLElement, lesson: Lesson): void {
  host.textContent = ""; // remove the static fallback; JS takes over
  host.classList.add("lesson-live");

  const board = document.createElement("div");
  board.className = "lesson-board";
  board.style.setProperty("--n", String(lesson.size));
  board.setAttribute("role", "img");

  const caption = document.createElement("p");
  caption.className = "lesson-caption";
  caption.setAttribute("aria-live", "polite");

  const controls = document.createElement("div");
  controls.className = "lesson-controls";
  const prev = button("‹ Back");
  const next = button("Next ›");
  const restart = button("Restart");
  controls.append(prev, next, restart);

  host.append(board, caption, controls);

  const stepper = createStepper(lesson);
  const reduce = prefersReducedMotion();

  const cellEls: HTMLButtonElement[] = [];
  for (let i = 0; i < lesson.size * lesson.size; i++) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "lesson-cell";
    cell.dataset.idx = String(i);
    cellEls.push(cell);
    board.append(cell);
  }

  function paint(step: Step) {
    board.classList.toggle("reduce", reduce);
    const hl = new Map<number, string>();
    for (const h of step.highlights) for (const c of h.cells) hl.set(c, h.kind);
    cellEls.forEach((el, i) => {
      const cell = step.grid[i]!;
      el.className = "lesson-cell";
      const kind = hl.get(i);
      if (kind) el.classList.add(`hl-${kind}`);
      const digit = cell.value ?? cell.given;
      if (digit) {
        el.textContent = digitChar(digit);
        el.classList.toggle("given", cell.given !== undefined);
        el.classList.toggle("placed", cell.value !== undefined);
      } else if (cell.cands && cell.cands.length) {
        el.textContent = cell.cands.map(digitChar).join(" ");
        el.classList.add("cands");
      } else {
        el.textContent = "";
      }
    });
    caption.textContent = step.caption;
    board.setAttribute("aria-label", `${lesson.title}: ${step.caption}`);
    prev.disabled = stepper.atStart;
    next.disabled = stepper.atEnd;
    wireInteractive(step);
  }

  function wireInteractive(step: Step) {
    const inter = lesson.interactive;
    const active = inter && lesson.steps[inter.stepIndex] === step;
    cellEls.forEach((el) => {
      el.classList.toggle("clickable", Boolean(active));
      el.onclick = active
        ? () => {
            const res = checkAnswer(inter!, Number(el.dataset.idx));
            if (res.correct) {
              caption.textContent = `Correct — it must be ${digitChar(res.digit)}.`;
              if (stepper.next()) paint(stepper.current());
            } else {
              caption.textContent = "Not quite — that cell still has other options. Try again.";
            }
          }
        : null;
    });
  }

  prev.onclick = () => {
    if (stepper.prev()) paint(stepper.current());
  };
  next.onclick = () => {
    if (stepper.next()) paint(stepper.current());
  };
  restart.onclick = () => {
    stepper.restart();
    paint(stepper.current());
  };

  paint(stepper.current());

  // Gentle auto-advance for non-interactive lessons, motion allowed only.
  if (!reduce && !lesson.interactive) {
    const timer = setInterval(() => {
      if (!stepper.next()) {
        clearInterval(timer);
        return;
      }
      paint(stepper.current());
    }, 2600);
    // Stop auto-play as soon as the learner takes manual control.
    controls.addEventListener("click", () => clearInterval(timer), { once: true });
  }
}

function button(label: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "lesson-btn";
  b.textContent = label;
  return b;
}
```

- [ ] **Step 2: Write the widget CSS**

`web/src/learn/learn.css`:

```css
.lesson { margin: 1.25rem 0 2rem; }
.lesson-fallback { color: var(--color-ink-soft); font-size: 0.95rem; }

.lesson-board {
  display: grid;
  grid-template-columns: repeat(var(--n), 1fr);
  gap: 1px;
  max-width: 22rem;
  margin: 0 auto;
  background: var(--color-border);
  border: 2px solid var(--color-ink);
  border-radius: 4px;
  overflow: hidden;
}
.lesson-cell {
  aspect-ratio: 1;
  border: 0;
  background: var(--color-cream);
  font-family: "Fraunces", Georgia, serif;
  font-size: clamp(0.7rem, 3.4vw, 1.1rem);
  color: var(--color-ink);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: default;
  transition: background-color 0.4s ease, color 0.4s ease;
}
.lesson-board.reduce .lesson-cell { transition: none; }
.lesson-cell.given { font-weight: 600; }
.lesson-cell.placed { color: var(--accent, var(--color-sage)); font-weight: 600; }
.lesson-cell.cands {
  font-family: "Inter", sans-serif;
  font-size: 0.55rem;
  color: var(--color-ink-soft);
  letter-spacing: 0.04em;
}
.lesson-cell.hl-unit { background: #efe7d6; }
.lesson-cell.hl-target { background: #d9e6dd; outline: 2px solid var(--color-sage); outline-offset: -2px; }
.lesson-cell.hl-elim { background: #f0dcd2; text-decoration: line-through; }
.lesson-cell.hl-place { background: #d9e6dd; }
.lesson-cell.clickable { cursor: pointer; }
.lesson-cell.clickable:hover { background: #d9e6dd; }
.lesson-cell:focus-visible { outline: 2px solid var(--color-ink); outline-offset: -2px; }

.lesson-caption {
  text-align: center;
  margin: 0.9rem 0 0.6rem;
  min-height: 2.6em;
  color: var(--color-ink);
}
.lesson-controls { display: flex; justify-content: center; gap: 0.5rem; }
.lesson-btn {
  font-family: "Inter", sans-serif;
  font-size: 0.9rem;
  padding: 0.35rem 0.9rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-cream);
  color: var(--color-ink-soft);
  cursor: pointer;
  transition: all 0.15s ease;
}
.lesson-btn:hover:not(:disabled) { color: var(--accent, var(--color-sage)); border-color: var(--accent, var(--color-sage)); }
.lesson-btn:disabled { opacity: 0.4; cursor: default; }
.lesson-btn:focus-visible { outline: 2px solid var(--color-ink); outline-offset: 2px; }
```

- [ ] **Step 3: Replace the entry stub** — `web/src/learn/main.ts`:

```ts
import "./learn.css";
import { LESSONS } from "./lessons";
import { mountLesson } from "./widget";

document.querySelectorAll<HTMLElement>("[data-lesson]").forEach((el) => {
  const id = el.getAttribute("data-lesson");
  const lesson = LESSONS.find((l) => l.id === id);
  if (lesson) mountLesson(el, lesson);
});
```

- [ ] **Step 4: Typecheck + build**

Run: `cd web && npm run build`
Expected: `tsc -b` passes (strict), Vite emits `dist/learn.html` + a learn JS chunk that imports the CSS.

- [ ] **Step 5: Lint**

Run: `cd web && npm run lint`
Expected: no errors in `src/learn/`.

- [ ] **Step 6: Commit**

```bash
git add web/src/learn/widget.ts web/src/learn/learn.css web/src/learn/main.ts
git commit -m "feat(learn): DOM tutorial widget (stepper UI, interactivity, reduced-motion)"
```

---

## Task 8: Site wiring — nav link, variant-page links, sitemap, llms.txt

**Files:**
- Modify: `web/src/App.tsx:387`
- Modify: `web/public/{classic,killer,jigsaw,xsudoku}.html`
- Modify: `web/public/sitemap.xml`
- Modify: `web/public/llms.txt`

- [ ] **Step 1: Wire the topbar Learn link** — in `web/src/App.tsx`, change the Learn nav anchor:

```tsx
          <a href="/learn" className="hover:text-ink transition-colors">Learn</a>
```

(Leave Play/Daily/About as-is — out of scope.)

- [ ] **Step 2: Add a "Learn how to play" link to each variant page** — in each of `web/public/classic.html`, `killer.html`, `jigsaw.html`, `xsudoku.html`, add a link inside the existing `<div class="variant-row">` block (the row of cross-links near the footer):

```html
        <a href="/learn">Learn how to play</a>
```

- [ ] **Step 3: Add `/learn` to the sitemap** — in `web/public/sitemap.xml`, add before `</urlset>`:

```xml
  <url>
    <loc>https://stillgrid.app/learn</loc>
    <lastmod>2026-06-06</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
```

- [ ] **Step 4: Add `/learn` to llms.txt** — in `web/public/llms.txt`, add under the "About" section:

```
- [How to play sudoku](https://stillgrid.app/learn): Rules, pencil-mark notes, and the technique ladder Stillgrid grades difficulty by — singles, pairs, pointing, X-Wing, and beyond.
```

- [ ] **Step 5: Build the web app to confirm App.tsx still compiles**

Run: `cd web && npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add web/src/App.tsx web/public/classic.html web/public/killer.html web/public/jigsaw.html web/public/xsudoku.html web/public/sitemap.xml web/public/llms.txt
git commit -m "feat(learn): wire Learn into nav, variant pages, sitemap, and llms.txt"
```

---

## Task 9: Full verification (build, browser, a11y, CI gates)

**Files:** none (verification only).

- [ ] **Step 1: Run all web tests**

Run: `cd web && npm test`
Expected: PASS — stepper, lessons, answer, learn-html suites all green (plus existing analytics/boardState/storage).

- [ ] **Step 2: Full web CI gate**

Run: `cd web && npm run build && npm run lint && npm test`
Expected: all green.

- [ ] **Step 3: Server CI gate**

Run: `cd server && npm run build && npm test`
Expected: all green (landing-routes test passes).

- [ ] **Step 4: Serve the built app and load /learn in a browser**

Run: `cd server && SERVE_STATIC=1 WEB_DIST=../web/dist npm start` (or the project's standard serve command), then open `http://localhost:3001/learn`.
Verify by observation:
  - The page renders all sections with content.
  - The `naked-single` widget auto-advances through its steps, highlighting the unit and placing the 7.
  - The `intro` widget waits for a click; clicking the correct cell advances, a wrong cell shows the retry caption.
  - Back / Next / Restart work and Back is disabled on step 1.

- [ ] **Step 5: Reduced-motion check**

Enable "Reduce motion" in OS/browser settings, reload `/learn`.
Expected: no auto-play; lessons start on step 1 and only advance on Next; no cell transition animation.

- [ ] **Step 6: JS-off / SEO check**

Disable JavaScript, reload `/learn`.
Expected: every section still shows its teaching copy and each `.lesson-fallback` worked-example sentence is visible. View source: the three JSON-LD blocks and all FAQ copy are present in the served HTML.

- [ ] **Step 7: Lighthouse accessibility**

Run a Lighthouse audit (or `mcp__chrome-devtools__lighthouse_audit`) on `/learn`.
Expected: Accessibility score 100 (per the project's first-class a11y goal). Fix any contrast/label findings before completion.

- [ ] **Step 8: Final commit (if any fixes were made)**

```bash
git add -A
git commit -m "fix(learn): address verification findings"
```

> Do not push to `main`. Hand back to the user for review / branch + PR per their preference.

---

## Self-review notes (for the implementer)

- **Spec coverage:** hybrid static+JS (T1), widget renderer + reduced-motion + a11y (T7), data-driven lessons (T5), 9×9 default teaching + sizes section incl. 16×16-classic/X note and no-4×4 (T2), notes/pencil-marks teaching (T2), HowTo+FAQPage+LearningResource with byte-match (T3), LANDING_ROUTES + sitemap + llms.txt + nav + variant links (T1/T8). All present.
- **Interactivity** is limited to the `intro` lesson (spec non-goal: no full game/solver) — `checkAnswer` is the only validation path.
- **No 4×4** anywhere; sizes section covers 6/9/16 only with the 16×16 Classic/X caveat.

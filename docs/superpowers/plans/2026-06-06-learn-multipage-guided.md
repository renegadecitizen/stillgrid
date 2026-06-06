# Learn multi-page split + guided first game — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Split the single `/learn` page into four focused, cross-linked, prerendered pages (`/learn`, `/learn/core`, `/learn/advanced`, `/learn/variants`) and add a guided first-game interactive (~12 coached forced moves) on `/learn`.

**Architecture:** Four Vite entry HTML files (absolute `base:"/"`), served at nested URLs by new Express handlers. Content moves from the existing `learn.html`. A shared `grid.ts` board renderer backs both the existing step widget and a new guided-game controller. Pure logic (guided stepper, move validation) is TDD-tested; data is authored + logic-verified like the existing lessons.

**Tech Stack:** Vite 5 multi-page, TypeScript strict (ESM), vanilla DOM + CSS, vitest, Express static + routes.

**Spec:** `docs/superpowers/specs/2026-06-06-learn-multipage-guided-design.md`

**Branch:** continue on `learn-page`. No push to `main` without explicit confirmation; run web (`npm run build && npm test`) + server (`npm run build && npm test`) gates before any push. `npm run lint` is known-broken repo-wide (no ESLint 9 flat config) — do not treat its failure as this work's regression.

---

## File Structure

**Create:**
- `web/learn-core.html`, `web/learn-advanced.html`, `web/learn-variants.html` — new Vite entries.
- `web/src/learn/grid.ts` — shared board renderer (extracted from widget.ts).
- `web/src/learn/guided.ts` — guided-game data + pure controller.
- `web/src/learn/guided.test.ts` — guided controller + data integrity tests.
- `web/src/learn/guidedWidget.ts` — guided-game DOM layer.

**Modify:**
- `web/vite.config.ts` — `base:"/"`, add 3 entries.
- `web/learn.html` — trim to "How to play" + sub-nav + guided placeholder; distribute JSON-LD.
- `web/src/learn/widget.ts` — consume `grid.ts`.
- `web/src/learn/main.ts` — mount `[data-guided]` in addition to `[data-lesson]`.
- `web/src/learn/lessons.ts`, `lessons.test.ts` — remove the `intro` lesson.
- `web/src/learn/learn-html.test.ts` — generalize to all 4 pages.
- `server/src/index.ts`, `server/src/landing-routes.test.ts` — nested learn routes.
- `web/public/sitemap.xml`, `web/public/llms.txt` — new URLs.

---

## Task 1: Vite absolute base + verify SPA/PWA/landing unaffected

**Files:** Modify `web/vite.config.ts`

- [ ] **Step 1: Change the base.** In `web/vite.config.ts`, change `base: "./"` to `base: "/"`. Leave everything else (the existing `build.rollupOptions.input` from before, plugins, server, test) intact.

- [ ] **Step 2: Build.**
Run: `cd /Users/robertmccrady/stillgrid/web && npm run build`
Expected: success. Then confirm the SPA now uses absolute asset paths:
Run: `grep -o 'src="/assets/[^"]*main[^"]*\.js"' web/dist/index.html`
Expected: a `/assets/main-*.js` tag (absolute, leading slash).

- [ ] **Step 3: Serve and load-test the SPA, a landing page, and the existing learn page.**
Run: `cd /Users/robertmccrady/stillgrid/server && (node dist/index.js > /tmp/sg-t1.log 2>&1 &) ; sleep 2`
Then:
Run: `for u in / /classic /learn; do curl -s -o /dev/null -w "$u -> %{http_code}\n" http://localhost:3001$u; done`
Expected: all `200`.
Run: `JS=$(curl -s http://localhost:3001/ | grep -o '/assets/[^"]*main[^"]*\.js' | head -1); curl -s -o /dev/null -w "SPA bundle $JS -> %{http_code}\n" "http://localhost:3001$JS"`
Expected: `200` (SPA assets resolve under absolute base).
Run: `curl -s -o /dev/null -w "sw.js -> %{http_code}\n" http://localhost:3001/sw.js; curl -s -o /dev/null -w "manifest -> %{http_code}\n" http://localhost:3001/manifest.webmanifest`
Expected: both `200`.
Run: `pkill -f 'node dist/index.js' || true`

- [ ] **Step 4: Browser smoke (SPA still boots).** Using the chrome-devtools MCP (or manual): load `http://localhost:3001/` (after restarting the server), confirm the SPA renders a puzzle (no blank page / no 404 asset errors in console). If a separate dev server is already running on :5173, loading `/` there works too. Confirm no console errors referencing `/assets/`.

- [ ] **Step 5: Commit.**
```bash
cd /Users/robertmccrady/stillgrid && git add web/vite.config.ts && git commit -m "build(web): switch Vite base to absolute / for nested learn routes"
```

---

## Task 2: Extract shared `grid.ts` board renderer

Refactor the board-rendering bits out of `widget.ts` so both the step widget and the guided game share them. No behavior change.

**Files:** Create `web/src/learn/grid.ts`; Modify `web/src/learn/widget.ts`

- [ ] **Step 1: Create `web/src/learn/grid.ts`** with the shared pieces:

```ts
import type { Cell } from "./types";

const DIGITS = "123456789ABCDEFG"; // 16×16 renders 10–16 as A–G

export function digitChar(d: number): string {
  return DIGITS[d - 1] ?? "";
}

export function boxDims(size: number): { h: number; w: number } {
  return size === 6 ? { h: 2, w: 3 } : size === 16 ? { h: 4, w: 4 } : { h: 3, w: 3 };
}

// Build the size×size grid of cell buttons with bold box-divider classes baked in.
// Cells start out of the tab order (tabIndex -1); callers opt specific cells in.
export function buildCells(size: number): HTMLButtonElement[] {
  const box = boxDims(size);
  const cells: HTMLButtonElement[] = [];
  for (let i = 0; i < size * size; i++) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.tabIndex = -1;
    cell.dataset.idx = String(i);
    const r = Math.floor(i / size);
    const c = i % size;
    let boxCls = "";
    if ((c + 1) % box.w === 0 && c < size - 1) boxCls += " box-r";
    if ((r + 1) % box.h === 0 && r < size - 1) boxCls += " box-b";
    cell.dataset.box = boxCls;
    cell.className = "lesson-cell" + boxCls;
    cells.push(cell);
  }
  return cells;
}

// Reset a cell to its structural baseline (keeps box-divider classes, clears transient).
export function resetCell(el: HTMLButtonElement): void {
  el.className = "lesson-cell" + (el.dataset.box ?? "");
}

// Render a cell's contents (given/value/cands) onto an element. Caller adds highlights.
export function renderCellContent(el: HTMLButtonElement, cell: Cell): void {
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
}
```

- [ ] **Step 2: Refactor `web/src/learn/widget.ts` to use `grid.ts`.** Remove the local `DIGITS`/`digitChar` and the inline `box`/cell-creation loop and the content-rendering branch; import and use `buildCells`, `resetCell`, `renderCellContent`, `digitChar`, `boxDims` from `./grid`. Concretely:
  - Replace the top `const DIGITS = …; function digitChar(...) {...}` with `import { buildCells, resetCell, renderCellContent, digitChar } from "./grid";`.
  - Replace the `const box = …` + the `for` loop building `cellEls` with: `const cellEls = buildCells(lesson.size); cellEls.forEach((c) => board.append(c));`
  - In `paint`, replace `el.className = "lesson-cell" + (el.dataset.box ?? "");` + the given/value/cands branch with: `resetCell(el); const kind = hl.get(i); if (kind) el.classList.add(\`hl-${kind}\`); renderCellContent(el, step.grid[i]!);` (keep the highlight-map building and the caption/aria/disabled logic exactly as-is, and keep `wireInteractive`).
  - Keep `wireInteractive` and the rest unchanged.

- [ ] **Step 3: Typecheck + test (no behavior change).**
Run: `cd /Users/robertmccrady/stillgrid/web && npx tsc -b && npm test`
Expected: `tsc` exit 0; all 31 tests still PASS.

- [ ] **Step 4: Build.**
Run: `cd /Users/robertmccrady/stillgrid/web && npm run build`
Expected: success.

- [ ] **Step 5: Commit.**
```bash
cd /Users/robertmccrady/stillgrid && git add web/src/learn/grid.ts web/src/learn/widget.ts && git commit -m "refactor(learn): extract shared grid renderer for widget + guided game"
```

---

## Task 3: Split content into 4 pages + sub-nav

Move sections out of `learn.html` into 3 new entry files, add a shared sub-nav and next-links, and add the guided-game placeholder to `/learn`. HTML only (JSON-LD redistributed in Task 6; the guided interactive arrives in Tasks 7–9 — the placeholder keeps a static fallback meanwhile).

**Files:** Modify `web/learn.html`; Create `web/learn-core.html`, `web/learn-advanced.html`, `web/learn-variants.html`

- [ ] **Step 1: Define the shared sub-nav markup.** This block goes right after the `<h1>`+`.lede`+CTA on every page; mark the current page with `aria-current="page"`. Template (swap which link has `aria-current`):
```html
      <nav class="learn-nav" aria-label="Learn sections">
        <a href="/learn">How to play</a>
        <a href="/learn/core">Core techniques</a>
        <a href="/learn/advanced">Advanced</a>
        <a href="/learn/variants">Variants &amp; sizes</a>
      </nav>
```
Add to `web/src/learn/learn.css`:
```css
.learn-nav { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; margin: 0 0 2rem; font-size: 0.95rem; }
.learn-nav a { color: var(--color-ink-soft); text-decoration: none; }
.learn-nav a:hover { color: var(--accent, var(--color-sage)); }
.learn-nav a[aria-current="page"] { color: var(--color-ink); font-weight: 600; }
```
> Note: `learn.css` is imported by the widget bundle (`main.ts`), which every page loads, so `.learn-nav` styling is available on all 4 pages.

- [ ] **Step 2: Rewrite `web/learn.html` to "How to play".** Keep its `<head>` (update `<title>`/description to "How to play sudoku — Stillgrid"; keep canonical `https://stillgrid.app/learn`). Body keeps: brand, `<h1>How to play sudoku</h1>`, lede, CTA, the sub-nav (How-to-play current), `<h2>The goal</h2>` + para, `<h2>Notes (pencil marks)</h2>` + para, then the guided placeholder, then naked-single + hidden-single sections, then a "Common questions" FAQ (the 3 beginner Q&As: "How do I start a sudoku?", "What is a naked single and a hidden single?", "What do notes or pencil marks do?"), a "next →" link to `/learn/core`, and the footer. REMOVE from this page: the Middle/Advanced/Variants/sizes sections and the difficulty + free FAQ entries (they move). Guided placeholder:
```html
      <h2>Play your first game</h2>
      <p>The best way to learn is to solve. Work through the opening of a real puzzle below — each step shows you the one cell you can fill next and why.</p>
      <div class="guided" data-guided="first-game">
        <p class="lesson-fallback">Look for a cell whose row, column, and box already use eight different digits — only one digit can go there. Place it, and the next forced cell appears. Repeat: scan rows, columns, and boxes for cells with just one possibility.</p>
      </div>
```
Keep the existing `data-lesson="naked-single"` and `data-lesson="hidden-single"` blocks on this page (with their `<h3>`+prose+fallback). REMOVE the `data-lesson="intro"` block entirely (the guided game replaces it).
Add the next-link before the footer:
```html
      <p class="learn-next"><a href="/learn/core">Next: Core techniques →</a></p>
```

- [ ] **Step 3: Create `web/learn-core.html`.** Copy `learn.html`'s `<head>` structure; set `<title>Core sudoku techniques — pairs & pointing | Stillgrid</title>`, matching description, canonical `https://stillgrid.app/learn/core`, OG url `/learn/core`. Body: brand, `<h1>Core techniques</h1>`, a lede, CTA to `/`, sub-nav (Core current), the **Middle/Medium** content moved from the old learn.html (`<h2>Core techniques — what "Medium" means</h2>` intro para + Naked pair / Hidden pair / Pointing pair `<h3>`+prose+`data-lesson` blocks), a FAQ if desired (optional — may be empty here), prev/next links (`← How to play` / `Next: Advanced →`), footer. Include `<link rel="stylesheet" href="/landing.css">`, fonts, Plausible, and `<script type="module" src="/src/learn/main.ts"></script>` exactly like learn.html.

- [ ] **Step 4: Create `web/learn-advanced.html`.** Same skeleton; `<title>Advanced sudoku techniques — X-Wing, Swordfish | Stillgrid</title>`, canonical `/learn/advanced`. Body `<h1>Advanced techniques</h1>` + the **Advanced** content moved from old learn.html (the `<h2>Advanced — what "Nightmare" means</h2>` intro, X-Wing `<h3>`+`data-lesson="x-wing"`, and the "Swordfish, XY-Wing, and chains" `<h3>`+prose). Sub-nav (Advanced current), prev/next (`← Core` / `Next: Variants →`), footer, the script tag.

- [ ] **Step 5: Create `web/learn-variants.html`.** Skeleton; `<title>Sudoku variants & sizes — X, Jigsaw, Killer | Stillgrid</title>`, canonical `/learn/variants`. Body `<h1>Variants &amp; sizes</h1>` + the **Variants & sizes** content moved from old learn.html (X-Sudoku/Jigsaw/Killer `<h3>`+prose+`data-lesson` blocks incl. the `hidden-pair` static one if it belongs… NOTE: `hidden-pair` belongs on Core, keep it there), the Board sizes `<ul>`, and the variant FAQ (`How is sudoku difficulty graded` + `Is Stillgrid free`). Sub-nav (Variants current), prev link (`← Advanced`), the "Try a variant" row, footer, script tag.

- [ ] **Step 6: Verify build emits 4 pages with the right content.**
Run: `cd /Users/robertmccrady/stillgrid/web && npm run build`
Then:
Run: `for f in learn learn-core learn-advanced learn-variants; do echo -n "$f.html h1: "; grep -o '<h1>[^<]*</h1>' web/dist/$f.html; done`
Expected: each page's distinct H1.
Run: `grep -c 'data-guided' web/dist/learn.html` → `1`; `grep -c 'data-lesson="intro"' web/dist/learn.html` → `0`.
Run: `grep -c 'class="learn-nav"' web/dist/learn.html web/dist/learn-core.html web/dist/learn-advanced.html web/dist/learn-variants.html` → each `1`.

- [ ] **Step 7: Commit.**
```bash
cd /Users/robertmccrady/stillgrid && git add web/learn.html web/learn-core.html web/learn-advanced.html web/learn-variants.html web/src/learn/learn.css web/vite.config.ts && git commit -m "feat(learn): split into How-to-play / Core / Advanced / Variants pages with sub-nav"
```
> Note: `web/vite.config.ts` is also staged here because Task 3 adds the 3 new entries to `rollupOptions.input` — do that now: update the `input` object to `{ main: "index.html", learn: "learn.html", learnCore: "learn-core.html", learnAdvanced: "learn-advanced.html", learnVariants: "learn-variants.html" }`.

---

## Task 4: Nested server routes for the learn sub-pages

**Files:** Modify `server/src/index.ts`; Modify `server/src/landing-routes.test.ts`

- [ ] **Step 1: Add nested route handlers.** In `server/src/index.ts`, after the existing `LANDING_ROUTES` loop (inside the `if (SERVE_STATIC)` block), add:
```ts
  // Nested learn sub-pages → their flat dist filenames.
  const LEARN_SUBPAGES: Record<string, string> = {
    "/learn/core": "learn-core.html",
    "/learn/advanced": "learn-advanced.html",
    "/learn/variants": "learn-variants.html",
  };
  for (const [path, file] of Object.entries(LEARN_SUBPAGES)) {
    app.get(path, (_req, res) => {
      res.sendFile(resolve(WEB_DIST, file));
    });
  }
```
Also export the map for testing: change to `export const LEARN_SUBPAGES = { ... } as const;` declared at module top-level (next to `LANDING_ROUTES`), and reference it in the loop.

- [ ] **Step 2: Extend the test.** In `server/src/landing-routes.test.ts`, import `LEARN_SUBPAGES` and add:
```ts
describe("LEARN_SUBPAGES", () => {
  it("maps the three nested learn routes to their html files", () => {
    expect(Object.keys(LEARN_SUBPAGES)).toEqual(["/learn/core", "/learn/advanced", "/learn/variants"]);
    expect(LEARN_SUBPAGES["/learn/core"]).toBe("learn-core.html");
  });
});
```
(Update the existing import line to also import `LEARN_SUBPAGES`.)

- [ ] **Step 3: Build + test + manual.**
Run: `cd /Users/robertmccrady/stillgrid/server && npm run build && npm test`
Expected: build exit 0; tests PASS.
Run: `cd /Users/robertmccrady/stillgrid/server && (node dist/index.js > /tmp/sg-t4.log 2>&1 &); sleep 2; for u in /learn /learn/core /learn/advanced /learn/variants /learn/core/; do curl -s -o /dev/null -w "$u -> %{http_code} %{redirect_url}\n" http://localhost:3001$u; done; pkill -f 'node dist/index.js' || true`
Expected: `/learn`, `/learn/core`, `/learn/advanced`, `/learn/variants` → `200`; `/learn/core/` → `301` to `/learn/core`.

- [ ] **Step 4: Commit.**
```bash
cd /Users/robertmccrady/stillgrid && git add server/src/index.ts server/src/landing-routes.test.ts && git commit -m "feat(server): route nested /learn/{core,advanced,variants} to prerendered pages"
```

---

## Task 5: Remove the `intro` lesson (superseded by the guided game)

**Files:** Modify `web/src/learn/lessons.ts`, `web/src/learn/lessons.test.ts`

- [ ] **Step 1: Remove `intro` from `lessons.ts`.** Delete the `intro` lesson object and its entry in the `LESSONS` array (and any now-unused helper only it used). Keep all other lessons.

- [ ] **Step 2: Update the integrity test.** In `lessons.test.ts`, remove `"intro"` from `REQUIRED_IDS`. (The `toHaveLength(REQUIRED_IDS.length)` assertion then expects 8 lessons.)

- [ ] **Step 3: Test + typecheck.**
Run: `cd /Users/robertmccrady/stillgrid/web && npx tsc -b && npx vitest run src/learn/lessons.test.ts`
Expected: exit 0; tests PASS (8 lessons).

- [ ] **Step 4: Commit.**
```bash
cd /Users/robertmccrady/stillgrid && git add web/src/learn/lessons.ts web/src/learn/lessons.test.ts && git commit -m "refactor(learn): drop intro lesson (replaced by guided first game)"
```

---

## Task 6: Distribute JSON-LD + generalize the byte-match test

**Files:** Modify `web/learn.html`, `web/learn-core.html`, `web/learn-advanced.html`, `web/learn-variants.html`, `web/src/learn/learn-html.test.ts`

- [ ] **Step 1: Add JSON-LD per page.**
  - `web/learn.html`: keep `HowTo` (how to play) + `LearningResource`, and a `FAQPage` containing ONLY the 3 beginner Q&As present on that page ("How do I start a sudoku?", "What is a naked single and a hidden single?", "What do notes or pencil marks do?"). Each answer `text` must be byte-identical to that page's visible `<p>`.
  - `web/learn-variants.html`: a `FAQPage` with the 2 Q&As on that page ("How is sudoku difficulty graded on Stillgrid?", "Is Stillgrid free?") — byte-identical to its visible copy. Plus a `LearningResource` (teaches: the variant ideas).
  - `web/learn-core.html`, `web/learn-advanced.html`: a `LearningResource` each (`learningResourceType: "Tutorial"`, `teaches` listing that page's techniques, `isAccessibleForFree: true`, `inLanguage: "en"`, the page's canonical `url`). No FAQ required unless visible Q&As exist.
  Use the exact JSON-LD shapes from the original spec; only the `url`, `name`, `teaches`, and FAQ subsets change per page.

- [ ] **Step 2: Generalize `web/src/learn/learn-html.test.ts`** to iterate all 4 pages:
```ts
import { describe, it, expect } from "vitest";
import learn from "../../learn.html?raw";
import core from "../../learn-core.html?raw";
import advanced from "../../learn-advanced.html?raw";
import variants from "../../learn-variants.html?raw";

const PAGES: Record<string, string> = { learn, core, advanced, variants };
const LD_BLOCK = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;

function blocks(src: string): any[] {
  const out: any[] = [];
  let m: RegExpExecArray | null;
  LD_BLOCK.lastIndex = 0;
  while ((m = LD_BLOCK.exec(src))) out.push(JSON.parse(m[1]!));
  return out;
}

describe("learn pages structured data", () => {
  for (const [name, html] of Object.entries(PAGES)) {
    it(`${name}: all JSON-LD blocks parse`, () => {
      expect(blocks(html).length).toBeGreaterThan(0); // throws on invalid JSON
    });
    it(`${name}: every FAQ answer appears verbatim in the visible copy`, () => {
      const visible = html.replace(LD_BLOCK, "");
      const faq = blocks(html).find((b) => b["@type"] === "FAQPage") as
        | { mainEntity: { acceptedAnswer: { text: string } }[] }
        | undefined;
      for (const q of faq?.mainEntity ?? []) {
        expect(visible, `${name}: "${q.acceptedAnswer.text.slice(0, 40)}…"`).toContain(q.acceptedAnswer.text);
      }
    });
  }
});
```
> The `any` casts are acceptable here (test-only JSON parsing). If strict lint objects, type `blocks` as `unknown[]` and narrow with `as` at use sites as the prior version did.

- [ ] **Step 3: Run the test.**
Run: `cd /Users/robertmccrady/stillgrid/web && npx vitest run src/learn/learn-html.test.ts`
Expected: PASS for all 4 pages. Reconcile any FAQ `text` to the visible `<p>` if a mismatch is reported.

- [ ] **Step 4: Build (sanity).**
Run: `cd /Users/robertmccrady/stillgrid/web && npm run build`
Expected: success.

- [ ] **Step 5: Commit.**
```bash
cd /Users/robertmccrady/stillgrid && git add web/learn.html web/learn-core.html web/learn-advanced.html web/learn-variants.html web/src/learn/learn-html.test.ts && git commit -m "feat(learn): per-page JSON-LD + byte-match test across all 4 learn pages"
```

---

## Task 7: Guided-game data + pure controller (TDD)

**Files:** Create `web/src/learn/guided.ts`, `web/src/learn/guided.test.ts`

- [ ] **Step 1: Write the failing tests** `web/src/learn/guided.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { GUIDED_GAME, createGuided } from "./guided";

describe("GUIDED_GAME data", () => {
  it("has exactly 12 moves, all in range with non-empty captions", () => {
    expect(GUIDED_GAME.moves).toHaveLength(12);
    for (const m of GUIDED_GAME.moves) {
      expect(m.cell).toBeGreaterThanOrEqual(0);
      expect(m.cell).toBeLessThan(81);
      expect(m.digit).toBeGreaterThanOrEqual(1);
      expect(m.digit).toBeLessThanOrEqual(9);
      expect(m.caption.trim().length).toBeGreaterThan(0);
      for (const u of m.unit) {
        expect(u).toBeGreaterThanOrEqual(0);
        expect(u).toBeLessThan(81);
      }
    }
  });
  it("never targets a given cell", () => {
    for (const m of GUIDED_GAME.moves) {
      expect(GUIDED_GAME.givens[m.cell]).toBeUndefined();
    }
  });
});

describe("createGuided", () => {
  it("starts at move 0, not complete", () => {
    const g = createGuided(GUIDED_GAME);
    expect(g.index).toBe(0);
    expect(g.complete).toBe(false);
    expect(g.current().cell).toBe(GUIDED_GAME.moves[0]!.cell);
  });
  it("advances only on the correct cell", () => {
    const g = createGuided(GUIDED_GAME);
    const right = GUIDED_GAME.moves[0]!.cell;
    const wrong = right === 0 ? 1 : 0;
    expect(g.attempt(wrong)).toBe(false);
    expect(g.index).toBe(0);
    expect(g.attempt(right)).toBe(true);
    expect(g.index).toBe(1);
  });
  it("becomes complete after the last correct move", () => {
    const g = createGuided(GUIDED_GAME);
    for (const m of GUIDED_GAME.moves) g.attempt(m.cell);
    expect(g.complete).toBe(true);
  });
  it("placed() returns accumulated givens + placed digits", () => {
    const g = createGuided(GUIDED_GAME);
    g.attempt(GUIDED_GAME.moves[0]!.cell);
    const placed = g.placed();
    expect(placed[GUIDED_GAME.moves[0]!.cell]).toBe(GUIDED_GAME.moves[0]!.digit);
  });
});
```

- [ ] **Step 2: Run, confirm FAIL.**
Run: `cd /Users/robertmccrady/stillgrid/web && npx vitest run src/learn/guided.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `web/src/learn/guided.ts`** — the controller plus the authored game:
```ts
export interface GuidedMove {
  cell: number;     // flat index (row*9+col) the learner must fill
  digit: number;    // the forced digit
  unit: number[];   // cells to highlight as the forcing row/col/box
  caption: string;  // the coaching line
}
export interface GuidedGame {
  size: 9;
  givens: Record<number, number>;
  moves: GuidedMove[];
}

export interface Guided {
  readonly index: number;
  readonly complete: boolean;
  current(): GuidedMove;
  attempt(cell: number): boolean; // true if correct (advances), false otherwise
  placed(): Record<number, number>; // givens + digits placed so far
}

export function createGuided(game: GuidedGame): Guided {
  let i = 0;
  const placed: Record<number, number> = { ...game.givens };
  return {
    get index() {
      return i;
    },
    get complete() {
      return i >= game.moves.length;
    },
    current() {
      return game.moves[Math.min(i, game.moves.length - 1)]!;
    },
    attempt(cell: number) {
      if (i >= game.moves.length) return false;
      const move = game.moves[i]!;
      if (cell !== move.cell) return false;
      placed[move.cell] = move.digit;
      i += 1;
      return true;
    },
    placed() {
      return { ...placed };
    },
  };
}

// ---- The authored easy puzzle + its first 12 forced single placements ----
// AUTHORING REQUIREMENT: pick a real easy 9×9 puzzle with a unique solution.
// Each move below must be a genuine forced single AT THE BOARD STATE after the
// prior moves (a naked or hidden single), with `unit` = the cells that force it.
// Verify each move by hand/solver before finalizing (the reviewer will re-verify).
export const GUIDED_GAME: GuidedGame = {
  size: 9,
  givens: {
    /* AUTHORED: ~30+ clues of an easy puzzle, as index:digit pairs */
  },
  moves: [
    /* AUTHORED: 12 GuidedMove entries, each a forced single in solving order.
       Example shape:
       { cell: ix(0,2), digit: 4, unit: [ ...the row/col/box cells that rule out other digits... ],
         caption: "Row 1 already has 1, 2, 3, 5, 6, 7, 8, 9 — only 4 is left for this cell." },
    */
  ],
};
```
**Authoring sub-steps (do these to fill the `givens` and `moves`):**
  - Choose a known easy puzzle (e.g. generate one with the engine: `echo '{}' ` is not needed — instead run `engine/target/release/stillgrid-generate --size 9` if available, or use a well-known easy grid). Record its givens as `index:digit`.
  - Solve it by hand/with the engine; capture the first 12 cells that are forced singles in a natural solving order. For each, determine whether it's a naked single (its row+col+box leave one digit) or hidden single (only cell in a unit for that digit), set `unit` to the relevant forcing cells, and write a plain caption.
  - Add an `ix` helper at the top if useful: `const ix = (r: number, c: number) => r * 9 + c;`
  - Ensure no move targets a given cell and every move is genuinely forced at its state.

- [ ] **Step 4: Run until green.**
Run: `cd /Users/robertmccrady/stillgrid/web && npx vitest run src/learn/guided.test.ts && npx tsc -b`
Expected: tests PASS, tsc exit 0.

- [ ] **Step 5: Commit.**
```bash
cd /Users/robertmccrady/stillgrid && git add web/src/learn/guided.ts web/src/learn/guided.test.ts && git commit -m "feat(learn): guided-game data + pure controller (TDD)"
```

---

## Task 8: Guided-game DOM widget + mount

**Files:** Create `web/src/learn/guidedWidget.ts`; Modify `web/src/learn/main.ts`

- [ ] **Step 1: Create `web/src/learn/guidedWidget.ts`:**
```ts
import { GUIDED_GAME, createGuided, type GuidedGame } from "./guided";
import { buildCells, resetCell, renderCellContent, digitChar } from "./grid";

const prefersReducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export function mountGuided(host: HTMLElement, game: GuidedGame = GUIDED_GAME): void {
  host.textContent = "";
  host.classList.add("lesson-live");

  const board = document.createElement("div");
  board.className = "lesson-board";
  board.style.setProperty("--n", String(game.size));

  const caption = document.createElement("p");
  caption.className = "lesson-caption";
  caption.setAttribute("aria-live", "polite");

  host.append(board, caption);

  const cells = buildCells(game.size);
  cells.forEach((c) => board.append(c));

  const guided = createGuided(game);
  const reduce = prefersReducedMotion();

  function render() {
    const placed = guided.placed();
    const done = guided.complete;
    const move = guided.current();
    const unit = done ? new Set<number>() : new Set(move.unit);
    board.setAttribute("role", done ? "img" : "group");
    board.classList.toggle("reduce", reduce);
    cells.forEach((el, i) => {
      resetCell(el);
      const digit = placed[i];
      renderCellContent(el, digit ? { value: game.givens[i] !== undefined ? undefined : digit, given: game.givens[i] } : {});
      if (unit.has(i)) el.classList.add("hl-unit");
      const target = !done && i === move.cell;
      if (target) el.classList.add("hl-target");
      el.classList.toggle("clickable", target);
      el.tabIndex = target ? 0 : -1;
      const r = Math.floor(i / game.size) + 1;
      const c = (i % game.size) + 1;
      if (done) {
        el.removeAttribute("aria-label");
        el.setAttribute("aria-hidden", "true");
      } else {
        el.removeAttribute("aria-hidden");
        el.setAttribute("aria-label", digit ? `row ${r}, column ${c}, ${digitChar(digit)}` : `row ${r}, column ${c}, empty`);
      }
      el.onclick = target
        ? () => {
            if (guided.attempt(i)) {
              if (guided.complete) {
                renderDone();
              } else {
                caption.textContent = guided.current().caption;
                render();
              }
            } else {
              caption.textContent = "Not that one — look for the cell with only one option. Try again.";
            }
          }
        : null;
    });
    if (!done) {
      caption.textContent = move.caption;
      board.setAttribute("aria-label", `Guided game: ${move.caption}`);
    }
  }

  function renderDone() {
    render(); // repaint final board (all placed, role img)
    caption.textContent = "Nicely done — that's the core loop. Keep scanning rows, columns, and boxes for forced cells.";
    if (!host.querySelector(".guided-cta")) {
      const cta = document.createElement("p");
      cta.className = "guided-cta";
      const a = document.createElement("a");
      a.className = "cta";
      a.href = "/";
      a.textContent = "Play a full game →";
      cta.append(a);
      host.append(cta);
    }
  }

  // initial caption
  caption.textContent = guided.current().caption;
  render();
}
```
> If the `renderCellContent` call shape is awkward (it expects a `Cell`), simplify: build a `Cell` object `{ given: game.givens[i], value: (placed[i] !== undefined && game.givens[i] === undefined) ? placed[i] : undefined }` and pass it. The intent: givens render as `given` (bold), learner-placed digits render as `placed` (accent). Adjust to satisfy the `Cell` type from `types.ts` and TS strict.

- [ ] **Step 2: Add CSS** to `web/src/learn/learn.css`:
```css
.guided { margin: 1.25rem 0 2rem; }
.guided-cta { text-align: center; margin-top: 1.25rem; }
```

- [ ] **Step 3: Update `web/src/learn/main.ts`** to also mount the guided game:
```ts
import "./learn.css";
import { LESSONS } from "./lessons";
import { mountLesson } from "./widget";
import { mountGuided } from "./guidedWidget";

document.querySelectorAll<HTMLElement>("[data-lesson]").forEach((el) => {
  const id = el.getAttribute("data-lesson");
  const lesson = LESSONS.find((l) => l.id === id);
  if (lesson) mountLesson(el, lesson);
});

const guidedHost = document.querySelector<HTMLElement>("[data-guided]");
if (guidedHost) mountGuided(guidedHost);
```

- [ ] **Step 4: Typecheck + build + test.**
Run: `cd /Users/robertmccrady/stillgrid/web && npx tsc -b && npm run build && npm test`
Expected: tsc exit 0; build success (learn chunk now includes guided code); all tests PASS.

- [ ] **Step 5: Commit.**
```bash
cd /Users/robertmccrady/stillgrid && git add web/src/learn/guidedWidget.ts web/src/learn/main.ts web/src/learn/learn.css && git commit -m "feat(learn): guided first-game DOM widget mounted on /learn"
```

---

## Task 9: Wiring — sitemap + llms.txt

**Files:** Modify `web/public/sitemap.xml`, `web/public/llms.txt`

- [ ] **Step 1: sitemap.** Add three `<url>` entries before `</urlset>` (priority 0.6, weekly, lastmod 2026-06-06) for `https://stillgrid.app/learn/core`, `/learn/advanced`, `/learn/variants`.

- [ ] **Step 2: llms.txt.** Under the existing `/learn` line in the About section, add three indented detail lines (or sibling bullets) for the sub-pages:
```
- [Sudoku techniques: core](https://stillgrid.app/learn/core): Naked pair, hidden pair, and pointing pair — the Medium-tier techniques.
- [Sudoku techniques: advanced](https://stillgrid.app/learn/advanced): X-Wing, Swordfish, XY-Wing, and chains — the hardest patterns.
- [Sudoku variants & sizes](https://stillgrid.app/learn/variants): X-Sudoku, Jigsaw, Killer, and the 6×6/9×9/16×16 boards.
```

- [ ] **Step 3: Build + confirm.**
Run: `cd /Users/robertmccrady/stillgrid/web && npm run build && grep -c '/learn/' web/dist/sitemap.xml web/dist/llms.txt`
Expected: sitemap ≥3, llms.txt ≥3.

- [ ] **Step 4: Commit.**
```bash
cd /Users/robertmccrady/stillgrid && git add web/public/sitemap.xml web/public/llms.txt && git commit -m "feat(learn): add sub-pages to sitemap and llms.txt"
```

---

## Task 10: Full verification

**Files:** none.

- [ ] **Step 1: CI gates.**
Run: `cd /Users/robertmccrady/stillgrid/web && npm run build && npm test`
Run: `cd /Users/robertmccrady/stillgrid/server && npm run build && npm test`
Expected: all green.

- [ ] **Step 2: Serve and load all 4 pages + assets at nested depth.**
Run: `cd /Users/robertmccrady/stillgrid/server && (node dist/index.js > /tmp/sg-t10.log 2>&1 &); sleep 2; for u in /learn /learn/core /learn/advanced /learn/variants; do curl -s -o /dev/null -w "$u -> %{http_code}\n" http://localhost:3001$u; done`
Expected: all `200`. Then confirm assets resolve from a nested page:
Run: `JS=$(curl -s http://localhost:3001/learn/core | grep -o '/assets/[^"]*\.js' | head -1); curl -s -o /dev/null -w "asset $JS from /learn/core -> %{http_code}\n" "http://localhost:3001$JS"`
Expected: `200` (absolute base works at depth).

- [ ] **Step 3: Browser — guided game plays through.** Load `http://localhost:3001/learn` (or the :5173 dev page). Verify: the guided board renders with givens + box dividers; the first target cell is highlighted with its caption; clicking a wrong empty cell shows retry; clicking the correct cell places the digit and advances; completing all 12 moves shows the completion caption + "Play a full game →" CTA. Check console: no errors.

- [ ] **Step 4: Browser — sub-nav + cross-links.** From `/learn`, click through the sub-nav to Core/Advanced/Variants; confirm each loads at its nested URL with content and the current item marked. Confirm the technique widgets still animate on Core/Advanced and variants widgets on Variants.

- [ ] **Step 5: Reduced-motion + JS-off.** With reduced motion, guided game does not animate and steps only on click; with JS disabled, each page shows its full prose incl. the guided `.lesson-fallback` walkthrough.

- [ ] **Step 6: Lighthouse a11y on each page.** Run Lighthouse (navigation) on `/learn`, `/learn/core`, `/learn/advanced`, `/learn/variants`. Expected: Accessibility 100 on each (fix any `button-name`/contrast/role findings as in the prior round). Also confirm SEO stays 100.

- [ ] **Step 7: SPA + PWA regression.** Load `/` — SPA boots and plays (puzzle loads). Confirm the service worker registers without asset 404s (DevTools → Application, or console). Stop the server (`pkill -f 'node dist/index.js'`).

- [ ] **Step 8: Final commit (if fixes were made).**
```bash
cd /Users/robertmccrady/stillgrid && git add -A && git commit -m "fix(learn): address multi-page verification findings"
```
> Do not push. Hand back for review / branch decision.

---

## Self-review notes

- **Spec coverage:** 4 nested pages (T3,T4) with base:"/" (T1); shared grid renderer (T2); intro removed (T5); per-page JSON-LD + generalized byte-match (T6); guided data+controller TDD (T7) + DOM (T8); sitemap/llms (T9); verification incl. SPA/PWA + Lighthouse×4 (T10).
- **Type consistency:** `GuidedMove`/`GuidedGame`/`Guided` defined in T7 and consumed in T8; `grid.ts` exports (`buildCells`/`resetCell`/`renderCellContent`/`digitChar`/`boxDims`) defined T2 and consumed by widget.ts (T2) and guidedWidget.ts (T8).
- **Known soft spots:** the guided `givens`/`moves` are authored in T7 (logic-verified by implementer + reviewer, like the original lessons Task 5); the `renderCellContent` call in T8 may need the `Cell`-shape adjustment noted inline.
- **Risk:** the `base:"/"` change (T1) is the one cross-cutting change to the existing site — T1 and T10 both explicitly verify the SPA + PWA.

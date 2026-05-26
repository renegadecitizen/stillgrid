# Plausible Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Plausible Analytics to stillgrid: pageviews on all 5 HTML files plus 5 typed custom events (puzzle_started, puzzle_completed, puzzle_abandoned, daily_streak_milestone, first_visit_ever).

**Architecture:** Two-phase ship. Phase A adds the `<script>` tag to all 5 HTML files and ships in one deploy — verifies the foundation (pageviews) before adding code. Phase B adds the typed `analytics.ts` helper plus call sites in App.tsx and storage.ts, then ships in a second deploy.

**Tech Stack:** React 18 + Vite + TypeScript (strict + noUncheckedIndexedAccess), vanilla Plausible JS, Vitest for unit tests.

**Related spec:** [docs/superpowers/specs/2026-05-25-plausible-integration-design.md](../specs/2026-05-25-plausible-integration-design.md)

---

## File structure

**New files:**
- `web/src/analytics.ts` — typed event helper (~25 lines including types)
- `web/src/analytics.test.ts` — Vitest unit tests (~55 lines)

**Modified files:**
- `web/index.html` — add Plausible script tag
- `web/public/classic.html`, `killer.html`, `jigsaw.html`, `xsudoku.html` — add Plausible script tag
- `web/src/App.tsx` — add useRef import + 4 effect-based call sites (puzzle_started, puzzle_completed, puzzle_abandoned, daily_streak_milestone) + first_visit_ever in App() mount
- `web/src/storage.ts` — add `hasVisitedBefore()` / `markVisited()` helpers
- `CLAUDE.md` — add Analytics section

**No changes to:** `server/`, `engine/`, `web/vite.config.ts` (Vitest auto-discovers `*.test.ts`)

---

# Phase A — Foundation (script tag → 1 deploy)

After this phase, Plausible dashboard shows pageviews. No event-tracking code yet — that's Phase B.

## Task A1: Sign up at plausible.io and add stillgrid.app as a site

**Files:** none (browser action — outside the codebase but required prerequisite)

- [ ] **Step 1: Sign up + add site**

Open <https://plausible.io/register>. Sign up. Add `stillgrid.app` as a site (exact form: no protocol, no www, no trailing slash).

Plausible's onboarding will show a snippet with a unique per-site script ID. As of 2026, the format is "Plausible v2":

```html
<!-- Privacy-friendly analytics by Plausible -->
<script async src="https://plausible.io/js/pa-<UNIQUE_SITE_ID>.js"></script>
<script>window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()</script>
```

The script ID (e.g. `pa-HB79xhSO4XQqtCrZGd-vn`) is your site's identifier. Copy the EXACT snippet Plausible gives you — the script ID is what tells Plausible "this is stillgrid.app." It is NOT a secret; designed to be public.

After installing the snippet across the 5 HTML files and deploying, return to Plausible's onboarding "verify installation" step — once Plausible detects the script firing pageviews, the site is verified.

Outbound-link tracking and file-download tracking are toggled in the Plausible dashboard under site settings → "extensions" (or similar). Don't worry about it for Phase A — enable them later if you want them.

## Task A2: Add Plausible script tag to all 5 HTML files

**Files:**
- Modify: `web/index.html`
- Modify: `web/public/classic.html`
- Modify: `web/public/killer.html`
- Modify: `web/public/jigsaw.html`
- Modify: `web/public/xsudoku.html`

- [ ] **Step 1: Edit web/index.html — insert script after `<meta name="description">`, before `<link rel="canonical">`**

In `web/index.html`, find the existing line:

```html
    <meta name="description" content="A modern, mobile-first sudoku site with variants, technique-graded difficulty, daily challenges, and no signup. Play Classic, X-Sudoku, Jigsaw, and Killer." />
    <link rel="canonical" href="https://stillgrid.app/" />
```

Insert between those two lines (using the exact Plausible v2 snippet shipped for stillgrid.app — script ID `pa-HB79xhSO4XQqtCrZGd-vn`):

```html
    <!-- Privacy-friendly analytics by Plausible -->
    <script async src="https://plausible.io/js/pa-HB79xhSO4XQqtCrZGd-vn.js"></script>
    <script>window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()</script>
```

Result:

```html
    <meta name="description" content="A modern, mobile-first sudoku site with variants, technique-graded difficulty, daily challenges, and no signup. Play Classic, X-Sudoku, Jigsaw, and Killer." />
    <!-- Privacy-friendly analytics by Plausible -->
    <script async src="https://plausible.io/js/pa-HB79xhSO4XQqtCrZGd-vn.js"></script>
    <script>window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()</script>
    <link rel="canonical" href="https://stillgrid.app/" />
```

- [ ] **Step 2: Edit web/public/classic.html — insert snippet before `<style>:root...`**

Find this line in `web/public/classic.html`:

```html
    <style>:root { --accent: var(--color-sage); }</style>
```

Insert the SAME Plausible snippet (all 3 lines) IMMEDIATELY BEFORE it:

```html
    <!-- Privacy-friendly analytics by Plausible -->
    <script async src="https://plausible.io/js/pa-HB79xhSO4XQqtCrZGd-vn.js"></script>
    <script>window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()</script>
    <style>:root { --accent: var(--color-sage); }</style>
```

- [ ] **Step 3: Edit web/public/killer.html — same pattern**

The `--accent` value differs per variant (`--color-terracotta` for killer), but the Plausible snippet is identical. Insert the same 3-line snippet immediately before the `<style>:root...` line.

- [ ] **Step 4: Edit web/public/jigsaw.html — same pattern**

`--accent: var(--color-plum)`. Same snippet insertion.

- [ ] **Step 5: Edit web/public/xsudoku.html — same pattern**

`--accent: var(--color-teal)`. Same snippet insertion.

- [ ] **Step 6: Build web/ to verify Vite passes the script through cleanly**

```bash
npm --prefix web run build
```

Expected: build succeeds, no warnings about the new script tag. Then:

```bash
grep -c "plausible.io" web/dist/index.html
```

Expected output: `1`

```bash
ls web/dist/*.html
```

Expected: `web/dist/index.html` (the SPA entry). The four landing pages are static files in `web/public/` which Vite copies as-is to `web/dist/` — confirm:

```bash
grep -c "plausible.io" web/dist/classic.html web/dist/killer.html web/dist/jigsaw.html web/dist/xsudoku.html
```

Expected: `1` for each (4 lines of output, all `:1`).

- [ ] **Step 7: Commit**

```bash
git add web/index.html web/public/classic.html web/public/killer.html web/public/jigsaw.html web/public/xsudoku.html
git commit -m "Add Plausible Analytics script tag to all 5 HTML pages

Foundation commit for Plausible integration. Just the script tag —
gives us pageviews on all 5 indexable pages. Custom events come in a
follow-up commit per the two-phase plan.

Uses Plausible v2 snippet format (per-site script ID, async load,
inline init stub that queues calls before main script loads).
Outbound-link tracking is enabled via the Plausible dashboard's
site settings, not the URL.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 8: Ask user for explicit push approval**

Per the project's standing memory ([confirm-before-main-push](~/.claude/projects/-Users-robertmccrady-stillgrid/memory/confirm-before-main-push.md)), do NOT push to main without explicit yes from the user. Ask:

> "Phase A is committed locally. Push to main now? This triggers a Render auto-deploy to stillgrid.app (~3–6 min), and after that, Plausible should start showing pageviews when anyone visits."

Wait for the user's response. If yes, proceed to Step 9. If no, stop here; the user will push later.

- [ ] **Step 9: Push**

```bash
git push origin main
```

- [ ] **Step 10: Wait for deploy + verify**

Monitor the live commit SHA:

```bash
curl -s https://stillgrid.app/healthz | jq .commit
```

Repeat every 30–60s until the SHA matches the commit hash from Step 7's commit. Render takes 3–6 min.

Once live, visit each of the 5 pages in a real browser (Plausible doesn't count bot-style curl traffic):
- <https://stillgrid.app/>
- <https://stillgrid.app/classic>
- <https://stillgrid.app/killer>
- <https://stillgrid.app/jigsaw>
- <https://stillgrid.app/xsudoku>

Within 30s, the Plausible dashboard at <https://plausible.io/stillgrid.app> should show 5 unique pageviews (1 per page). If it shows 0:
- View the page source on each URL and confirm the `<script>` tag is present
- Check Plausible site settings — domain must be `stillgrid.app` exactly
- Disable browser ad-blockers (uBlock Origin blocks Plausible by default — try Safari or an incognito Chrome window without extensions)

Once you've confirmed pageviews land, Phase A is done.

---

# Phase B — Custom events (helper + call sites → 1 deploy)

After this phase, all 5 custom events fire and appear in the Plausible dashboard.

## Task B1: Create analytics.ts helper with TDD

**Files:**
- Create: `web/src/analytics.ts` (~25 lines)
- Create: `web/src/analytics.test.ts` (~55 lines)

Vitest is in `web/package.json` as `"test": "vitest run"`. No existing test files in web/ — this will be the first. Vitest auto-discovers `*.test.ts` next to source files; no config changes needed.

- [ ] **Step 1: Write the failing test file**

Create `web/src/analytics.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("analytics.track()", () => {
  beforeEach(() => {
    delete (window as { plausible?: unknown }).plausible;
    vi.resetModules();
  });

  it("no-ops in dev (PROD=false) even if window.plausible exists", async () => {
    vi.stubGlobal("import", { meta: { env: { PROD: false } } });
    const plausibleSpy = vi.fn();
    (window as { plausible?: unknown }).plausible = plausibleSpy;
    const { track } = await import("./analytics");

    track("first_visit_ever");

    expect(plausibleSpy).not.toHaveBeenCalled();
  });

  describe("in production (PROD=true)", () => {
    beforeEach(() => {
      vi.stubGlobal("import", { meta: { env: { PROD: true } } });
    });

    it("no-ops when window.plausible is undefined", async () => {
      const { track } = await import("./analytics");
      expect(() =>
        track("puzzle_started", { variant: "classic", tier: "easy", is_daily: false }),
      ).not.toThrow();
    });

    it("calls window.plausible with event name and props", async () => {
      const plausibleSpy = vi.fn();
      (window as { plausible?: unknown }).plausible = plausibleSpy;
      const { track } = await import("./analytics");

      track("puzzle_completed", {
        variant: "classic",
        tier: "easy",
        is_daily: false,
        duration_seconds: 120,
      });

      expect(plausibleSpy).toHaveBeenCalledWith("puzzle_completed", {
        props: { variant: "classic", tier: "easy", is_daily: false, duration_seconds: 120 },
      });
    });

    it("calls window.plausible with no opts when no props passed", async () => {
      const plausibleSpy = vi.fn();
      (window as { plausible?: unknown }).plausible = plausibleSpy;
      const { track } = await import("./analytics");

      track("first_visit_ever");

      expect(plausibleSpy).toHaveBeenCalledWith("first_visit_ever", undefined);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails (no analytics.ts yet)**

```bash
npm --prefix web test
```

Expected: tests fail with "Cannot find module './analytics'" or similar. This is the desired failure — confirms the test harness is working.

- [ ] **Step 3: Create analytics.ts**

Create `web/src/analytics.ts`:

```ts
type EventName =
  | "puzzle_started"
  | "puzzle_completed"
  | "puzzle_abandoned"
  | "daily_streak_milestone"
  | "first_visit_ever";

type EventProps = Record<string, string | number | boolean>;

declare global {
  interface Window {
    plausible?: (event: string, opts?: { props?: EventProps }) => void;
  }
}

const ENABLED = import.meta.env.PROD;

export function track(event: EventName, props?: EventProps): void {
  if (!ENABLED) return;
  if (typeof window.plausible !== "function") return;
  window.plausible(event, props ? { props } : undefined);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm --prefix web test
```

Expected: all 4 tests pass.

- [ ] **Step 5: Build to confirm TypeScript strict-mode happy**

```bash
npm --prefix web run build
```

Expected: success.

- [ ] **Step 6: Commit**

```bash
git add web/src/analytics.ts web/src/analytics.test.ts
git commit -m "Add typed analytics.ts helper for Plausible custom events

Single track() function with EventName union for type safety.
- No-ops in dev (import.meta.env.PROD false)
- No-ops when window.plausible isn't loaded (ad blocker / slow / missing script)
- Snake_case event names per Plausible convention

First test file in web/. Vitest auto-discovers — no config change.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

## Task B2: Add first_visit_ever flag helpers to storage.ts

**Files:**
- Modify: `web/src/storage.ts` (append ~20 lines at the bottom)

- [ ] **Step 1: Append helpers to storage.ts**

At the END of `web/src/storage.ts` (after the existing `getStreak()` function at line 187), append:

```ts

// --- First-visit tracking (for Plausible first_visit_ever event) -----------

const FIRST_VISIT_KEY = "stillgrid:first_visit:v1";

export function hasVisitedBefore(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(FIRST_VISIT_KEY) !== null;
  } catch {
    return false;
  }
}

export function markVisited(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FIRST_VISIT_KEY, new Date().toISOString());
  } catch {
    /* quota / disabled — silently ignore */
  }
}
```

Versioned key `stillgrid:first_visit:v1` matches the existing schema (`stillgrid:bests:v1`, `stillgrid:daily:v1`).

- [ ] **Step 2: Typecheck**

```bash
npm --prefix web run build
```

Expected: success.

- [ ] **Step 3: Commit**

```bash
git add web/src/storage.ts
git commit -m "Add hasVisitedBefore/markVisited helpers to storage.ts

Versioned localStorage key stillgrid:first_visit:v1 for Plausible's
first_visit_ever event. Matches existing storage key pattern.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

## Task B3: Wire puzzle_started + first_visit_ever in App.tsx

**Files:**
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Update imports at the top**

In `web/src/App.tsx`, find the existing import block (lines 1-11):

```ts
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getBest,
  recordRun,
  getStreak,
  markDailyDone,
  getDailyDone,
  todayKey,
  type Best,
  type RecordOutcome,
} from "./storage";
```

Replace with:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getBest,
  recordRun,
  getStreak,
  markDailyDone,
  getDailyDone,
  todayKey,
  hasVisitedBefore,
  markVisited,
  type Best,
  type RecordOutcome,
} from "./storage";
import { track } from "./analytics";
```

(`useRef` added — used in Task B5 for the abandoned event. `hasVisitedBefore`/`markVisited` added — used in this task. `track` added — used in all event tasks.)

- [ ] **Step 2: Add first_visit_ever mount effect in App()**

In the `App()` function body (starts around line 83), AFTER the existing mount effect at line 180:

```ts
  useEffect(() => load("classic", ""), []);
```

INSERT this new effect immediately after:

```ts
  // Fire first_visit_ever once per browser (localStorage-flagged).
  // Mount-only effect — empty deps array.
  useEffect(() => {
    if (!hasVisitedBefore()) {
      track("first_visit_ever");
      markVisited();
    }
  }, []);
```

- [ ] **Step 3: Add puzzle_started effect in Game component**

The Game component starts around line 419. Find the existing reset effect at lines 455-464:

```ts
  // Reset everything on puzzle change
  useEffect(() => {
    setSelected(null);
    setNotesMode(false);
    setHistory([initialState(puzzle.givens)]);
    setHistoryIdx(0);
    setStartedAt(null);
    setMistakes(0);
    setFinishedAt(null);
    setOutcome(null);
  }, [puzzle.givens]);
```

INSERT a SEPARATE effect IMMEDIATELY AFTER it (analytics-only, strict deps):

```ts
  // Track puzzle_started on every new puzzle load.
  // Strict deps: puzzle.variant, tierBucket, dailyTag change in lockstep
  // with puzzle.givens, so we deliberately omit them to keep this single-fire.
  useEffect(() => {
    track("puzzle_started", {
      variant: puzzle.variant,
      tier: tierBucket ?? "any",
      is_daily: dailyTag !== null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle.givens]);
```

- [ ] **Step 4: Build to typecheck**

```bash
npm --prefix web run build
```

Expected: success. If you see ESLint complaining about `exhaustive-deps`, the `eslint-disable-next-line` comment should silence it — verify the comment is on the line immediately preceding the deps array.

- [ ] **Step 5: Manual smoke test in dev**

```bash
make dev
```

Open <http://localhost:5173> in your browser. Open DevTools console.

Expected:
- No console errors
- `window.plausible` is undefined (no script in dev — Vite's dev server doesn't inject it)
- `import.meta.env.PROD` is `false`, so `track()` calls no-op silently
- The first-visit-flag in localStorage IS being set (you can verify with `localStorage.getItem("stillgrid:first_visit:v1")` in DevTools) — but the actual event call no-ops

This is the correct dev behavior. No events visible until production deploy.

- [ ] **Step 6: Commit**

```bash
git add web/src/App.tsx
git commit -m "Wire puzzle_started + first_visit_ever Plausible events

Two new useEffect calls in App.tsx:
- puzzle_started: fires on every puzzle.givens change in Game component
- first_visit_ever: fires once per browser on App mount (localStorage-flagged)

Both no-op in dev via analytics.ts's PROD check.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

## Task B4: Wire puzzle_completed in App.tsx

**Files:**
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Add track() call after recordRun() succeeds**

Find the existing solve-detection effect at lines 599-629. Locate this section:

```ts
    setOutcome(result);
    setCurrentBest(result.best);

    // If this puzzle came from "Daily", mark it.
    if (dailyTag) {
```

INSERT a `track()` call between `setCurrentBest(result.best);` and the `// If this puzzle came from "Daily"` comment:

```ts
    setOutcome(result);
    setCurrentBest(result.best);

    track("puzzle_completed", {
      variant: puzzle.variant,
      tier: tierBucket ?? "any",
      is_daily: dailyTag !== null,
      duration_seconds: seconds,
    });

    // If this puzzle came from "Daily", mark it.
    if (dailyTag) {
```

`used_hint` prop is intentionally NOT included — no hint feature exists in the codebase. Per spec, add this prop when the hint UI ships.

- [ ] **Step 2: Build to typecheck**

```bash
npm --prefix web run build
```

Expected: success.

- [ ] **Step 3: Commit**

```bash
git add web/src/App.tsx
git commit -m "Wire puzzle_completed Plausible event

Fires inside the existing solve-detection effect right after recordRun()
succeeds. Includes variant, tier, is_daily, duration_seconds props.

used_hint prop deferred per spec — hint feature doesn't exist yet.
When hint UI ships, add the prop here and update the spec.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

## Task B5: Wire puzzle_abandoned in App.tsx

This is the trickiest wiring. When a new puzzle loads (`puzzle.givens` changes), we want to know whether the PREVIOUS puzzle was in progress and unsolved. The reset effect can't see previous-render state directly. Use a ref to capture in-progress state continuously, then read it from the reset effect.

**Files:**
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Add prevInProgressRef declaration in Game**

Find the Game component's state declarations (around lines 440-444):

```ts
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const [mistakes, setMistakes] = useState(0);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<RecordOutcome | null>(null);
```

INSERT immediately after the `setOutcome` line:

```ts
  // For puzzle_abandoned tracking: snapshot of current in-progress state.
  // Read by the reset effect when puzzle.givens changes to decide whether
  // to fire puzzle_abandoned for the OUTGOING puzzle.
  const prevInProgressRef = useRef<{
    variant: string;
    tier: string | null;
    progressPct: number;
  } | null>(null);
```

- [ ] **Step 2: Add ref-update effect**

The Game component has `const state = history[historyIdx]!;` at line 438. We can use `state.values` (Uint8Array of 81 cells) and `state.givenMask` (Uint8Array of 81, 1 if given) directly.

Find the puzzle_started effect added in Task B3 (the one with `track("puzzle_started", ...)`). INSERT this new effect IMMEDIATELY AFTER it:

```ts
  // Keep prevInProgressRef current while THIS puzzle is in progress.
  // When the puzzle is solved (finishedAt set) or abandoned (reset effect
  // fires), the ref is cleared.
  useEffect(() => {
    if (startedAt !== null && finishedAt === null) {
      const givenCount = state.givenMask.reduce((a, b) => a + b, 0);
      const userCells = 81 - givenCount;
      let userFilled = 0;
      for (let i = 0; i < 81; i++) {
        if ((state.givenMask[i] ?? 0) === 0 && (state.values[i] ?? 0) !== 0) {
          userFilled += 1;
        }
      }
      const progressPct = userCells === 0 ? 0 : Math.floor((userFilled / userCells) * 100);
      prevInProgressRef.current = {
        variant: puzzle.variant,
        tier: tierBucket,
        progressPct,
      };
    } else if (finishedAt !== null) {
      // Puzzle finished — not an abandonment candidate
      prevInProgressRef.current = null;
    }
  }, [startedAt, finishedAt, state, puzzle.variant, tierBucket]);
```

The loop uses `?? 0` on the Uint8Array index access because TypeScript's `noUncheckedIndexedAccess` types index access as `number | undefined`. Falling back to 0 for both `givenMask[i]` (mask defaults to "not given") and `values[i]` (value defaults to "empty") gives correct semantics.

- [ ] **Step 3: Fire puzzle_abandoned at the top of the reset effect**

Find the existing reset effect (originally at lines 455-464, now possibly shifted by Task B3's insertion). Locate this exact code:

```ts
  // Reset everything on puzzle change
  useEffect(() => {
    setSelected(null);
    setNotesMode(false);
    setHistory([initialState(puzzle.givens)]);
    setHistoryIdx(0);
    setStartedAt(null);
    setMistakes(0);
    setFinishedAt(null);
    setOutcome(null);
  }, [puzzle.givens]);
```

Replace with:

```ts
  // Reset everything on puzzle change. First, if the PREVIOUS puzzle was in
  // progress and never completed, fire puzzle_abandoned with its last-seen
  // state. The ref is updated continuously by the effect above while a
  // puzzle is in progress.
  useEffect(() => {
    const prev = prevInProgressRef.current;
    if (prev !== null) {
      track("puzzle_abandoned", {
        variant: prev.variant,
        tier: prev.tier ?? "any",
        progress_pct: prev.progressPct,
      });
      prevInProgressRef.current = null;
    }

    setSelected(null);
    setNotesMode(false);
    setHistory([initialState(puzzle.givens)]);
    setHistoryIdx(0);
    setStartedAt(null);
    setMistakes(0);
    setFinishedAt(null);
    setOutcome(null);
  }, [puzzle.givens]);
```

- [ ] **Step 4: Build to typecheck**

```bash
npm --prefix web run build
```

Expected: success. If you see "Property 'reduce' does not exist on type 'Uint8Array'", you're on an old TypeScript lib target — verify `web/tsconfig.json`'s `lib` includes `"ES2015"` or higher. The current project uses TypeScript 5.7 which has `Uint8Array.reduce` fully typed.

- [ ] **Step 5: Commit**

```bash
git add web/src/App.tsx
git commit -m "Wire puzzle_abandoned Plausible event

Uses a useRef to snapshot in-progress puzzle state continuously while
the user plays. When puzzle.givens next changes (new puzzle loaded),
the reset effect reads the ref to decide whether to fire abandoned
for the outgoing puzzle.

progress_pct counts only user-entered cells (excludes givens). For
killer puzzles with 0 givens, denominator is 81. Matches the spec.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

## Task B6: Wire daily_streak_milestone in App.tsx

**Files:**
- Modify: `web/src/App.tsx`

This event fires when a daily-challenge completion bumps the streak to a notable length (7, 14, 30, 60, 90, 180, 365 days). Naturally idempotent because `markDailyDone` is idempotent — re-completing the same day doesn't change `getStreak()`'s result.

- [ ] **Step 1: Add milestone tracking inside the daily-completion branch**

Find the existing `if (dailyTag) { ... }` block inside the solve-detection effect. After Tasks B3/B4 it should look like this:

```ts
    if (dailyTag) {
      markDailyDone(dailyTag.date, dailyTag.kind, {
        timeSec: seconds,
        mistakes,
        score: scoreValue,
      });
      // Force the streak widget to refresh next render.
      window.dispatchEvent(new CustomEvent("stillgrid:dailyDone"));
    }
```

Replace with:

```ts
    if (dailyTag) {
      markDailyDone(dailyTag.date, dailyTag.kind, {
        timeSec: seconds,
        mistakes,
        score: scoreValue,
      });

      // Fire daily_streak_milestone if this completion crosses a notable
      // streak length. getStreak() recomputes from the daily-done store,
      // so call it AFTER markDailyDone to get the post-completion value.
      const streakAfter = getStreak();
      const STREAK_MILESTONES = [7, 14, 30, 60, 90, 180, 365];
      if (STREAK_MILESTONES.includes(streakAfter)) {
        track("daily_streak_milestone", { length: streakAfter });
      }

      // Force the streak widget to refresh next render.
      window.dispatchEvent(new CustomEvent("stillgrid:dailyDone"));
    }
```

- [ ] **Step 2: Build to typecheck**

```bash
npm --prefix web run build
```

Expected: success.

- [ ] **Step 3: Commit**

```bash
git add web/src/App.tsx
git commit -m "Wire daily_streak_milestone Plausible event

Fires when daily-challenge completion brings the streak length to
one of [7, 14, 30, 60, 90, 180, 365] days.

Naturally idempotent because markDailyDone is idempotent — re-completing
the same day's daily doesn't change getStreak()'s result, so the
milestone condition won't double-fire.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

## Task B7: Add Analytics section to CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Insert new section**

In `CLAUDE.md`, find the existing section heading `## Storage / state`. AFTER the entire Storage section's content (before the next `##` heading, which is `## Conventions`), insert:

```markdown
## Analytics

Plausible Analytics (hosted, plausible.io) is the source of truth for product metrics.

- Script tag in all 5 HTML files (`web/index.html` + `web/public/*.html`).
- Typed event helper at `web/src/analytics.ts` — single `track(eventName, props?)` function.
- Five custom events: `puzzle_started`, `puzzle_completed`, `puzzle_abandoned`, `daily_streak_milestone`, `first_visit_ever`.
- Dev mode no-ops via `import.meta.env.PROD` check — localhost traffic doesn't pollute prod stats.
- Dashboard: https://plausible.io/stillgrid.app
- Full spec: `docs/superpowers/specs/2026-05-25-plausible-integration-design.md`

To add a new event:
1. Add the name to the `EventName` union in `web/src/analytics.ts`.
2. Add a row to the event taxonomy table in the spec doc.
3. Call `track("event_name", { ...props })` from the appropriate handler.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "Document Plausible Analytics in CLAUDE.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

## Task B8: Final verification + push

**Files:** none (push + manual verification)

- [ ] **Step 1: Confirm all Phase B local commits**

```bash
git log origin/main..main --oneline
```

Expected: see commits from Phase A (if not yet pushed) plus all Phase B commits. From Phase B you should see:

1. Add typed analytics.ts helper for Plausible custom events
2. Add hasVisitedBefore/markVisited helpers to storage.ts
3. Wire puzzle_started + first_visit_ever Plausible events
4. Wire puzzle_completed Plausible event
5. Wire puzzle_abandoned Plausible event
6. Wire daily_streak_milestone Plausible event
7. Document Plausible Analytics in CLAUDE.md

If Phase A wasn't pushed yet, also see the script-tag commit.

- [ ] **Step 2: Run the test suite once more**

```bash
npm --prefix web test
```

Expected: all 4 analytics.ts tests pass.

```bash
npm --prefix web run build
```

Expected: build succeeds.

- [ ] **Step 3: Ask user for explicit push approval**

Per the project's standing memory, do NOT push to main without explicit yes. Ask:

> "Phase B is committed locally (N commits ahead of origin/main). Push now? This triggers a Render auto-deploy to stillgrid.app, and after that all 5 custom Plausible events will go live."

Wait for explicit yes.

- [ ] **Step 4: Push**

```bash
git push origin main
```

- [ ] **Step 5: Wait for Render deploy + verify deploy lands**

```bash
curl -s https://stillgrid.app/healthz | jq .commit
```

Repeat every 30–60s until the SHA matches the latest commit hash. Render takes 3–6 min.

- [ ] **Step 6: End-to-end event verification in browser**

Open <https://stillgrid.app/> in a clean browser (no ad-blockers, fresh localStorage — use a private/incognito window or clear site data first).

Within 30 seconds of these actions, the Plausible dashboard at <https://plausible.io/stillgrid.app> should show the corresponding events:

| Action | Expected event(s) |
|---|---|
| Open `/` for the first time | 1 pageview for `/`, 1 `first_visit_ever` event, 1 `puzzle_started` event (default puzzle loads on mount) |
| Click "New puzzle" without solving | 1 `puzzle_abandoned` (for the first puzzle, `progress_pct=0` if you didn't touch any cells), 1 new `puzzle_started` |
| Switch variant (e.g., select Killer) | 1 `puzzle_abandoned` + 1 `puzzle_started` |
| Play and solve a puzzle | 1 `puzzle_completed` with `duration_seconds=<actual seconds>` |
| Solve today's daily challenge | 1 `puzzle_completed` with `is_daily=true`. If streak length matches a milestone, also 1 `daily_streak_milestone` with `length=<that number>` |

If any event fails to appear:
- Open browser DevTools → Network tab → filter on `plausible.io`. You should see POST requests to `plausible.io/api/event` for each event.
- If those requests aren't firing, check: (a) is `window.plausible` defined in the console? (b) is the script tag in page source? (c) any ad-blocker active?
- If POSTs are firing but events don't appear in the dashboard within 30s, refresh the Plausible dashboard — sometimes the realtime panel needs a refresh.

- [ ] **Step 7: Done**

Plausible integration complete. The Plausible dashboard is now the source of truth for stillgrid product metrics.

---

# Spec deviations called out in this plan

These are intentional, pragmatic deviations from the spec, all already reflected back into the spec doc:

1. **`used_hint` prop on `puzzle_completed` deferred** — the hint UI doesn't exist in App.tsx yet, so the prop has no value to send. Spec text updated to call this out. Add the prop when the hint feature ships.

2. **`progress_pct` formula corrected** — spec originally said `floor(non_empty_cells / 81 * 100)` (which would treat givens as user progress). Now `floor(user_filled / (81 - given_count) * 100)` — counts only user-entered digits. Killer puzzles with 0 givens use denominator 81.

# What this plan does NOT cover

- Sign-up flow at plausible.io is in Task A1 but not automatable (browser action by the developer).
- GA4 integration — deferred per PRD; comes with Sourcepoint consent banner (PRD Week 18).
- Plausible outbound-proxy for ad-blocker mitigation — deferred; revisit after first month of data if numbers look suspiciously low.
- Custom Plausible dashboards or alerts — handled in the Plausible UI; not code.
- Goals configuration in Plausible dashboard (so events show up in funnel analysis) — one-time browser action after the events first appear; can be done at any time.

# Web Size Selector Implementation Plan (Layer 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a **size selector (6×6 / 9×9)** beside the variant selector so users can play any of the 4 variants at either size. 16×16 is **not offered** (deferred). 9×9 behavior/look is unchanged.

**Architecture:** Make the board model size-parametric on `n`, derive box geometry from explicit dims (6→2×3, 9→3×3 — **never √n**), thread a `size` state through fetch / render / storage / analytics. The API already supports `?size=` and echoes `size`.

**Tech Stack:** React 18 + Vite + Tailwind v4 + TypeScript (strict, `noUncheckedIndexedAccess`), vitest. Files: `web/src/{boardState.ts, storage.ts, analytics.ts, App.tsx}`.

**Spec:** `docs/superpowers/specs/2026-05-31-board-size-generalization-design.md` (Layer 3).

## Shared helper (used across tasks)
Box geometry must match the engine. Define ONCE in `boardState.ts` and export:
```ts
// Board geometry per size. 6×6 boxes are 2 tall × 3 wide (NOT √n).
export function boxDims(n: number): { bh: number; bw: number } {
  if (n === 6) return { bh: 2, bw: 3 };
  return { bh: 3, bw: 3 }; // n === 9
}
export type Size = 6 | 9;
```
The default (classic) box-of for size n:
```ts
export function defaultBoxOf(n: number): number[] {
  const { bh, bw } = boxDims(n);
  const boxesPerRow = n / bw;
  const out: number[] = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) out.push(Math.floor(r / bh) * boxesPerRow + Math.floor(c / bw));
  return out;
}
```

---

## Task 1: Parametrize the board model on `n` (boardState.ts)

**Files:** Modify `web/src/boardState.ts`

Current hardcodes (from map): `BoardState` arrays length 81 (lines 14–17), loops `i<81` (23, 107, 119, 149), digit loop `1..9` (56), row/col `/9 %9` (68–69, 123–124), box `/3*3` + `br+3/bc+3` loops (70–80, 125–138).

- [ ] **Step 1: Write failing tests**

Add a `boardState.test.ts` (vitest) next to it:
```ts
import { describe, it, expect } from "vitest";
import { initialState, placeValue, boardIsSolved, boxDims, defaultBoxOf } from "./boardState";

describe("boardState size-parametric", () => {
  it("boxDims: 6→2×3, 9→3×3", () => {
    expect(boxDims(6)).toEqual({ bh: 2, bw: 3 });
    expect(boxDims(9)).toEqual({ bh: 3, bw: 3 });
  });
  it("defaultBoxOf(6) has 36 entries, 6 distinct boxes of 6 cells, top-left 2×3 is box 0", () => {
    const b = defaultBoxOf(6);
    expect(b.length).toBe(36);
    expect(new Set(b).size).toBe(6);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) expect(b[r * 6 + c]).toBe(0);
  });
  it("initialState infers n=6 from a 36-char givens string", () => {
    const s = initialState("123456456123231564564231312645645312".replace(/.(?=.{30})/g, ".").padEnd(36, "."));
    expect(s.n).toBe(6);
    expect(s.values.length).toBe(36);
  });
  it("placeValue prunes 6×6 row/col/box notes correctly", () => {
    let s = initialState(".".repeat(36));
    s = placeValue(s, 0, 5); // value 5 at cell 0
    // cell 1 (same row), cell 6 (same col), cell 7 (same box) must drop candidate 5
    const has5 = (i: number) => (s.notes[i]! & (1 << 5)) !== 0;
    expect(has5(1)).toBe(false);
    expect(has5(6)).toBe(false);
    expect(has5(7)).toBe(false);
  });
});
```
Run `cd web && npx vitest run src/boardState.test.ts 2>&1 | tail -20` → FAIL (`n`/`boxDims`/`defaultBoxOf` missing; 81-hardcodes).

- [ ] **Step 2: Implement**
- Add `boxDims`, `defaultBoxOf`, `Size` exports (from the shared-helper block above).
- Add `n: number` to the `BoardState` interface. In `initialState(givens)`, infer `const n = givens.length === 36 ? 6 : 9;` (reject other lengths is optional — App only passes 36/81), size all typed arrays to `n*n`, loop `i < n*n`, accept digits `1..=n` (keep `ch >= "1" && ch <= "9"` since 6×6 digits are 1–6, a subset — fine; but the bound check `<= "9"` is harmless). Store `n` on the returned state.
- In `placeValue` and `autoPencil`: replace `/9 %9` with `/n %n` (read `state.n`), and the box block with `boxDims(n)`-derived `bh/bw`: `const br = Math.floor(r/bh)*bh; const bc = Math.floor(c/bw)*bw;` and loops `rr < br+bh`, `cc < bc+bw`, index `rr*n+cc`. Row loop `k<n` index `r*n+k`; col loop `k<n` index `k*n+c`.
- `listNotes` digit loop → `for (let d = 1; d <= n; d++)`.
- `boardIsSolved`/`isSolved` loop `i < n*n` (read `n` from the state arg).
- Keep `notes: Uint16Array` (16 bits covers digits 1–9 and 1–6; 16×16 is deferred).

Run the test → PASS.

- [ ] **Step 3: Commit**
```bash
git add web/src/boardState.ts web/src/boardState.test.ts
git commit -m "web: board model parametric on n (6×6 + 9×9); boxDims/defaultBoxOf"
```

---

## Task 2: Bests storage gains a `size` dimension + v2 migration (storage.ts)

**Files:** Modify `web/src/storage.ts`

Map: bests `KEY = "stillgrid:bests:v1"` (line 16), `key(variant, tier)` (34–36), `recordRun` (71), `getBest` callers. **Daily store (`DAILY_KEY`, lines 115+) stays UNCHANGED** — daily is always 9×9.

- [ ] **Step 1: Write failing tests**

Add `storage.test.ts` (vitest, jsdom for localStorage — if jsdom isn't configured, stub `globalThis.localStorage` with an in-memory shim at the top of the test):
```ts
import { describe, it, expect, beforeEach } from "vitest";
// in-memory localStorage shim (vitest node env has no localStorage)
beforeEach(() => {
  let store: Record<string, string> = {};
  globalThis.localStorage = {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = v; },
    removeItem: (k) => { delete store[k]; },
    clear: () => { store = {}; },
    key: () => null, length: 0,
  } as Storage;
});
import { getBest, recordRun } from "./storage";

describe("bests keyed by (variant, size, tier)", () => {
  it("6×6 and 9×9 bests for the same variant+tier don't collide", () => {
    recordRun({ variant: "classic", size: 6, tierLabel: "easy", timeSec: 50, mistakes: 0, score: 100 });
    recordRun({ variant: "classic", size: 9, tierLabel: "easy", timeSec: 200, mistakes: 0, score: 100 });
    expect(getBest("classic", 6, "easy")?.timeSec).toBe(50);
    expect(getBest("classic", 9, "easy")?.timeSec).toBe(200);
  });
  it("migrates legacy v1 bests into size=9", () => {
    localStorage.setItem("stillgrid:bests:v1", JSON.stringify({ "classic-easy": { timeSec: 123, mistakes: 0, score: 1, at: 0 } }));
    expect(getBest("classic", 9, "easy")?.timeSec).toBe(123);
  });
});
```
Run `cd web && npx vitest run src/storage.test.ts 2>&1 | tail -20` → FAIL (signatures don't take size).

- [ ] **Step 2: Implement**
- Bump bests key: `const KEY = "stillgrid:bests:v2";` and add `const LEGACY_KEY = "stillgrid:bests:v1";`.
- Change `key(variant, tier)` → `key(variant: string, size: number, tier: string | null): string` returning `` `${variant}-${size}-${tier ?? "any"}` ``.
- Update `recordRun`'s `Run` type to include `size: number`; use `key(run.variant, run.size, run.tierLabel)`.
- Update `getBest(variant, tier)` → `getBest(variant: string, size: number, tier: string | null)`.
- **Migration:** on first read in this version, if the v2 blob is absent/empty AND a v1 blob exists, parse v1 (`{ "variant-tier": Best }`) and rewrite each entry under the v2 key `variant-9-tier` (legacy bests were all 9×9), then persist v2. Implement as a `migrateBestsV1IfNeeded()` called at the top of `getBest`/`recordRun` (idempotent: skip if v2 already has data or a `:migrated` flag is set). Don't delete v1 (harmless to leave).

Run the test → PASS.

- [ ] **Step 3: Commit**
```bash
git add web/src/storage.ts web/src/storage.test.ts
git commit -m "web: bests storage keyed by (variant,size,tier) + v1→size9 migration; daily untouched"
```

---

## Task 3: analytics `size` prop (analytics.ts + nothing else here)

**Files:** Modify `web/src/analytics.ts` only (call-site edits happen in Task 4/5 where `size` is in scope).

- [ ] **Step 1:** No new event names needed — `size` is a generic prop. Confirm `EventProps` allows `number`. If `analytics.test.ts` exists, ensure it still passes. The only change here is a doc/comment noting `size` is now a standard prop on `puzzle_started`/`puzzle_completed`/`puzzle_abandoned`. (If `EventProps` is already `Record<string, string|number|boolean>`, this task is a no-op except updating the Plausible spec's taxonomy table.)
- [ ] **Step 2:** Update the taxonomy table in `docs/superpowers/specs/2026-05-25-plausible-integration-design.md` to add a `size` prop column/note for the three puzzle events.
- [ ] **Step 3: Commit** (fold into Task 4 if no code change): `git commit -m "analytics: document size prop on puzzle events"`

---

## Task 4: `size` state, selector UI, fetch, and wiring (App.tsx — data flow)

**Files:** Modify `web/src/App.tsx`

- [ ] **Step 1: Add size state + selector**
- Add `const [size, setSize] = useState<Size>(9);` near the `variant` state (line ~91). Import `Size` from `./boardState`.
- Add a `SizeSelect` component modeled on `VariantSelect` (lines 372–392): two pills, `6×6` and `9×9`, labelled "Size". Render it in `Controls` just above the `VariantSelect` (line ~359). On change: `setSize(s); load(variant, tier, s);` (thread size into the existing `load`).
- The daily flow forces 9×9: when a daily is loaded, set `size` to 9 (daily is always 9×9) and the size selector may be hidden or disabled while a daily is active (match how the variant selector behaves during a daily — check lines around dailyTag usage).

- [ ] **Step 2: Thread `size` into `load`/fetch**
- The puzzle fetch (lines 122–134) builds `URLSearchParams({ variant })`. Add `params.set("size", String(sizeArg))`. Update `load(...)`'s signature to take `size` and pass it. For 6×6, the existing `tier` param is only set when `variant==="classic"` — keep that; tiers are sparse at 6×6 but harmless.
- After fetch, the response includes `size` (server echoes it) and a `givens` whose length matches. `initialState(puzzle.givens)` already infers `n` from length (Task 1) — no extra wiring needed for the model. But `PuzzleResponse` type (line ~37) should add `size?: number`.

- [ ] **Step 3: Thread `size` into storage + analytics call sites**
- `getBest` call (line ~479): `getBest(puzzle.variant, currentSize, tierBucket)` where `currentSize = size` (or derive from `puzzle.givens.length`). Use the board's size — safest is `state.n` once loaded, or the `size` state. Use `puzzle`-derived size: `const puzzleSize = puzzle.givens.length === 36 ? 6 : 9;` to avoid races with the selector.
- `recordRun` call (line ~705): add `size: puzzleSize`.
- `track("puzzle_started" …)` (511), `track("puzzle_completed" …)` (715), `track("puzzle_abandoned" …)` (489): add `size: puzzleSize` to props. For `puzzle_abandoned`, store size in `prevInProgressRef` (lines 461–465) so it's available.
- Daily completion (`markDailyDone`, line 727) is 9×9 — no change needed (daily store untouched).

- [ ] **Step 4: Verify (typecheck + tests)**
Run: `cd web && npx tsc -b 2>&1 | tail -20` → clean. `npx vitest run 2>&1 | tail -10` → all pass.

- [ ] **Step 5: Commit**
```bash
git add web/src/App.tsx
git commit -m "web: size state + SizeSelect + ?size fetch; thread size into storage/analytics"
```

---

## Task 5: Size-parametric rendering (App.tsx — Grid, NumberPad, NotesGrid, keys)

**Files:** Modify `web/src/App.tsx`

Map: Grid `repeat(9,...)` (1325–26), borders `col===8`/`row===8`/`i+9` (1364–78), index `/9 %9` (1335–36), `defaultBoxOf` (1697–1701), NotesGrid `repeat(3,1fr)` + `[1..9]` (1000–03), NumberPad `[1..9]` (1113), key regex `/^[1-9]$/` (654), arrow bounds `c<8 r<8` (663–672).

- [ ] **Step 1: Make Grid size-aware**
- Derive `n` from the board state (`state.n`) or `puzzle.givens.length`. Pass `n` (and `boxDims(n)`) into `Grid`.
- `gridTemplateColumns/Rows`: `` `repeat(${n}, minmax(34px, 46px))` `` (keep min/max; for 9×9 it's identical to today). 6×6 (36 cells) fits comfortably.
- Replace `defaultBoxOf()` (lines 1697–1701) usage with the exported `defaultBoxOf(n)` from `boardState` (delete the local 9×9-only copy). `const boxOf = puzzle.box_of ?? defaultBoxOf(n);`
- Cell index math: `row = Math.floor(i/n); col = i % n;`.
- Borders: `rightIdx = col < n-1 ? i+1 : null; bottomIdx = row < n-1 ? i+n : null;` and `col === n-1`/`row === n-1` for the outer edge. The thick-border logic already keys off `boxOf[neighbor] !== myBox`, so it's geometry-agnostic once `n` is right.

- [ ] **Step 2: NumberPad + NotesGrid + keyboard for n digits**
- NumberPad (line 1113): `{Array.from({ length: n }, (_, k) => k + 1).map((d) => …)}`. Pass `n` into `NumberPad`.
- NotesGrid (lines 1000–03): columns = `boxDims(n).bw` (3 for both 6 and 9 → 6×6 marks render 3-wide × 2 rows, 9×9 stays 3×3); loop `Array.from({length: n}, (_,k)=>k+1)` instead of `[1..9]`. `gridTemplateColumns: repeat(${bw}, 1fr)`.
- Keyboard (line 654–655): regex `new RegExp(\`^[1-${n}]$\`)` — but for n=9 keep `/^[1-9]$/`; for n=6 it's `/^[1-6]$/`. Simpler: `const d = parseInt(e.key, 10); if (d >= 1 && d <= n) { … }` (avoids dynamic regex). Apply the same `1..n` bound.
- Arrow keys (lines 663–672): replace `c < 8`/`r < 8` with `c < n-1`/`r < n-1` (and `>0` unchanged); cell index `r*n+c`.

- [ ] **Step 3: Verify — typecheck, build, and VISUAL smoke**
- `cd web && npx tsc -b 2>&1 | tail -10` clean; `npm run build 2>&1 | tail -5` succeeds.
- `npx vitest run 2>&1 | tail -10` all pass.
- **Visual:** the controller will run the app and screenshot a 6×6 board (the 2×3 box borders, the 1–6 pad, sage selected pills) and a 9×9 board (unchanged) to confirm the rendering. This is the real acceptance check for the rendering task. (Use `make dev` or `vite` + the server; the controller drives this.)

- [ ] **Step 4: Commit**
```bash
git add web/src/App.tsx
git commit -m "web: size-parametric Grid/NumberPad/NotesGrid/keys (6×6 + 9×9)"
```

---

## Self-Review

- Spec coverage: size selector (6/9) ✓ T4; board model parametric ✓ T1; box geometry via dims not √n ✓ (shared helper); fetch `?size` ✓ T4; storage `(variant,size,tier)` + v2 migration ✓ T2; daily untouched (9×9) ✓; analytics `size` prop ✓ T3+T4; rendering grid/pad/marks/keys ✓ T5.
- 16×16 NOT offered (deferred) — `Size = 6 | 9` only.
- 9×9 unchanged: every `n` expression collapses to the old constant at n=9 (`repeat(9)`, `col===8`, 3×3 boxes, `[1..9]`, key `1..9`), and the v1→v2 bests migration preserves existing 9×9 best times.
- Risk: App.tsx is large and changes span data-flow (T4) + rendering (T5). Split that way so each subagent holds a coherent slice. Visual smoke is the acceptance gate for T5.
- Out of scope: 16×16 surfacing; SEO landing pages stay 9×9-framed; the daily store schema.

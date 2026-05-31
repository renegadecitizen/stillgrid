# Server Size Param Implementation Plan (Layer 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** `/api/puzzle` accepts `?size=6|9` (default 9) and threads it through the generator so the SPA can request 6×6 or 9×9 puzzles for every variant. Daily challenge stays 9×9. `solve`/`grade` need no size param (the engine infers `n` from input length).

**Architecture:** Thin pass-through. `engine.ts`'s `generate()` gains a `size` option → `--size` CLI arg (the engine binary already supports it, default 9). `index.ts`'s `/api/puzzle` parses + validates `size ∈ {6,9}`, passes it down, and echoes it in the response. Scope is 6 and 9 only — **16×16 is deferred** (the engine is capable but the solver can't generate/grade it per-request; see spec Risk #1), so the server rejects `size=16` for now.

**Tech Stack:** Node + Express + TypeScript (strict), vitest. Files: `server/src/{engine.ts,index.ts}`.

**Spec:** `docs/superpowers/specs/2026-05-31-board-size-generalization-design.md` (Layer 2).

**Prereq:** engine binaries built in this worktree (`cargo build --release --manifest-path engine/Cargo.toml`). `engine.ts` resolves them via `STILLGRID_ENGINE_DIR` → `engine/target/release`.

---

## Task 1: `generate()` accepts `size` (engine.ts)

**Files:** Modify `server/src/engine.ts`

- [ ] **Step 1: Write the failing test**

Create `server/src/engine.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generate } from "./engine.js";

// Integration test: spawns the real Rust binary (built in engine/target/release).
describe("generate size", () => {
  it("produces a 36-char 6×6 board", async () => {
    const p = await generate({ variant: "classic", size: 6, seed: 1 });
    expect(p.givens.length).toBe(36);
    expect(p.solution.length).toBe(36);
  });

  it("produces an 81-char 9×9 board by default", async () => {
    const p = await generate({ variant: "classic", seed: 1 });
    expect(p.givens.length).toBe(81);
  });

  it("6×6 jigsaw box_of has 36 entries, not 256", async () => {
    const p = await generate({ variant: "jigsaw", size: 6, seed: 1 });
    expect(p.box_of?.length).toBe(36);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && npx vitest run src/engine.test.ts 2>&1 | tail -20`
Expected: FAIL — `size` not accepted (TS error) or 6×6 returns 81 chars.

- [ ] **Step 3: Add `size` to `generate` opts + `GeneratedPuzzle`**

In `server/src/engine.ts`:
- Add `size?: number;` to the `GeneratedPuzzle` interface (after `clue_count`).
- Change the `generate` signature options to include `size`:

```ts
export function generate(
  opts: { seed?: number; minClues?: number; variant?: VariantKind; size?: number } = {},
  timeoutMs = 15000,
): Promise<GeneratedPuzzle> {
  const args: string[] = [];
  if (opts.variant) args.push("--variant", opts.variant);
  if (opts.size !== undefined) args.push("--size", String(opts.size));
  if (opts.seed !== undefined) args.push("--seed", String(opts.seed));
  if (opts.minClues !== undefined) args.push("--min-clues", String(opts.minClues));
  return runJson<GeneratedPuzzle>(GENERATE_BIN, args, null, timeoutMs);
}
```

(The Rust binary emits `box_of` sliced to `n*n` and `givens`/`solution` at the right length; no further engine.ts parsing changes are needed. `grade`/`solve` infer `n` from input length — leave them unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run src/engine.test.ts 2>&1 | tail -20`
Expected: PASS — all three cases.

- [ ] **Step 5: Commit**

```bash
cd /Users/robertmccrady/stillgrid/.worktrees/multi-size-product
git add server/src/engine.ts server/src/engine.test.ts
git commit -m "server: generate() accepts size; --size CLI arg"
```

---

## Task 2: `/api/puzzle?size=` parsing + validation (index.ts)

**Files:** Modify `server/src/index.ts`

- [ ] **Step 1: Write the failing test**

Add to `server/src/engine.test.ts` (or a new `index.test.ts`) — a pure-function test of a new exported `parseSize` helper:

```ts
import { parseSize } from "./index.js";

describe("parseSize", () => {
  it("defaults to 9 when absent", () => expect(parseSize(undefined)).toBe(9));
  it("accepts 6 and 9", () => {
    expect(parseSize("6")).toBe(6);
    expect(parseSize("9")).toBe(9);
  });
  it("rejects 16 (deferred) and junk with null", () => {
    expect(parseSize("16")).toBeNull();
    expect(parseSize("7")).toBeNull();
    expect(parseSize("abc")).toBeNull();
  });
});
```

NOTE: `index.ts` currently runs `app.listen(...)` at import time, which would start a server during the test. To keep `parseSize` importable without side effects, guard the listen: only call `app.listen` when run as the entry (e.g. wrap the `app.listen(...)` block in `if (process.env.NODE_ENV !== "test")`, OR move `parseSize` to the top as a plain exported function and accept that importing it boots the server — prefer the guard). Use the guard approach.

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && npx vitest run 2>&1 | tail -20`
Expected: FAIL — `parseSize` not exported.

- [ ] **Step 3: Implement**

In `server/src/index.ts`:
- Add an exported helper near the top (after imports):

```ts
const SUPPORTED_SIZES = new Set([6, 9]); // 16 deferred (engine-capable, solver not viable per-request)

export function parseSize(raw: string | undefined): number | null {
  if (raw === undefined) return 9;
  const n = Number(raw);
  return SUPPORTED_SIZES.has(n) ? n : null;
}
```

- In the `/api/puzzle` handler, after the variant check, parse size and pass it through:

```ts
  const size = parseSize(req.query.size !== undefined ? String(req.query.size) : undefined);
  if (size === null) {
    res.status(400).json({ error: "unsupported size", supported: [6, 9] });
    return;
  }
```

Then add `size,` to BOTH `generate({ ... })` calls inside the retry loop (alongside `variant`, `minClues`, `seed`). Finally include the size in the response body: after `const body: Record<string, unknown> = { ...lastPuzzle };` add `body.size = size;`.

- Guard the server boot so the test can import the module without starting a listener:

```ts
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(
      `stillgrid-server listening on :${PORT} (static: ${SERVE_STATIC ? WEB_DIST : "off"})`,
    );
  });
}
```

(Leave `/api/daily` unchanged — daily is 9×9. Leave `/api/solve` and `/api/grade` unchanged — they infer `n` from length.)

- [ ] **Step 4: Run tests + typecheck**

Run: `cd server && npx vitest run 2>&1 | tail -20` (set `NODE_ENV=test` is handled by vitest's default? — if `parseSize` test still boots the server, ensure the guard uses a condition vitest satisfies; vitest sets `process.env.NODE_ENV` to "test" by default, so the guard works). Expected: all tests PASS.
Run: `cd server && npm run build 2>&1 | tail -10` — `tsc` compiles clean (strict mode).

- [ ] **Step 5: Manual smoke (record in commit message)**

```bash
# from worktree root, with engine built:
cd server && STILLGRID_ENGINE_DIR=../engine/target/release node --experimental-strip-types - <<'EOF'
# (or just run the built server and curl it)
EOF
# Simpler: build + start, then curl:
npm run build && (STILLGRID_WEB_DIST=/nonexistent node dist/index.js &) && sleep 1 \
  && curl -s 'http://localhost:3001/api/puzzle?variant=classic&size=6' | head -c 200 \
  && curl -s 'http://localhost:3001/api/puzzle?size=16' ; kill %1 2>/dev/null
```
Expect: size=6 returns JSON with a 36-char `givens` and `"size":6`; size=16 returns `{"error":"unsupported size",...}` 400.

- [ ] **Step 6: Commit**

```bash
cd /Users/robertmccrady/stillgrid/.worktrees/multi-size-product
git add server/src/index.ts server/src/engine.test.ts
git commit -m "server: /api/puzzle ?size=6|9 (default 9, 16 rejected); echo size; daily stays 9×9"
```

---

## Self-Review

- Spec coverage: `/api/puzzle` size param ✓ (Task 2); generate threading ✓ (Task 1); daily stays 9×9 ✓ (untouched); solve/grade infer from length ✓ (untouched). 16 rejected per deferral ✓.
- The `app.listen` guard is required so `parseSize` is unit-testable — without it, importing `index.ts` boots a server in the test process.
- Out of scope: web changes (Layer 3 plan), the killer-malformed-cage hardening (tracked separately; `/api/puzzle` only feeds generator output to grade, which is well-formed, so not on this request path).

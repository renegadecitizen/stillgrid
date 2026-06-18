# Share-result hook — design

**Date:** 2026-06-18
**Status:** Approved (brainstorming) — pending implementation plan
**Roadmap relation:** Growth / distribution. Precursor to Phase 2 #11 (anonymous
daily leaderboard); does not require the Postgres pool (#5).

## Goal

Add a Wordle-style "share your result" hook so that solves spread and bring new
players in. This is a **distribution** lever, not a product-depth one.

Why now: Plausible/GSC over the 30 days to 2026-06-18 show ~45 visitors total,
**~96% "Direct"** (i.e. no organic discovery) and ~1 Google click — the product
is feature-complete but undiscovered, and nothing has been publicly launched.
The cheapest viral loop available is a shareable result on the **daily
challenge**, which is deterministic per date and therefore directly comparable
across players ("beat my time on today's puzzle"). The share also feeds the SEO
authority the site lacks, via inbound links that unfurl the existing per-variant
OG cards.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Share scope | Every solve; daily gets richer copy | Maximizes share volume while preserving the daily's comparability edge. Casual solves still shareable so a proud solver is never blocked. |
| Artifact style | Variant square + green difficulty pips ("Format C") | Most attention-grabbing / Wordle-like in a text feed. Deliberately leans growth over the "quiet" brand on this one surface. |
| Difficulty source | `puzzle.grade.tier_label` (actual graded tier) | Always honest — reflects the puzzle's real difficulty, not the selected tier bucket (which can be "any"). |
| Link target | Deep link into the puzzle | Highest conversion: recipient lands one tap from playing the same daily / same variant. Pure client-side query param — no SSR. |
| Mechanism | Web Share API → clipboard fallback | Native share sheet on mobile (URL unfurls OG card); clipboard + "Copied ✓" on desktop. Standard progressive-enhancement pattern. |
| Image card | Out of scope | Text + the existing per-variant OG unfurl is sufficient. A rendered canvas/OG card is a possible v2, not MVP. |

## The shared artifact

Three lines. Spoiler-free by construction (never contains the solution).

**Daily** (only Classic / Killer have a daily):
```
🟧 Stillgrid Daily · Killer · Jun 18
🟩🟩⬜⬜⬜ Medium · 4:12 · no mistakes · 🔥7
stillgrid.app/?d=killer
```

**Casual** (any variant; example is a non-daily solve):
```
🟪 Stillgrid · Jigsaw
🟩🟩🟩🟩🟩 Nightmare · 4:12 · no mistakes · 🔥3
stillgrid.app/?v=jigsaw
```

### Composition rules

- **Variant square:** `classic → 🟩`, `xsudoku → 🟦`, `killer → 🟧`, `jigsaw → 🟪`
- **Variant label:** `classic → "Classic"`, `xsudoku → "X-Sudoku"`, `jigsaw → "Jigsaw"`, `killer → "Killer"`
- **Size suffix:** appended to the variant label when `size !== 9` → ` 6×6` / ` 16×16` (none for 9×9)
- **Difficulty pips** (5, from `tier_label`):
  - `easy → 🟩⬜⬜⬜⬜`
  - `medium → 🟩🟩⬜⬜⬜`
  - `hard → 🟩🟩🟩⬜⬜`
  - `diabolical → 🟩🟩🟩🟩⬜`
  - `nightmare → 🟩🟩🟩🟩🟩`
  - unknown / `stuck` → treat as `easy` (defensive; a completed puzzle always has a tier)
- **Tier name** shown after the pips, capitalized: `Easy` / `Medium` / `Hard` / `Diabolical` / `Nightmare`
- **"Daily" + date:** the word `Daily` and the date appear **only** when `isDaily` (i.e. `dailyTag !== null`, which is only ever Classic/Killer). Otherwise line 1 is `{square} Stillgrid · {Variant}`.
- **Date format:** `YYYY-MM-DD → "Mon D"` (e.g. `Jun 18`). Parse the string directly (no `Date` object) to avoid timezone off-by-one.
- **Time:** `formatTime(timeSec)` → `m:ss` (reuse `storage.ts`).
- **Mistakes phrase:** `0 → "no mistakes"`, `1 → "1 mistake"`, `n → "{n} mistakes"`.
- **Streak flame:** `🔥{streak}` appended to line 2 **only when `streak >= 2`** (a 1-day streak is not a streak). Streak comes from `getStreak()`.

### Line templates

```
line1 = `${square} Stillgrid${isDaily ? " Daily" : ""} · ${variantLabel}${sizeSuffix}${isDaily ? ` · ${prettyDate}` : ""}`
line2 = `${pips} ${tierCap} · ${mmss} · ${mistakesPhrase}${streak >= 2 ? ` · 🔥${streak}` : ""}`
url   = `${origin}${isDaily ? `/?d=${variant}` : `/?v=${variant}`}`
```

## Deep link

The SPA reads exactly one entry param on first mount, acts on it, then strips it
from the URL via `history.replaceState` (clean URL; no re-trigger on refresh).

- `?d=classic` or `?d=killer` → auto-load **today's daily** for that variant (same
  grid as the sharer → directly comparable).
- `?v=classic|xsudoku|jigsaw|killer` → preselect the variant and load a fresh
  puzzle (default size/tier for that variant).
- Anything else (missing, unknown variant, `?d=jigsaw`, malformed) → **ignored**,
  normal home load. Parsing must never throw.

`parseEntryParam(search)` contract:
```
parseEntryParam(search: string):
  | { mode: "daily";  variant: "classic" | "killer" }
  | { mode: "casual"; variant: "classic" | "xsudoku" | "jigsaw" | "killer" }
  | null
```
- `d` present and in {classic, killer} → daily.
- else `v` present and in {classic, xsudoku, jigsaw, killer} → casual.
- else → null.

## Share mechanism

A single composed string drives both paths so output is consistent:
- `body` = `line1 + "\n" + line2`
- `full` = `body + "\n" + url`

On button click (`shareResult`):
1. If `navigator.share` exists → `navigator.share({ text: body, url })`. The
   separate `url` field lets supporting platforms unfurl the OG card.
   - On resolve → fire analytics with `method: "native"`.
   - On reject with `AbortError` (user dismissed) → silent no-op, no analytics.
   - On any other reject → fall through to clipboard.
2. Else / on fallthrough: `navigator.clipboard.writeText(full)` → flip button to
   "Copied ✓" for ~2s, announce via the existing `say()` aria-live region, fire
   analytics with `method: "clipboard"`.
3. If neither API is available → reveal `full` as selectable text for manual copy
   (no analytics).

Accessibility: a real `<button>` with an `aria-label`, visible focus ring,
`prefers-reduced-motion` respected on the "Copied ✓" transition. Success is
announced through `PlayCard`'s existing `say()` live region.

## UI placement

Inside the "Solved. Quietly done." win panel (`web/src/App.tsx` ~L1083), below
the time · mistakes line and before the panel closes. Restrained styling using
the existing `playAccent` so it reads as part of the meditative panel, not a
casino button.

## Event taxonomy — new event

### `puzzle_shared`

Fires only on a **successful** share/copy.

| Prop | Type | Values |
|---|---|---|
| `variant` | string | `classic` / `xsudoku` / `jigsaw` / `killer` |
| `size` | number | `6` / `9` / `16` |
| `tier` | string | graded `tier_label` |
| `is_daily` | boolean | true if the shared solve was a daily |
| `method` | string | `native` / `clipboard` |

Wiring per CLAUDE.md "Analytics → To add a new event":
1. Add `"puzzle_shared"` to the `EventName` union in `web/src/analytics.ts`.
2. Add this row to the taxonomy table in
   `docs/superpowers/specs/2026-05-25-plausible-integration-design.md`.
3. Update CLAUDE.md's "six custom events" → seven.

## Files touched

- **`web/src/share.ts`** (new) — pure `buildShareText(...)` (returns `{ body, url, full }`)
  and `parseEntryParam(...)`, plus the `shareResult(...)` async helper that does the
  navigator/clipboard branching. New file justified: keeps the 2050-line `App.tsx`
  from growing and makes the formatting + parsing unit-testable in isolation.
- **`web/src/share.test.ts`** (new) — unit tests (below).
- **`web/src/App.tsx`** — render the Share button in the win panel; read + act on
  the entry param on mount; pass solve data (variant, size, graded tier, time,
  mistakes, streak, isDaily, daily date) into `buildShareText`.
- **`web/src/analytics.ts`** — add `puzzle_shared` to `EventName`.
- **Docs** — Plausible spec taxonomy table + CLAUDE.md event count.

## `buildShareText` contract

```
buildShareText(input: {
  variant: "classic" | "xsudoku" | "jigsaw" | "killer";
  size: 6 | 9 | 16;
  tier: "easy" | "medium" | "hard" | "diabolical" | "nightmare" | string;
  timeSec: number;
  mistakes: number;
  streak: number;
  isDaily: boolean;
  date: string;    // "YYYY-MM-DD"; used only when isDaily
  origin: string;  // injected (e.g. "https://stillgrid.app") for testability
}): { body: string; url: string; full: string }
```

## Testing

Runner: `vitest run` (matches existing `analytics.test.ts`, `storage.test.ts`).

`web/src/share.test.ts` unit tests the pure functions:
- **`buildShareText`** — daily vs casual line 1; all four variant squares; pip
  mapping for each tier; tier-name capitalization; size suffix at 6/9/16; mistakes
  pluralization (0/1/2); streak flame present at ≥2 and absent at 0/1; date
  formatting (`2026-06-18 → "Jun 18"`); correct `?d=` vs `?v=` url.
- **`parseEntryParam`** — valid `d=classic`/`d=killer`; valid `v=` for all four;
  rejects `d=jigsaw`, unknown variants, empty, and garbage → `null`.

`shareResult` navigator/clipboard branching verified with a mocked `navigator`
(success → correct `method`; `AbortError` → no analytics; missing APIs → reveal).
Share-sheet UX confirmed manually on a device.

## Out of scope (YAGNI)

- Rendered image / canvas / OG share card (text + existing OG unfurl is enough).
- Anonymous daily leaderboard (#11 — separate effort, needs the DB from #5).
- Reproducing the **exact** casual grid via the link (variant-only is enough;
  comparability is the daily's job).
- Sharing in-progress or abandoned puzzles.

## To confirm during planning

- Exact insertion point + state plumbing for the entry-param load (reuse the
  existing daily-load and casual-load paths in `App.tsx`).
- Confirm vitest config location (looks to live in `vite.config.ts`).

# Plausible Analytics integration

**Status:** Design approved, awaiting implementation plan
**Date:** 2026-05-25
**Owner:** Rob
**Related:** [PRD §7 Privacy](../../../PRD.md), [PRD §8 Tech stack](../../../PRD.md), [ULTRAPLAN Week 18](../../../ULTRAPLAN.md)

---

## Summary

Add Plausible Analytics to stillgrid to capture pageviews and four custom puzzle-behavior events. Hosted Plausible Cloud, no consent banner, no npm dependencies. Targets ULTRAPLAN Week 18's telemetry questions: "where do people quit puzzles? What variants get plays?"

## Decisions locked

| Decision | Choice | Rationale |
|---|---|---|
| Hosted vs self-hosted | Hosted plausible.io ($9/mo) | PRD targets <$300/mo infra at 100K sessions; self-hosting ClickHouse on Render is operationally heavier and likely more expensive at our scale. |
| Consent banner | None for Plausible | Plausible is cookieless, no PII, no cross-site tracking. UK ICO + EDPB consistently cite this model as not requiring consent. PRD's "deferred until consent" applies to GA4 (Sourcepoint Week 18), not Plausible. |
| Integration style | Vanilla script tag + typed helper | Matches Plausible's recommended setup. Zero npm deps. Smallest footprint. |
| Event scope | Pageviews + 4 custom events | Smallest set that answers ULTRAPLAN Week 18's questions. Avoids YAGNI expansion. |
| Script variant | `script.outbound-links.js` | Adds outbound-click tracking essentially free (~0.2KB). Swap to `script.outbound-links.file-downloads.js` when print-PDF ships. |

## Architecture & file changes

```
web/
├── index.html                    # + <script> tag in <head>
├── public/
│   ├── classic.html              # + <script> tag in <head>
│   ├── killer.html               # + <script> tag in <head>
│   ├── jigsaw.html               # + <script> tag in <head>
│   └── xsudoku.html              # + <script> tag in <head>
└── src/
    ├── analytics.ts              # NEW — typed helper, ~40 lines
    └── App.tsx                   # 4–5 call sites added, no structural changes
```

Identical script tag in all 5 HTML files:

```html
<script defer data-domain="stillgrid.app"
        src="https://plausible.io/js/script.outbound-links.js"></script>
```

**Out of project scope:** signing up at plausible.io and adding `stillgrid.app` as a site (one-time 60-second browser action).

**No server changes. No engine changes. No new npm dependencies.**

## Event taxonomy

Four custom events. Snake_case per Plausible convention. Each has a strict prop schema enforced by the TypeScript helper.

### `puzzle_started`
Fires when a puzzle is loaded/begun.

| Prop | Type | Values |
|---|---|---|
| `variant` | string | `classic` / `killer` / `jigsaw` / `xsudoku` |
| `tier` | string | `easy` / `medium` / `hard` / `diabolical` / `nightmare` |
| `is_daily` | boolean | true if from daily-challenge flow |

### `puzzle_completed`
Fires when all 81 cells are correctly filled.

| Prop | Type | Values |
|---|---|---|
| `variant` | string | as above |
| `tier` | string | as above |
| `is_daily` | boolean | as above |
| `duration_seconds` | number | wall-clock seconds from start to solve |
| `used_hint` | boolean | true if `Hint` button pressed ≥1 time during solve |

### `puzzle_abandoned`
Fires when user starts a new puzzle while a previous one has progress and isn't complete.

| Prop | Type | Values |
|---|---|---|
| `variant` | string | variant of the abandoned puzzle |
| `tier` | string | tier of the abandoned puzzle |
| `progress_pct` | number | 0–100, `floor(non_empty_cells / 81 * 100)` — counts any user-entered digit regardless of correctness |

**Note on abandonment semantics:** we do NOT fire `puzzle_abandoned` on `beforeunload` / tab close. Mobile browsers handle unload events unreliably, and Plausible's own docs recommend against it. We capture the practical abandonment signal (started another puzzle without finishing) and accept that pure window-close abandonments aren't measured.

### `daily_streak_milestone`
Fires when daily streak reaches a notable length.

| Prop | Type | Values |
|---|---|---|
| `length` | number | 7, 14, 30, 60, 90, 180, 365 (one of these exactly) |

## The `analytics.ts` helper

```ts
// web/src/analytics.ts

type EventName =
  | "puzzle_started"
  | "puzzle_completed"
  | "puzzle_abandoned"
  | "daily_streak_milestone";

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

~40 lines including blanks. No imports beyond Vite's `import.meta.env`. No runtime deps. Dev mode no-ops so localhost traffic doesn't pollute prod stats.

## Call sites in App.tsx

Conceptual — exact line numbers will be confirmed during the implementation-plan phase.

| Event | Call site (conceptual) |
|---|---|
| `puzzle_started` | Inside the handler that loads a new puzzle (likely `newGame()` / `loadPuzzle()`), after puzzle state is initialized |
| `puzzle_completed` | In the win-detection branch — the same place the "Solved!" UI is triggered |
| `puzzle_abandoned` | At the TOP of `newGame()` — if a previous puzzle exists with `progress > 0%` and isn't complete, fire abandon first, then proceed to load the new one |
| `daily_streak_milestone` | In `web/src/storage.ts` where streak is updated — if new streak length is in the milestone list, fire event |

If the storage.ts streak update is wired up as a pure function that returns the new streak (rather than firing side effects), we wrap the call site in App.tsx rather than reaching into storage.ts.

## Edge cases & verification

### Edge cases

- **Ad blockers blocking plausible.io.** uBlock Origin and others block plausible.io by default. The helper silently no-ops via the `typeof window.plausible === "function"` check. If post-launch data looks suspiciously low, we proxy Plausible through stillgrid.app/api/event using [Plausible's documented proxy pattern](https://plausible.io/docs/proxy/introduction). **Not v1 work** — wait for data signal first.
- **Script load timing.** The `defer` attribute means the script downloads in parallel with HTML parse and executes after parse but before `DOMContentLoaded`. Custom events fired before script loads silently no-op. Rare — script is <2KB and starts loading immediately on first byte of HTML.
- **Dev environment.** `ENABLED = import.meta.env.PROD` short-circuits all calls in `npm run dev`. No localhost pollution.

### Verification after deploy

1. Sign up at plausible.io, add `stillgrid.app` as a site.
2. Push the script-tag commits to main; wait for Render deploy.
3. Visit each of the 5 pages (/, /classic, /killer, /jigsaw, /xsudoku) once.
4. Within ~30s, Plausible dashboard should show 5 unique pageviews.
5. Open `/`, start a puzzle. Within seconds, dashboard's "Goals" / events panel shows `puzzle_started` with correct props.
6. Solve the puzzle. Dashboard shows `puzzle_completed`.
7. Start a new puzzle without solving the next one. Dashboard shows `puzzle_abandoned` then `puzzle_started`.

### CLAUDE.md addition

Append a short "Analytics" section noting Plausible is the source of truth for product metrics, how to add events (`track("event_name", { ...props })`), and the dashboard URL.

## Out of scope (deferred to future work)

- **Consent banner** — Plausible doesn't require one; GA4 will, when it lands.
- **GA4** — PRD §8 marks it post-consent. Comes with Sourcepoint in Week 18.
- **Sourcepoint integration** — PRD Week 18.
- **Server-side event tracking** — all events happen in the browser; no server need.
- **Custom Plausible dashboards or alerts** — Plausible's built-in UI handles this.
- **A/B testing framework** — out of scope.
- **Plausible proxy** (stillgrid.app/api/event) for ad-blocker mitigation — wait for data signal.
- **Broader event taxonomy** (hint_used, undo_used, autopencil_toggled, theme_changed, etc.) — YAGNI for v1. Reconsider after first month of data.
- **Real-user-monitoring / Core Web Vitals** — Plausible doesn't do this; use Google Search Console's CWV report instead.

## Open questions for the implementation plan

These don't block the design but need answers before code:

1. Exact line numbers in `App.tsx` for the 3 puzzle-lifecycle call sites — confirmed by reading the file in the planning phase.
2. Streak storage shape in `storage.ts` — verify the milestone-detection logic fits the existing schema. May require adding a `lastStreakMilestoneFired` field to avoid double-firing if user opens two tabs.
3. Whether `duration_seconds` is already tracked in puzzle state — if yes, reuse; if no, add a `startedAt: number` to puzzle state.

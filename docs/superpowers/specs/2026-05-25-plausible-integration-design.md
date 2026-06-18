# Plausible Analytics integration

**Status:** Design approved, awaiting implementation plan
**Date:** 2026-05-25
**Owner:** Rob
**Related:** [PRD §7 Privacy](../../../PRD.md), [PRD §8 Tech stack](../../../PRD.md), [ULTRAPLAN Week 18](../../../ULTRAPLAN.md)

---

## Summary

Add Plausible Analytics to stillgrid to capture pageviews and five custom puzzle-behavior events. Hosted Plausible Cloud, no consent banner, no npm dependencies. Targets ULTRAPLAN Week 18's telemetry questions: "where do people quit puzzles? What variants get plays?"

Session length, DAU, bounce rate, devices, referrers, and geographic distribution are auto-tracked by Plausible from the script tag alone — no code needed for those. See the "What Plausible tracks automatically" section below.

## Decisions locked

| Decision | Choice | Rationale |
|---|---|---|
| Hosted vs self-hosted | Hosted plausible.io ($9/mo) | PRD targets <$300/mo infra at 100K sessions; self-hosting ClickHouse on Render is operationally heavier and likely more expensive at our scale. |
| Consent banner | None for Plausible | Plausible is cookieless, no PII, no cross-site tracking. UK ICO + EDPB consistently cite this model as not requiring consent. PRD's "deferred until consent" applies to GA4 (Sourcepoint Week 18), not Plausible. |
| Integration style | Vanilla script tag + typed helper | Matches Plausible's recommended setup. Zero npm deps. Smallest footprint. |
| Event scope | Pageviews + 6 custom events | Smallest set that answers ULTRAPLAN Week 18's questions + new-vs-returning visitor split. Avoids YAGNI expansion. |
| Script variant | Plausible v2 per-site snippet | Plausible's onboarding now issues a unique script ID per site (e.g. `pa-HB79xhSO4XQqtCrZGd-vn.js`). Outbound-link tracking and file-download tracking are toggled in the Plausible dashboard's site settings, not via URL suffix. |

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

Identical Plausible v2 snippet in all 5 HTML files (per-site script ID, not data-domain):

```html
<!-- Privacy-friendly analytics by Plausible -->
<script async src="https://plausible.io/js/pa-HB79xhSO4XQqtCrZGd-vn.js"></script>
<script>window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()</script>
```

The script ID `pa-HB79xhSO4XQqtCrZGd-vn` identifies the stillgrid.app site to Plausible. It's not a secret — Plausible designs it to be public in HTML. The inline init stub creates `window.plausible` as a queue function immediately, so any custom events fired before the main script loads get queued and replayed.

Outbound-link tracking and file-download tracking are toggled in the Plausible dashboard under site settings, not via the script URL.

**Out of project scope:** signing up at plausible.io and adding `stillgrid.app` as a site (one-time 60-second browser action).

**No server changes. No engine changes. No new npm dependencies.**

## Event taxonomy

Six custom events. Snake_case per Plausible convention. Each has a strict prop schema enforced by the TypeScript helper. (`tier_unmatched` added 2026-06-04 with the all-variant difficulty system.)

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
| `used_hint` | boolean | _Deferred to when hint UI ships_ — Hint feature doesn't exist in App.tsx as of 2026-05-25. Add this prop when the hint button lands. |

### `puzzle_abandoned`
Fires when user starts a new puzzle while a previous one has progress and isn't complete.

| Prop | Type | Values |
|---|---|---|
| `variant` | string | variant of the abandoned puzzle |
| `tier` | string | tier of the abandoned puzzle |
| `progress_pct` | number | 0–100, `floor(user_filled / (81 - given_count) * 100)` — only counts user-entered digits (excludes givens). Killer puzzles with 0 givens use denominator 81. |

**Note on abandonment semantics:** we do NOT fire `puzzle_abandoned` on `beforeunload` / tab close. Mobile browsers handle unload events unreliably, and Plausible's own docs recommend against it. We capture the practical abandonment signal (started another puzzle without finishing) and accept that pure window-close abandonments aren't measured.

### `daily_streak_milestone`
Fires when daily streak reaches a notable length.

| Prop | Type | Values |
|---|---|---|
| `length` | number | 7, 14, 30, 60, 90, 180, 365 (one of these exactly) |

### `first_visit_ever`
Fires once per browser, ever. Uses a localStorage flag to ensure single-fire.

| Prop | Type | Values |
|---|---|---|
| _(none)_ | — | — |

**Purpose:** lets us distinguish new vs returning visitors in funnel analysis. Plausible's anonymized rotating identifier doesn't natively support new-vs-returning, so we add a single signal at the moment a fresh browser first reaches the SPA.

**Limitations to know:**
- Fires only on first SPA load (App.tsx mount). A user who lands on `/classic` and bounces without reaching the SPA won't be counted as "new" by this signal — though Plausible's auto-tracked bounce rate already covers that funnel question.
- Private/incognito browsing: localStorage is per-session, so each new incognito session will fire the event. Acceptable — incognito users are by definition transient and rare.
- localStorage flag key: `stillgrid:plausible_first_visit_fired`. Versioned with the prefix per stillgrid's storage conventions.

### `tier_unmatched`
Fires when `/api/puzzle` couldn't generate the requested difficulty within the 60-retry loop (`tier_matched:false`) and shipped the closest puzzle instead. Added 2026-06-04 with the all-variant difficulty system. Quantifies how often live generation fails to hit a tier — i.e. how much a pre-generated puzzle pool (roadmap #5) would help.

| Prop | Type | Values |
|---|---|---|
| `variant` | string | `classic` / `killer` / `jigsaw` / `xsudoku` |
| `size` | number | 6 / 9 / 16 |
| `requested_tier` | string | the tier the user asked for |
| `got_tier` | string | the grade actually shipped (`easy`…`nightmare`, or `stuck`) |

Derived from the puzzle response (not the selector) so the props are race-safe. Dev-mode no-ops via the `track()` PROD guard like every other event.

### `puzzle_shared`
Fires when a player successfully shares/copies their result from the win panel (Web Share API or clipboard). Added 2026-06-18 with the share-result hook. Measures how often solves get shared — the top of the viral loop.

| Prop | Type | Values |
|---|---|---|
| `variant` | string | `classic` / `killer` / `jigsaw` / `xsudoku` |
| `size` | number | 6 / 9 / 16 |
| `tier` | string | the graded `tier_label`, or `any` |
| `is_daily` | boolean | true if the shared solve was a daily |
| `method` | string | `native` (Web Share sheet) / `clipboard` |

## What Plausible tracks automatically

Just from the script tag deployed on all 5 pages, Plausible auto-tracks the following — no code, no events, no setup beyond signing up at plausible.io:

| Metric | What it tells you |
|---|---|
| Pageviews (total + per page) | Which variants and routes get views |
| Unique visitors per day | DAU — filter the unique-visitors metric by day |
| Visit duration | Average and median session length |
| Bounce rate | % of single-page visits |
| Top sources / referrers | Where traffic comes from (Google, direct, social, etc.) |
| Entry / exit pages | First and last page in a session |
| Devices, browsers, OSes | Mobile vs desktop split |
| Country / region | Geographic distribution |
| Outbound link clicks | What external links get clicked (toggle in Plausible dashboard → site settings) |
| UTM parameters | Campaign attribution if you ever run paid traffic |

For these, no custom events are needed. Just confirm in the Plausible dashboard after deploy.

## The `analytics.ts` helper

```ts
// web/src/analytics.ts

type EventName =
  | "puzzle_started"
  | "puzzle_completed"
  | "puzzle_abandoned"
  | "daily_streak_milestone"
  | "first_visit_ever"
  | "tier_unmatched";

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
| `first_visit_ever` | In `App.tsx` mount effect (or `main.tsx`) — check localStorage for `stillgrid:plausible_first_visit_fired`; if absent, call `track("first_visit_ever")` and write the flag |
| `tier_unmatched` | In `load()`'s `/api/puzzle` response handler — when `data.tier_matched === false`, fire with variant/size/requested/got from the response |

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

## Honest limits of Plausible

These aren't gaps in our implementation — they're trade-offs baked into Plausible's privacy-first design. Worth knowing so future-you isn't surprised.

| Limit | Detail | Workaround if you ever need it |
|---|---|---|
| **True MAU** is impossible | Plausible's identifier is a daily-rotated hash. "Did this same human visit on day 1 and day 18?" cannot be answered. You can see "monthly unique visits" but not deduplicated unique humans. | Add a privacy-friendly localStorage UUID, send as a custom prop. Reconsiders the privacy posture — discuss before doing. |
| **Cross-session attribution** | "User clicked an ad on day 1, signed up day 5" cannot be linked. | Pair with a server-side click-tracker; out of scope for stillgrid. |
| **Cohort analysis** | Filter by date range only. Can't easily compare "users who arrived in week 1" vs "week 2" behavior over time. | Use UTM-tagged campaigns to segment acquisition cohorts; basic but works. |
| **Per-user history** | You can't view "what did THIS person do" for any specific visitor. | By design — the privacy promise. If you ever need this, you've changed the product, not the analytics. |
| **Ad-blocker miss rate** | uBlock Origin and others block plausible.io by default. Estimated 10–30% of tech-savvy traffic. | Plausible's outbound-proxy pattern: serve script through stillgrid.app/api/event. Not v1; revisit if data looks suspiciously low. |
| **Real-user CWV / RUM** | Plausible doesn't measure Core Web Vitals or front-end performance. | Use Google Search Console's CWV report (field data) or Lighthouse CI (lab data). |

If any of these become blockers, the answer is usually "add a second tool layered on top" rather than "replace Plausible." Plausible covers the 80% case beautifully; the remaining 20% needs more invasive tooling that breaks the privacy posture.

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

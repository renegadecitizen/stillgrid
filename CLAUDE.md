# Stillgrid

Sudoku web app — classic + variants (X-Sudoku, Jigsaw, Killer), technique-graded difficulty, daily challenge with streaks. Production at https://stillgrid.app.

## What this is

A monorepo with three pieces:

- **`engine/`** — Rust crate (`stillgrid-engine`). Solver, generator, technique-based difficulty grader, variant abstraction. Compiled to 3 CLI binaries: `stillgrid-solve`, `stillgrid-generate`, `stillgrid-grade`.
- **`server/`** — Node + Express + TypeScript. Spawns the Rust binaries per request. Exposes `/api/solve`, `/api/puzzle`, `/api/grade`, `/api/daily`, `/healthz`. Serves the built SPA + prerendered landing pages.
- **`web/`** — React 18 + Vite + Tailwind v4 SPA. All UI in `src/App.tsx`. No router. Uses Fraunces serif + Inter sans, cream `#FAF7F2` palette with per-variant accents.

## Local development

```bash
make install      # cargo fetch + npm install in server + web
make engine       # cargo build --release (3 binaries)
make dev          # builds engine, runs server (:3001) + vite (:5173) in parallel
```

Open http://localhost:5173. Vite proxies `/api` → `:3001`.

## Production / deploy

- Hosted on **Render** via Blueprint (`render.yaml` at repo root triggers auto-deploy on every push to `main`).
- `Dockerfile` is a multi-stage build: Rust → compile binaries; Node → compile TS server + build SPA; final runtime is Node + the Rust binaries on PATH.
- DNS: Cloudflare → Render. `stillgrid.app` is the canonical domain.
- **TypeScript server is compiled at build time** (`tsc → dist/`). Do NOT introduce `tsx` runtime imports — production container won't resolve devDependencies. See `mem_XDy2x_z1wRx5` history.

## Engine architecture

- `engine/src/board.rs` — `Board([u8; 81])`. `N=9` and `CELLS=81` are hardcoded as `const`. Generalizing to 6×6 / 16×16 requires a multi-day refactor across solver, generator, techniques, variant.
- `engine/src/variant.rs` — `Variant { kind, box_of, boxes, diagonals, cages }`. The variant abstraction; everything downstream takes a `&Variant`.
- `engine/src/solver.rs` — backtracking SAT solver (`solve`, `solve_variant`). Detects unique vs multiple solutions.
- `engine/src/generator.rs` — generates puzzles per variant (`generate`, `generate_for`, `generate_killer`, `generate_variant`).
- `engine/src/techniques.rs` — **variant-aware human-style solver/grader.** Tiers:
  - T1: Naked Single; Hidden Single (row, col, box, diag — **not cages**, see below)
  - T2: Naked Pair (all unit kinds incl. cages), Hidden Pair (row/col/box/diag — not cages), Pointing Pair, **CageCombo** (Killer cage-sum combination pruning)
  - **Cage soundness invariant:** a cage has <9 cells and need not contain any given digit, so it is NOT an "all-9-digit" unit. Hidden-single, hidden-pair, and bilocal *strong* links (in the chain graph) must skip cages — those inferences are unsound for cages. Naked pairs and same-unit *weak* links stay valid for cages via cell-distinctness. Cage sum logic lives in `find_cage_sum` / `cage_can_fill`.
  - T3: X-Wing (row + col)
  - T4: Swordfish (row + col), XY-Wing (peer-based, variant-aware)
  - **Not yet:** T5 chain-based techniques (forcing chains, ALS, coloring). Inkala's "World's Hardest Sudoku" still grades as `stuck`.
- Public API: `grade(board)` is a classic shim. `grade_variant(board, &Variant)` for everything else. Both return `GradeOutcome::Solved { tier, .. }` or `GradeOutcome::Stuck`.

## Server architecture

- `server/src/engine.ts` — process-spawn wrappers around the 3 binaries. `grade()` accepts `string | GradeInput`; for variants, sends JSON on stdin instead of argv.
- `server/src/index.ts` — Express routes. Order matters: `express.static(WEB_DIST)` first, then `/api/*` handlers, then explicit landing-page routes (`/classic`, `/killer`, `/jigsaw`, `/xsudoku`), then SPA fallback (`app.get("*", ...)`).
- Daily challenge uses `dailySeed(date, kind)` → deterministic per-date seed. Server-side has no DB — every request spawns the generator. Dailies are cached in-memory (`getDaily` promise cache, 512 cap, failures evicted) since they're immutable per date.
- **Daily archive (2026-07-07, growth Phase 3).** Server-rendered `/daily` index + `/daily/{classic,killer}/YYYY-MM-DD` pages (render logic in `server/src/daily-pages.ts` — pure functions, unit-tested without binaries). Window: `ARCHIVE_START` (2026-05-08) → today (UTC); outside → 404. Pages show the givens grid (killer cages drawn), tier badge, and the grader's technique breakdown with `/learn` links; play CTA uses the `/?d=<kind>&date=` deep link. `/sitemap.xml` is now **dynamic**: the static file (`web/public/sitemap.xml`, still the editable source of truth) + injected daily URLs (`lastmod` = the date) — route registered before `express.static` so it wins. Two new URLs/day with no deploy.
- `POST /api/grade` accepts optional `variant` (`GRADE_VARIANTS` allowlist: classic|xsudoku; jigsaw/killer 400 — their layouts don't fit a digit string). Backs the `/grade` tool.
- **Difficulty / tiers (all variants, 2026-06-04).** Difficulty is enabled for *every* variant (was Classic-only). `/api/puzzle?tier=…` works for classic/xsudoku/jigsaw/killer: when a tier is requested (and no explicit `minClues`), the server derives a clue floor from `TIER_FLOORS[variant][tier]` (9×9 only) and the 60-retry loop regenerates until `grade.tier_label` matches; unmatched after 60 → closest puzzle + `tier_matched:false`. The grader's reachable gradient is **Easy → Medium → Nightmare** (honest grader labels; Hard/Diabolical are T3/T4-terminal and too rare to offer — 0–8% at any floor). Offered tiers per (variant,size) live in `tiersFor()` in `web/src/App.tsx`. Constraints (from engine `measure_tier_distribution` + `sweep_min_clues_tiers`): 6×6 is single-difficulty (≈80% easy even at minimal clues) → Any only; killer never grades Easy (min_clues N/A — cage gen ignores it) → Medium/Nightmare; 16×16 clamps to the 47% floor → classic Easy/Medium, xsudoku Any. Tier colors for diabolical/nightmare added (`TIER_COLOR` + `index.css`) — previously `TierBadge` rendered nothing for those grades.

## SEO

- Prerendered HTML landing pages at `/classic`, `/killer`, `/jigsaw`, `/xsudoku`, `/sudoku-16x16`, `/evil-sudoku` (files in `web/public/`), plus the Vite-MPA tool pages `/killer-sudoku-calculator` and `/grade`. Unique title/meta/canonical/OG/Schema.org per page. `/evil-sudoku` maps to the Nightmare tier (never target "nightmare sudoku" — zero volume) and bakes in an engine-pinned sample puzzle (`data-sample-seed`; guarded by a test in `server/src/engine.test.ts`).
- The SPA accepts entry params: `?d=<classic|killer>[&date=]` (daily), `?v=<variant>[&size=][&tier=]` (casual) — parsed in `web/src/share.ts`, tier snapped via `tiersFor` on apply.
- `/robots.txt` and `/sitemap.xml` are served as real text/xml — NOT through the SPA fallback.
- `index.html` has a `<noscript>` block linking to all 4 landing pages so Google can discover them from `/`.
- **Limitation:** SPA at `/` does not deep-link by variant. If you ever want `/killer/play/abc123`, you'll need real SSR (Next.js / Remix), which is a multi-day rewrite — landing pages alone won't get you there.

## Storage / state

- All player state (best times, streaks, daily-done flag, current run) lives in `localStorage`. No accounts, no DB.
- See `web/src/storage.ts` for the schema and helpers. localStorage keys are versioned — bump if shape changes.

## Analytics

Umami Analytics (hosted, cloud.umami.is — free Hobby tier: 100k events/mo, 6-month retention) is the source of truth for product metrics. Migrated from Plausible 2026-07-05 to drop the $9/mo cost; taxonomy unchanged.

- Script tag in all 10 HTML files (`web/index.html`, the 4 `web/learn*.html` Vite MPA entries, `web/public/*.html` incl. privacy).
- Typed event helper at `web/src/analytics.ts` — single `track(eventName, props?)` function (calls `window.umami.track`; props are flat, not `{props}`-wrapped).
- Nine custom events: `puzzle_started`, `puzzle_completed`, `puzzle_abandoned`, `daily_streak_milestone`, `first_visit_ever`, `tier_unmatched` (fires when `/api/puzzle` can't hit a requested tier in 60 retries — sizes the need for the #5 pool), `puzzle_shared` (fires on a successful share/copy from the win panel — top of the viral loop), `calculator_used` (first interaction per `/killer-sudoku-calculator` pageview), `grade_used` (per grade submission on `/grade`; props include outcome + tier).
- Dev mode no-ops via `import.meta.env.PROD` check — localhost traffic doesn't pollute prod stats.
- Dashboard: https://cloud.umami.is (website ID `a623ea5c-9c7e-45c2-9d15-6c56bdfe0593`)
- Event taxonomy spec (names/props still authoritative): `docs/superpowers/specs/2026-05-25-plausible-integration-design.md`; provider migration: `docs/superpowers/specs/2026-07-05-umami-migration-design.md`

To add a new event:
1. Add the name to the `EventName` union in `web/src/analytics.ts`.
2. Add a row to the event taxonomy table in the spec doc.
3. Call `track("event_name", { ...props })` from the appropriate handler.

## Conventions

- **Design philosophy:** "quiet meditative" (Things 3 / Calm-like), not casino-lobby energy. Cream base, muted accents, generous whitespace. Brand is "sudoku, the quiet way." Avoid neon, gradients, gamification stickers.
- Per-variant accent colors: Classic sage, X-Sudoku teal, Killer terracotta, Jigsaw plum. Defined as CSS custom properties in `web/src/index.css` (and mirrored in `web/public/landing.css` for landing pages).
- **No comments on the obvious.** Don't add JSDoc/docstrings to code that's already clear from names + types. Only comment hidden invariants or workarounds.
- **No new files unless necessary.** Prefer editing.
- TypeScript strict mode is on, including `noUncheckedIndexedAccess`. Array index access returns `T | undefined` — use `!` or guards.
- **Accessibility is a first-class goal** (a maintainer relies on screen reader + keyboard + high contrast). Don't regress it. The board is an ARIA grid: `role="grid"` → `role="row"` (via `display:contents`, so the CSS grid layout is untouched) → `role="gridcell"` with `aria-rowindex`/`aria-colindex`, per-cell `aria-label` ("row R, column C, …, given/conflicts"), `aria-selected`, `aria-readonly` for givens, and roving `tabindex` where focus follows selection (`onFocus`→select). Board actions are announced through an `aria-live="polite"` region in `PlayCard` (the `say()` helper). Keep colour from being the only signal (conflicts also get a wavy underline); keep `:focus-visible` rings visible (see `index.css`); honour `prefers-reduced-motion`; keep muted text ≥ WCAG AA (the `--color-ink-soft`/`-mute` tokens were darkened for this). Segmented controls are `role="group"` + `aria-pressed`. A "Skip to puzzle" link targets `#main-content`.

## Roadmap (Phase 2 remaining)

Priority order, roughly:

1. **T5 chain-based techniques** — **largely DONE; flagship puzzles ruled infeasible.** Shipped: simple coloring, AIC, bivalue forcing, ALS-XZ, ALS-XY-Wing. Inkala 2010 and Easter Monster still grade `Stuck`. Investigated the obvious next step (generalized N-ALS chains): empirically, a length-3 ALS chain finds **0** sound eliminations on either puzzle's initial state (96 / 83 ALSes; ALS-XZ also fires 0×) — see test `als_chains_do_not_crack_flagship_puzzles`. So an ALS-chain subsystem would be dead code against these targets. They need patterns outside the ALS family (SK-Loop / Exocet for Easter Monster; deep dynamic forcing nets ≈ trial-and-error for Inkala), and T&E-as-technique is an explicit spec non-goal. Conclusion: stop here unless someone wants SK-Loop/Exocet specifically. The T5 arsenal already cracks every *generated* puzzle.
2. ~~**Cage-sum techniques for Killer**~~ — **DONE.** `CageCombo` (per-cell digit-feasibility over cage-sum combinations) plus a uniqueness/grader-solvable carve in `generate_killer` (killers now ship with 0–5 givens instead of always 0). Also fixed three cage-soundness bugs (hidden-single/hidden-pair/bilocal-strong-link wrongly treating cages as all-9 units). Explicit 45-rule innies/outies not needed — every generated killer now grades Solved. Mobile polish (was item 6) also DONE & shipped.
3. **Multi-size (6×6 / 9×9 / 16×16)** — **6×6 + 9×9 SHIPPED (all 3 layers); 16×16 engine-ready, not yet exposed.** Every variant (classic/X/jigsaw/killer) is now playable at 6×6 and 9×9. The 16×16 solver prerequisite (constraint propagation) is DONE and 16×16 generate+grade is now sub-second per-request; only server/web enablement remains. Spec/plans in `docs/superpowers/{specs,plans}/2026-05-31-*` and `2026-06-01-solver-constraint-propagation*`.
   - **Layer 1 (engine):** size-generic — `board.rs` `Board(pub [u8; MAX_CELLS=256], pub u8)`, runtime `n`; `MAX_N=16`; candidate masks `u16→u32`; `Variant` carries `n`/`box_h`/`box_w` via `box_dims(n)` = 6→2×3, 9→3×3, 16→4×4; solver/generator/techniques loop over runtime `n`; binaries take `--size`; digits 10–16 render `A`–`G`. Zero 9×9 behavioral change (verified byte-for-byte).
   - **Layer 2 (server):** `/api/puzzle?size=6|9` (default 9; 16 rejected → deferred); `parseSize` in `index.ts`; `generate()` passes `--size`; response echoes `size`. Daily stays 9×9. `solve`/`grade` infer `n` from input length.
   - **Layer 3 (web):** `boardState.ts` parametric on `n` (`boxDims`/`defaultBoxOf`/`BoardState.n`); `App.tsx` has a `SizeSelect` (6×6/9×9; disabled during dailies which are 9×9), `?size` fetch (demo-pool path is 9×9-only), and a size-parametric Grid/NumberPad/NotesGrid/keyboard/arrow-nav; variant blurbs + in-game hints are n-aware (6×6 reads "2×3 boxes / 1–6"). **`storage.ts` bests keyed `(variant,size,tier)` — `KEY` bumped v1→v2 with a v1→size-9 migration; the daily/streak store (`DAILY_KEY`) is UNCHANGED** (daily is 9×9). `analytics.ts` events gained a `size` prop (no new event names). Storage/analytics derive size from the loaded puzzle's `givens.length` (race-safe), not the selector.
   - **Solver constraint propagation — DONE** (`docs/superpowers/{specs,plans}/2026-06-01-solver-constraint-propagation*`). `solver.rs` now carries a `[u32; MAX_CELLS]` candidate-mask state (`SolveCtx` precomputed peers, `seed_masks`, `assign_and_propagate` w/ naked-single cascade, MRV `find_branch_cell`, snapshot undo). Masks encode only row/col/box/diag; cage variants stay gated by `can_place`. Proven byte-for-byte equivalent to the old solver via a differential test (frozen `mod naive` oracle, 875 cases across classic/X/killer @6&9 + jigsaw@6 + 16×16). 9×9 behavior unchanged.
   - **16×16 is NOW per-request FEASIBLE** (measured, not yet exposed). With propagation: 16×16 classic **generate ~35 ms + grade ~20 ms ≈ sub-second** at the 47% clue floor (was the "~14 s / grading-minutes" blocker — that was the *minimal-clue* regime). Uniqueness checks stay ~1 ms to ~110 clues, 137 ms at 100, then explode, so the **n>9 floor is kept at 47%** (robust + sub-second; lowering buys marginally harder puzzles at real variance cost). Engine bench: `bench_16x16_uniqueness_and_generation` (`#[ignore]`). **16×16 Classic + X-Sudoku — IMPLEMENTED on the `solver-constraint-propagation` branch, pending deploy.** Server `size=16` accepted for classic/xsudoku only (jigsaw/killer 400'd via `variantSupportsSize`); web `Size` `6|9`→`6|9|16` with `Uint32Array` notes, n-derived candidate mask, an A–G↔10–16 codec (`digitToChar`/`charToDigit` in `boardState.ts`) routed through all render/input/compare paths, a variant-gated 16×16 selector, per-size tier set (`TIERS_BY_SIZE`), state snapping (jigsaw/killer@16→9; disallowed tier→Any), 16×16 cell/font scaling, and a mobile "best on a larger screen" hint. **Tiers at 16×16 = Any/Easy/Medium** — measured: at the 47% floor classic@16 grades ~85% easy / ~5% medium / 0% hard, so Hard is dropped. Verified end-to-end (CI gates + e2e API + real-browser desktop & narrow render). Design/plan: `docs/superpowers/{specs,plans}/2026-06-02-16x16-ship*`. Rides out with the propagation branch as one deploy. The Postgres pool (#5) is NOT required for the generate+grade path. **Daily stays 9×9** (untouched).
   - **Deferred 16×16 follow-up — Jigsaw + Killer at 16×16:** not in the first 16×16 ship. **Jigsaw@16** — the 9×9 generation tail that gated this is now FIXED (budgeted fill + partition-restart, see below); the next step is to benchmark jigsaw generation at 256 cells (the budget/restart should carry over, but `JIGSAW_FILL_BUDGET` may need size-scaling for n=16) and then expose `size=16` for jigsaw in `variantSupportsSize` + the web selector. **Killer@16** needs cage-generation viability at 256 cells plus cage rendering/entry UX on a 16×16 grid (and grading cost under the cage gate). Both want the variant×size timing benchmarked before exposure. Sequence: (Classic+X 16×16 done) → (jigsaw 9×9 tail fixed) → benchmark + add Jigsaw@16 → scope Killer@16.
   - **`fill_random` MRV — DONE. Jigsaw tail PROFILED then FIXED.** `generator.rs` `fill_random` uses MRV cell selection (fixed the classic 16×16 hang: ~5% of seeds >30 s → ~20 ms). The 9×9 *jigsaw* tail was profiled (`profile_jigsaw_generation_tail`, `#[ignore]`): across 40 seeds **partition** stays ≤~75 ms and the **carve** is a flat ~1–4 ms (slowest single uniqueness check ≤0.7 ms — propagation made it trivial), and the entire tail was **`random_solution` → `fill_random`** (solution-fill spikes of 3.5 s, 5.3 s, and one ~845 s pathological seed). So the roadmap's earlier guess (partition or carve) was wrong — even MRV `fill_random` catastrophically backtracks on certain irregular jigsaw partitions at 9×9. **Fix (DONE):** `fill_random` now takes a node `budget` (`random_solution` stays unbounded for classic/X/Killer → zero behavioral change; new `random_solution_budgeted` is jigsaw-only). The jigsaw branch of `generate_for_n` loops: draw a partition, attempt a budgeted fill (`JIGSAW_FILL_BUDGET = 100_000` nodes), and on budget-abort discard the partition for a fresh one (carve extracted into `carve_puzzle`). Random-restart turns the 845 s fill into a sub-second retry. Regression guard: `jigsaw_generation_has_no_tail` (non-ignored) generates+uniqueness-checks seeds 1..=40 in ~1.4 s total (was 845 s for one seed alone); CLI smoke = 20 gens in 0.82 s. **Jigsaw@16 is now unblocked.**
   - ~~Known follow-up: harden `stillgrid-grade`'s killer cage-input path~~ — **DONE.** `build_variant` validates cage payloads (range/overlap/coverage) → clean JSON errors, with tests. Unblocked exposing grade to user input (`/grade` still ships without killer input — cage entry UX, not safety).
4. ~~**PWA / offline**~~ — **DONE.** `web/public/manifest.webmanifest` + hand-written `web/public/sw.js` (network-first navigations w/ offline app-shell fallback, stale-while-revalidate assets, network-only `/api`) + brand-mark PNG icons, registered from `main.tsx` in prod only. Also fixed the static-cache headers (sw.js no-store, manifest no-cache, sitemap/robots 1h).
5. **Postgres puzzle pool** — pre-generated puzzles by (variant, tier) so requests are O(1) instead of spawning the generator. Necessary for scale, optional for current load.
6. **Mobile polish** — tool/digit button rows wrap into 3–4 rows on iPhone widths. ~1–2h.
7. ~~**Game schema.org data + open graph images**~~ — **DONE.** Per-variant OG/Twitter cards (`og-{classic,xsudoku,jigsaw,killer}.png` + `og-image.png` home, all 1200×630, rendered from the `/tmp/og-card.html` template with real Fraunces/Inter). Each landing page now points `og:image`/`twitter:image` at its own card with `og:image:alt`, and its `Game` JSON-LD is enriched with `image`, `inLanguage`, `isAccessibleForFree`, and a free `Offer`. Home `WebSite` schema gained `image` + `inLanguage`.
8. **Real SSR (Next.js or Remix)** — only if SEO ROI ever justifies a rewrite. Deep-linking + dynamic per-puzzle pages. Multi-day.
9. **AI answer-engine optimization (GEO/AEO)** — **DONE.** Be the citable source when ChatGPT / Claude / Perplexity / Google AI Overviews answer "where can I play killer sudoku" and similar. Shipped:
   - **`/llms.txt`** — `web/public/llms.txt`, served as `text/plain` by the existing `express.static` (the `.txt` branch already sets a 1h cache; no new route). Markdown index: one-paragraph site summary + the four variant pages + home/privacy, each with a one-line description.
   - **Named crawler allows in `robots.txt`** — explicit `Allow` blocks for GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, anthropic-ai, PerplexityBot, Google-Extended (on top of `User-agent: *`).
   - **Self-contained, liftable answers** — each variant landing page gained a visible "Common questions" FAQ (3 Q&As: "What is X?", a how-it-differs/how-to-start Q, and a free-to-play Q) whose first answer is the verbatim-quotable definition. Backed by `FAQPage` JSON-LD whose `text` matches the visible copy exactly (Google requirement).
   - **`HowTo` structured data** — per-variant `HowTo` JSON-LD generated from each page's rules list. `.faq h3` styling added to `landing.css`. All 12 JSON-LD blocks (3 × 4 pages) validated as parseable.
   - Remaining GEO upside lives in #10 (`/learn`), which adds a unique technique-ladder content asset.
10. **"Learn sudoku" page (`/learn`)** — a real teaching page wired to the topbar "Learn" link (currently `href="#"`). Prerendered HTML in `web/public/learn.html` following the same pattern as the variant landing pages (own title/meta/canonical/OG + `landing.css`, registered in `LANDING_ROUTES` in `server/src/index.ts`). Content: how to play, then a walkthrough of the technique ladder the grader actually uses (naked/hidden singles → pairs/pointing → X-Wing → Swordfish/XY-Wing → chains), which doubles as a unique-content SEO/GEO asset and explains our technique-graded difficulty. Mark up with `HowTo` / `FAQPage` JSON-LD (overlaps with #9). Link it from the variant pages' "Try a variant" rows too. ~half day.
11. **Anonymous daily leaderboard** — leaderboards *without* accounts, idea from 2026-06-04. The daily challenge is deterministic (same puzzle per date for everyone), so times are directly comparable — ideal for a "today's daily" board. Pattern: user picks a **display name** (no email/password/login); a `localStorage` device token is a soft identity to deter dup entries; server stores `(date, name, time)` and ranks. **Requires the first real server-side persistence** — fold into #5 (Postgres), which has no DB today; the pool + leaderboard share the DB. Honest tradeoff: anonymous = **gameable** (fake times, name collisions, resubmits) — mitigate with server-side solve-time sanity checks + rate limiting + the device token, but can't fully stop cheating without real identity. *Optional* accounts could layer on later for a "verified" board (see #12 wording).
12. ~~**Future-proof the "free / no ads / no signup" copy**~~ — **DONE (2026-06-05).** All absolute promises ("no ads", "no in-app purchases", "no microtransactions", the SPA's "No signup, ever") softened to a durable **"free to play"** + **"no signup needed to play / to start a puzzle"** — true even if optional accounts land for the #11 leaderboard. Edited 8 spots across 6 files: the 4 landing pages (meta description + feature bullet + FAQ visible `<p>` and matching `FAQPage` JSON-LD — kept byte-identical per Google's match rule), `web/public/llms.txt`, **and `web/src/App.tsx`** (the header badge + intro line — the original edit-span had **missed the SPA**, which still carried the absolute "No signup, ever" badge). Left alone deliberately: `web/public/privacy.html` "no advertising network" — a present-tense factual privacy description (policies are expected to update when practices change), not a forward marketing promise.
13. **4×4 "intro / kids" size — maybe; 3×3 ruled out.** Considered 2026-06-04. **3×3 is not worth it**: digits 1–3 with no meaningful box subdivision = a 3×3 Latin square, trivially solved by any single clue, no deduction, and `box_dims(3)` has no sensible answer. **4×4** (2×2 boxes, digits 1–4) is the real floor — a genuine (very easy) sudoku, common in kids' books — the only size worth adding *if* an intro/kids mode becomes a goal. Engine is largely size-generic already (`box_dims`), but tier reachability would be ~single-difficulty like 6×6 (see the difficulty notes under Server architecture).

## Known issues

- The chorus GitHub OAuth doesn't surface `GITHUB_TOKEN` to bash in the dev container. Pushes from container require a fine-grained PAT. From your Mac, use `git config --global credential.helper osxkeychain` and you'll be prompted once.

## Useful commands

```bash
# Engine tests (Rust)
cd engine && cargo test --release

# Smoke test the grader CLI
echo '{"givens":"...","variant":"killer","cages":[...]}' | engine/target/release/stillgrid-grade

# Check production grading
curl 'https://stillgrid.app/api/puzzle?variant=killer&tier=easy' | jq .

# Generate + grade a daily
curl 'https://stillgrid.app/api/daily' | jq .
```

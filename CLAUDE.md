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
- Daily challenge uses `dailySeed(date, kind)` → deterministic per-date seed. Server-side has no DB — every request spawns the generator.

## SEO

- Prerendered HTML landing pages at `/classic`, `/killer`, `/jigsaw`, `/xsudoku` (files in `web/public/`). Unique title/meta/canonical/OG/Schema.org-Game per variant.
- `/robots.txt` and `/sitemap.xml` are served as real text/xml — NOT through the SPA fallback.
- `index.html` has a `<noscript>` block linking to all 4 landing pages so Google can discover them from `/`.
- **Limitation:** SPA at `/` does not deep-link by variant. If you ever want `/killer/play/abc123`, you'll need real SSR (Next.js / Remix), which is a multi-day rewrite — landing pages alone won't get you there.

## Storage / state

- All player state (best times, streaks, daily-done flag, current run) lives in `localStorage`. No accounts, no DB.
- See `web/src/storage.ts` for the schema and helpers. localStorage keys are versioned — bump if shape changes.

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

## Conventions

- **Design philosophy:** "quiet meditative" (Things 3 / Calm-like), not casino-lobby energy. Cream base, muted accents, generous whitespace. Brand is "sudoku, the quiet way." Avoid neon, gradients, gamification stickers.
- Per-variant accent colors: Classic sage, X-Sudoku teal, Killer terracotta, Jigsaw plum. Defined as CSS custom properties in `web/src/index.css` (and mirrored in `web/public/landing.css` for landing pages).
- **No comments on the obvious.** Don't add JSDoc/docstrings to code that's already clear from names + types. Only comment hidden invariants or workarounds.
- **No new files unless necessary.** Prefer editing.
- TypeScript strict mode is on, including `noUncheckedIndexedAccess`. Array index access returns `T | undefined` — use `!` or guards.

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
   - **Deferred 16×16 follow-up — Jigsaw + Killer at 16×16:** not in the first 16×16 ship. **Jigsaw@16** still has a residual generation tail (see below) — `fill_random` is now MRV, but jigsaw@9 still shows ~2/20 seeds >3 s, so the jigsaw bottleneck is NOT solely `fill_random` (likely the irregular box-layout generation or the jigsaw carve). Profile + fix that before Jigsaw@16. **Killer@16** needs cage-generation viability at 256 cells plus cage rendering/entry UX on a 16×16 grid (and grading cost under the cage gate). Both want the variant×size timing benchmarked before exposure. Sequence: (Classic+X 16×16 done) → profile/fix the jigsaw tail → add Jigsaw@16 → scope Killer@16.
   - **`fill_random` MRV — DONE; residual jigsaw tail remains (flagged).** `generator.rs` `fill_random` now uses MRV (minimum-remaining-values) cell selection instead of naive first-empty backtracking — this fixed the **classic 16×16 generation hang** (was ~5% of seeds >30 s → now ~20 ms; tripped the server's 15 s timeout → 500). But 9×9 *jigsaw* generation still takes >3 s on ~2/20 seeds, so an additional bottleneck exists outside `fill_random` (irregular box-layout generation in `random_jigsaw_variant`, or the jigsaw uniqueness-carve). Affects `/api/puzzle?variant=jigsaw`. Needs profiling to isolate before Jigsaw@16.
   - **Known follow-up (pre-existing, not this work):** harden `stillgrid-grade`'s `build_variant` killer path against malformed cage payloads (currently panics → non-JSON crash) if the grade API is ever exposed to untrusted cage input. Not on the `/api/puzzle` path (which only grades generator output).
4. ~~**PWA / offline**~~ — **DONE.** `web/public/manifest.webmanifest` + hand-written `web/public/sw.js` (network-first navigations w/ offline app-shell fallback, stale-while-revalidate assets, network-only `/api`) + brand-mark PNG icons, registered from `main.tsx` in prod only. Also fixed the static-cache headers (sw.js no-store, manifest no-cache, sitemap/robots 1h).
5. **Postgres puzzle pool** — pre-generated puzzles by (variant, tier) so requests are O(1) instead of spawning the generator. Necessary for scale, optional for current load.
6. **Mobile polish** — tool/digit button rows wrap into 3–4 rows on iPhone widths. ~1–2h.
7. ~~**Game schema.org data + open graph images**~~ — **DONE.** Per-variant OG/Twitter cards (`og-{classic,xsudoku,jigsaw,killer}.png` + `og-image.png` home, all 1200×630, rendered from the `/tmp/og-card.html` template with real Fraunces/Inter). Each landing page now points `og:image`/`twitter:image` at its own card with `og:image:alt`, and its `Game` JSON-LD is enriched with `image`, `inLanguage`, `isAccessibleForFree`, and a free `Offer`. Home `WebSite` schema gained `image` + `inLanguage`.
8. **Real SSR (Next.js or Remix)** — only if SEO ROI ever justifies a rewrite. Deep-linking + dynamic per-puzzle pages. Multi-day.
9. **AI answer-engine optimization (GEO/AEO)** — be the citable source when ChatGPT / Claude / Perplexity / Google AI Overviews answer "where can I play killer sudoku" and similar. Same fundamentals as SEO (clean prerendered HTML + schema.org, which we already ship) plus a few AI-specific moves:
   - **`/llms.txt`** (root, prerendered, served as `text/plain` like robots.txt) — a markdown index: one-paragraph site summary + the four variant pages each with a one-line description. The emerging convention LLM crawlers and agents look for.
   - **Named crawler allows in `robots.txt`** — explicitly `Allow` GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, anthropic-ai, PerplexityBot, Google-Extended. Currently covered by `User-agent: *` but naming them signals intent and future-proofs. We *want* citations, so allow (not disallow).
   - **Self-contained, liftable answers** — each landing page already states the rules; add a short "What is X / how to play X" definitional block per variant phrased so an engine can quote it verbatim, plus a per-variant FAQ marked up with `FAQPage` JSON-LD.
   - **`HowTo` structured data** for the rules lists so the steps are machine-readable.
   - Honest caveat: there's no magic dial — AI engines reward the same clean, crawlable, structured content as classic SEO. The SPA at `/` stays JS-only; the prerendered landing pages (`/classic`, `/killer`, `/jigsaw`, `/xsudoku`) remain the AI-visible surface, so all of the above targets those files + `web/public/`. ~half day.
10. **"Learn sudoku" page (`/learn`)** — a real teaching page wired to the topbar "Learn" link (currently `href="#"`). Prerendered HTML in `web/public/learn.html` following the same pattern as the variant landing pages (own title/meta/canonical/OG + `landing.css`, registered in `LANDING_ROUTES` in `server/src/index.ts`). Content: how to play, then a walkthrough of the technique ladder the grader actually uses (naked/hidden singles → pairs/pointing → X-Wing → Swordfish/XY-Wing → chains), which doubles as a unique-content SEO/GEO asset and explains our technique-graded difficulty. Mark up with `HowTo` / `FAQPage` JSON-LD (overlaps with #9). Link it from the variant pages' "Try a variant" rows too. ~half day.

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

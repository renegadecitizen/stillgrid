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
  - T1: Naked/Hidden Single (row, col, box, diag, cage)
  - T2: Naked/Hidden Pair (all unit kinds), Pointing Pair
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

1. **T5 chain-based techniques** (forcing chains, simple coloring, ALS) — closes the remaining "stuck" gap on truly hard puzzles. Inkala-class. Half to full day.
2. **Cage-sum techniques for Killer** (45-rule, innies/outies) — without these, pure-cage killer puzzles (no givens) grade as `stuck` even though they're solvable. Half day.
3. **Mini 6×6 variant** — needs the engine's `N=9` const generalized, or a parallel 6×6 module. 2–3 days proper, ~1 day quick-and-dirty. User excited about this but cost is real.
4. **PWA / offline** — service worker + manifest + home-screen icon. The whole game runs client-side after first load, so this is mostly plumbing. Half day.
5. **Postgres puzzle pool** — pre-generated puzzles by (variant, tier) so requests are O(1) instead of spawning the generator. Necessary for scale, optional for current load.
6. **Mobile polish** — tool/digit button rows wrap into 3–4 rows on iPhone widths. ~1–2h.
7. **Game schema.org data + open graph images** — push beyond the basic landing page SEO. Custom OG image per variant. ~half day.
8. **Real SSR (Next.js or Remix)** — only if SEO ROI ever justifies a rewrite. Deep-linking + dynamic per-puzzle pages. Multi-day.

## Known issues

- Pure-cage Killer puzzles grade as `stuck` (item 2 above — cage-sum techniques missing).
- iPhone width: tool + digit button rows wrap messy (item 6).
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

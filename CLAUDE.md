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
3. **Multi-size (6×6 / 9×9 / 16×16)** — **ENGINE DONE (Layer 1); 6×6 + 9×9 shippable, 16×16 deferred.** The engine is now size-generic (`board.rs` `Board(pub [u8; MAX_CELLS=256], pub u8)`, runtime `n`; `MAX_N=16`; candidate masks widened `u16→u32`; `Variant` carries `n`/`box_h`/`box_w` via `box_dims(n)` = 6→2×3, 9→3×3, 16→4×4; solver/generator/techniques loop over runtime `n`; binaries take `--size`; digits 10–16 render `A`–`G`). Zero 9×9 behavioral change (verified byte-for-byte vs pre-refactor). Spec/plan: `docs/superpowers/specs/2026-05-31-board-size-generalization-design.md`, `docs/superpowers/plans/2026-05-31-engine-size-generalization.md`.
   - **Remaining to ship 6×6 + 9×9:** Layer 2 (server `/api` `size` param; daily stays 9×9) and Layer 3 (web size selector, n-scaled board + digit pad, `storage.ts` `(size,variant)` key + version bump, `analytics.ts` `size` prop) — own plans, not yet written.
   - **16×16 is DEFERRED.** The pure-backtracking solver has no constraint propagation, so 16×16 minimal-clue generation is exponential (~14 s per uniqueness check) and grading takes minutes — not viable per-request. The engine stays 16×16-*capable* (a placeholder `n>9` clue-floor in `generate_variant` prevents hangs). **Prerequisite before 16×16 ships: "solver constraint propagation"** (make `solver.rs` propagate naked singles / candidate elimination instead of pure backtracking). The Postgres pool (#5) would also help but the solver is the root fix.
   - **Note for Layer 2:** the generator guarantees *uniqueness* but only *killer* carves to *grader*-solvability — classic/xsudoku/jigsaw at very low clue counts can be unique-but-`Stuck`. The server must request tier-appropriate clue floors (or generate-then-grade-retry). Also harden `stillgrid-grade`'s `build_variant` killer path against malformed cage payloads (currently panics → non-JSON crash) before exposing it.
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

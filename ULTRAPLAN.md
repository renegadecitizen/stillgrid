# Stillgrid — Ultraplan

**The week-by-week execution plan, from Week 0 (today) to public launch (Week 24) and beyond.**

This is the working document. PRD says *what* and *why*; this says *when* and *in what order*. Targets are aggressive but not insane. Slip ≤ 2 weeks per phase, no more.

---

## Phase 0 — Foundations (Weeks 0–1)

### Week 0 — Setup
- Register domain candidates: stillgrid.com, sudokulab.com, beyondnine.com. Buy the leading one + one fallback.
- Create GitHub repo `stillgrid` (private).
- Set up Heroku app + Postgres + Cloudflare DNS shell. No code yet.
- Open accounts: Plausible, Resend, Sourcepoint trial.
- Create the project skeleton:
  - `/engine` (Rust crate)
  - `/server` (Node/Express + SSR)
  - `/web` (React + Vite)
  - `/content` (markdown for guides/blog/i18n strings)
- Decision: TypeScript strict, Rust 2021 edition, ESLint + Prettier + Clippy enforced in CI from day one.

### Week 1 — The Rust core
- Implement a constraint-based 9×9 sudoku solver in Rust.
- Constraint propagation + uniqueness check. No human techniques yet.
- Test on the 95 classic "hardest" puzzles dataset. Solver must complete each < 100ms.
- Compile to WASM. Smoke test in a 50-line HTML harness.

**Exit criterion for Phase 0:** WASM-compiled solver runs in browser, solves any classic 9×9 puzzle, returns "unique / non-unique / no solution".

---

## Phase 1 — Generator + difficulty rater (Weeks 2–5)

The moat. Don't rush.

### Week 2 — Generator
- Implement puzzle generation: build a full solution, then iteratively remove cells with uniqueness preserved.
- Output: a `Puzzle` struct (JSON-serializable).
- Generate 1000 classic puzzles, dump to JSON, eyeball them.

### Week 3 — Human-style solver
- Port (re-implement) the named-technique solver tier-by-tier:
  - T1: naked single, hidden single
  - T2: naked pair, hidden pair, pointing pair, box-line reduction
  - T3: naked triple, naked quad, X-Wing, simple coloring
- After each technique addition, regenerate puzzles + tag them.

### Week 4 — Advanced techniques
- T4: Swordfish, XY-Wing, XYZ-Wing
- T5: Jellyfish, finned X-Wing, forcing chains
- Cross-check difficulty labels against HoDoKu's labels on a 500-puzzle benchmark. Target: ≥ 90% agreement.

### Week 5 — Variant constraints
- Extend the `Constraint` type to support:
  - Killer cages (sum + uniqueness)
  - Jigsaw irregular boxes
  - X-Sudoku diagonal constraints
  - 6×6 and 16×16 board sizes
- Generator + solver work for all five new shapes.
- **Domain + brand decision lock-in.** Whichever name wins → register all matching socials.

**Exit criterion for Phase 1:** Generator can produce, on demand, a unique-solution puzzle of any (variant, difficulty) combination, with a trustworthy difficulty label. CI: 10,000-puzzle nightly regression.

---

## Phase 2 — Engine pool + server (Weeks 6–7)

### Week 6 — Puzzle pool
- Node sidecar service that calls the Rust generator and writes puzzles to Postgres.
- Schema:
  ```
  puzzles(id, variant, difficulty, givens_json, solution_json, techniques_required, created_at, served_count)
  ```
- Cron job: maintain 10,000 puzzles per (variant × difficulty). Top up overnight.
- API endpoints:
  - `GET /api/puzzle?variant=killer&difficulty=4` → returns one + marks served
  - `GET /api/daily?date=2026-06-01` → returns the daily for that date (deterministic per date)

### Week 7 — SSR shell
- Express + a tiny React SSR layer (no Next, no Remix — keep it boring).
- Routes:
  - `/` (homepage with embedded classic puzzle)
  - `/<variant>` (variant landing)
  - `/<variant>/<difficulty>` (variant + difficulty landing)
  - `/daily`
  - `/about`, `/blog`, `/blog/<slug>`
- All HTML rendered server-side, hydrated client-side. Initial puzzle inlined in HTML.

**Exit criterion for Phase 2:** Visiting `/killer/diabolical` returns a fully-rendered HTML page with a real puzzle, playable after hydration.

---

## Phase 3 — Player UI (Weeks 8–11)

### Week 8 — Grid + input
- Build the core `<Grid>` React component. Handles all variants via constraint metadata.
- Keyboard input, touch input, drag-to-select.
- Undo/redo stack.
- Validation overlay (red highlight on conflict, configurable).

### Week 9 — Pencil marks + hints
- Manual pencil marks. Auto-pencil mode (toggle).
- Hint system: ask solver for next move, surface technique name + 1-sentence explanation.
- Highlight: row/col/box/same-digit when a cell is selected.

### Week 10 — Variant rendering
- Cage outlines for Killer (numbers in top-left of cage, dashed border).
- Irregular box outlines for Jigsaw.
- Diagonal markers for X-Sudoku.
- 6×6 and 16×16 grid scaling.

### Week 11 — Polish
- Themes: light, sepia, dark, high-contrast.
- Settings panel.
- Daily challenge UI + streak indicator + skip-token UX.
- Win animation (subtle — no confetti chaos).
- Performance pass: < 16ms render budget per input.

**Exit criterion for Phase 3:** End-to-end playable site at staging URL with all 6 variants and 6 difficulties working. Internal-only dogfood for 2 weeks.

---

## Phase 4 — Accounts, PWA, print (Weeks 12–13)

### Week 12 — Accounts + sync
- Magic-link auth via Resend.
- Optional account stores: streak, completed-puzzle history, preferences.
- Site still 100% usable signed-out.

### Week 13 — PWA + print
- Service worker: cache app shell + 100 puzzles per variant for offline play.
- "Install Stillgrid" prompt on supported browsers.
- Print mode: generate PDF (4 puzzles/page, weekly pack) via a server-side PDF renderer.

**Exit criterion for Phase 4:** Install Stillgrid as an app on iOS + Android home screens. Play offline. Print a weekly pack.

---

## Phase 5 — Content + SEO (Weeks 14–17)

This is the unglamorous-but-decisive phase. The technical product can be perfect and still get zero traffic without this.

### Week 14 — Localization
- i18n framework wired up (next-intl-style, but for our hand-rolled SSR).
- Translate UI strings → en, de, es, fr, it, pt.
- Translate variant landing pages × difficulty pages.
- hreflang tags on every page.

### Week 15 — Technique guides
- Write 50 technique guides (en first, then machine-translate + lightly edit to other 5 languages).
- Each guide: definition, example, when-to-use, video clip (record yourself solving), embedded interactive demo.

### Week 16 — Blog seed
- 5 link-magnet posts:
  - "We analyzed 100,000 sudoku puzzles. Here's what makes one 'hard'."
  - "The mathematics of the unique-solution constraint"
  - "Why solving sudoku slows cognitive decline — what the research actually says"
  - "Inside the world of constraint sudoku setters" (interview)
  - "Sudoku speedrun: from 14 minutes to 4. A retrospective."
- Ghost blog at `/blog` or hand-rolled MD pipeline.

### Week 17 — Schema + sitemap + indexing
- Schema.org JSON-LD on every page: WebApplication, BreadcrumbList, FAQPage, HowTo, AggregateRating, Organization.
- sitemap.xml generator. Submit to Google Search Console + Bing Webmaster.
- Internal-link audit: every page linked from at least 2 others.

**Exit criterion for Phase 5:** 500+ indexable URLs. Search Console shows pages indexed. PageSpeed > 95 on mobile for all key templates.

---

## Phase 6 — Launch (Weeks 18–20)

### Week 18 — Soft launch
- Invite 50 trusted testers (mix of casual + variant nerds from the *Cracking the Cryptic* Discord).
- Bug bash. Telemetry review: where do people quit puzzles? What variants get plays?
- Sourcepoint consent banner live.

### Week 19 — Bug fixing + perf
- Fix top 10 testers' complaints.
- Lighthouse hardening.
- Direct AdSense applied for (will sit there until traffic warrants).

### Week 20 — Public launch
- Show HN: "Stillgrid — a modern sudoku site with variants, technique-based difficulty, and no signup"
- Reddit: r/sudoku, r/InternetIsBeautiful, r/webdev
- Email outreach to Cracking the Cryptic, sudokuwiki.org, kakuroconquest, and 20 puzzle bloggers.
- Twitter / Bluesky / Mastodon announcement with screenshots.

**Exit criterion for Phase 6:** Launched. > 1K MAU in week 1. No P0 bugs in production.

---

## Phase 7 — Growth (Months 6–12)

Less week-by-week, more loop-by-loop.

### Loop A: SEO content engine
- 1 technique guide deepened per week (add video, examples, related-puzzles widget).
- 1 blog post per fortnight (lean on the data — we have 100K puzzles to analyze).
- Update sitemap nightly.

### Loop B: Daily ritual / retention
- Daily-challenge email (opt-in): "Your streak is 14 days. Today's puzzle: Killer Diabolical."
- Weekly leaderboard reset.
- Monthly setter spotlight (new constraint puzzle from a real setter).

### Loop C: Backlink work
- Pitch 2 data-journalism posts per quarter to news outlets.
- Sponsor 1 episode of Cracking the Cryptic or similar.
- Submit to game/puzzle directories.

### Loop D: Telemetry → variant decisions
- Track: which variants get replayed? Which difficulties have the highest quit rate?
- Cull underperformers, double down on winners. Add Anti-Knight / Thermometer / Arrow in v2 if data justifies.

### Milestones
- **Month 6:** 10K monthly sessions. Direct AdSense live, minimal placement.
- **Month 9:** 100K monthly sessions. Apply to Raptive.
- **Month 12:** 250K monthly sessions. Raptive live. ~$5K MRR.

---

## Phase 8 — v2 considerations (Year 2)

Decide based on Year-1 data. Possible additions:

- Native iOS/Android apps (or wrap PWA via Capacitor).
- Paid tier ($3/mo) — ad-free + cloud sync + bonus setter puzzles.
- Constraint sudoku editor (let community submit puzzles for moderation).
- Multiplayer race mode.
- Additional puzzle types under same brand: kakuro, nonogram, futoshiki.

---

## Operating principles

1. **Difficulty rating is sacred.** If a puzzle labeled Diabolical can be solved with only Tier 2 techniques, that's a P0 bug.
2. **No login walls.** Ever.
3. **SSR > CSR for any indexable page.** No exceptions.
4. **Ads come last.** Build the experience first, monetize after. Direct AdSense is a placeholder; Raptive is the real engine.
5. **Solo-operator scope discipline.** If a feature can't be built in one week, defer it to v2.
6. **Six-month review.** If Month 6 traffic < 5K MAU, stop adding features and double down on SEO + content.

---

## Open questions (decide before each phase begins)

- [ ] **Brand name:** Stillgrid / Sudokulab / Beyond Nine — *decide by Week 5*.
- [ ] **Domain:** primary + 1 fallback — *buy in Week 0*.
- [ ] **Blog platform:** Ghost (separate process, easier authoring) vs. hand-rolled MD pipeline (less infra) — *decide by Week 14*.
- [ ] **Auth provider:** Resend magic links (simple) vs. WorkOS / Clerk (full-featured) — *decide by Week 11*.
- [ ] **Setter network:** reach out to *Cracking the Cryptic* community in Week 8, before any code locks them out.
- [ ] **Pre-generation infra:** in-process Rust crate vs. dedicated worker queue — *decide by Week 6 once we know real generation latencies*.

---

## Init checklist (when we run `/init`)

- [ ] Confirm domain registered
- [ ] GitHub repo created + cloned
- [ ] Heroku app + Postgres provisioned
- [ ] Cloudflare DNS + proxy enabled
- [ ] Scaffolding: `/engine`, `/server`, `/web`, `/content`
- [ ] CI: GitHub Actions for Rust, TS, lint, test
- [ ] Local dev script: `make dev` brings up engine + server + web
- [ ] First commit: README + PRD + ULTRAPLAN copied in
- [ ] Issue tracker seeded with Week 1 tasks

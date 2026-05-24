# Stillgrid

A modern, mobile-first sudoku site with variants, technique-graded difficulty, daily challenges, and offline play.

## Structure

```
stillgrid/
├── engine/      Rust solver + generator (compiles to WASM + native sidecar)
├── server/      Node/Express SSR + API
├── web/         React + Vite client
├── content/     Markdown: blog posts, technique guides, i18n strings
├── PRD.md       Product requirements
├── ULTRAPLAN.md 24-week execution plan
└── Makefile     `make dev` to run everything
```

## Quickstart

```bash
make install      # install all deps (cargo + npm)
make engine       # build Rust release
make dev          # run engine + server + web together
make test         # run all tests
make lint         # cargo clippy + eslint
```

## Phase 0 status

- [x] Repo scaffolded
- [x] Engine compiles, solves a known classic puzzle
- [x] Server boots
- [x] Web boots
- [ ] WASM build pipeline (Week 1)
- [ ] Generator + uniqueness check (Week 2)
- [ ] Difficulty rater (Weeks 3–4)

See `ULTRAPLAN.md` for the full week-by-week plan.

## Owner

Rob — solo operator.

# Stillgrid

A modern, mobile-first sudoku site with variants, technique-graded difficulty,
daily challenges, and offline play.

Stillgrid is a **fully static site**. The Rust engine compiles to WebAssembly
and runs in the visitor's browser, so puzzles are generated, solved and graded
locally with no network round-trip. Everything a crawler can reach — landing
pages, technique guides, the whole daily archive — is written to disk at build
time. There is no server and no hosting bill.

## Structure

```
stillgrid/
├── engine/      Rust solver + generator → WebAssembly (browser) + native CLI (build)
│   ├── wire.rs      the JSON format, shared by both targets
│   └── wasm.rs      the browser ABI
├── web/         React + Vite client, and the static-site build
│   ├── src/engine/  loads the wasm engine; replaces the old /api/*
│   ├── scripts/     build-time prerender + build verification
│   └── data/        pre-generated 16×16 puzzle pool
├── content/     Markdown: blog posts, technique guides, i18n strings
├── PRD.md       Product requirements
├── ULTRAPLAN.md 24-week execution plan
├── DEPLOY.md    Cloudflare Pages setup and the DNS cutover
└── Makefile     `make dev` to run everything
```

## Quickstart

```bash
make install      # cargo fetch + wasm target + npm install
make dev          # build the wasm engine, then run Vite
make build        # full static build into web/dist
make verify       # check the built site (see below)
make test         # engine + web tests
make lint         # cargo clippy + eslint
```

## How the two engine builds stay in agreement

The same Rust code is compiled twice, and the site's correctness depends on the
two builds producing identical output:

- **native** (`engine/target/release/`) pre-renders the daily archive pages at
  build time.
- **wasm** (`web/src/engine/*.wasm`) generates the puzzle a visitor plays.

If those diverged, the archive page for a date would show a different puzzle
than the app hands you for that same date. Three things prevent it:

1. Both targets share one JSON serializer (`engine/src/wire.rs`) — the CLI
   binaries are thin wrappers over it.
2. Both share one daily-seed derivation (`web/src/engine/daily-seed.ts`).
3. `make verify` instantiates the compiled wasm and diffs its output against the
   native binaries for the same seeds. CI runs it, and the deploy refuses to
   ship if it fails.

## Status

- [x] Repo scaffolded
- [x] Engine compiles, solves a known classic puzzle
- [x] Generator + uniqueness check
- [x] Difficulty rater
- [x] WASM build pipeline
- [x] Static hosting — server retired

See `ULTRAPLAN.md` for the full week-by-week plan.

## Owner

Rob — solo operator.

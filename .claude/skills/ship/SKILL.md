---
name: ship
description: Use when deploying Stillgrid to production — releasing local changes to stillgrid.app and confirming the new build is actually live. Triggers on "ship it", "push to prod", "deploy", "release", "go live", "make it live".
---

# Ship Stillgrid to production

## Overview

Production is **Render**, which **auto-deploys on every push to `main`** (`render.yaml` → `autoDeploy: true`). CI (`.github/workflows/ci.yml`) runs on the same push but does **not** gate the deploy — Render ships whatever you push, green or red. So the local gates below are the real safety net, and the only proof a deploy is live is the commit the server reports at `/healthz`.

## When to use

- You want local changes live on https://stillgrid.app.
- Done = the live `/healthz` `commit` equals the SHA you pushed.

## Procedure

**1. Confirm scope + get an explicit go-ahead.** State exactly which commits/branches will go live; get the user's explicit OK before any push to `main` (pushing `main` is an irreversible production deploy).

**2. Get the changes onto `main`.** If work is on a feature branch, land it, then end on `main` with the intended commits:
```bash
git checkout main && git merge --no-ff <branch>
```

**3. Run the CI gates locally — ALL must pass before pushing** (Render won't block on a red build, so this is the safeguard):
```bash
cd engine  && cargo fmt --all -- --check && cargo clippy --all-targets -- -D warnings && cargo test --release
cd ../server && npm run build && npm test --if-present
cd ../web    && npm run build && npm test --if-present
```
Any failure → STOP and fix. Do not push.

**4. Push `main` — this triggers the deploy:**
```bash
git push origin main
```

**5. Verify it's live (NOT optional).** Render deploys asynchronously (~1–4 min) and can fail; a successful `git push` only means GitHub accepted it. Poll `/healthz` until its `commit` matches your HEAD:
```bash
SHA=$(git rev-parse --short HEAD)
until [ "$(curl -s https://stillgrid.app/healthz | jq -r .commit)" = "$SHA" ]; do sleep 20; echo "waiting for $SHA…"; done
echo "live: $SHA"
```

**6. Spot-check the actual change.** Hit the page/endpoint you changed and confirm the new behavior (e.g. `curl -s 'https://stillgrid.app/api/puzzle?variant=killer' | jq .`, or load the affected page). A matching `/healthz` proves the *build* shipped; this proves the *change* works.

**7. Report:** the live commit SHA + a one-line confirmation of the verified change.

## Quick reference

| Step | Command |
|---|---|
| Gates — engine | `cd engine && cargo fmt --all -- --check && cargo clippy --all-targets -- -D warnings && cargo test --release` |
| Gates — server/web | `cd <dir> && npm run build && npm test --if-present` |
| Deploy | `git push origin main` |
| Shipped SHA | `git rev-parse --short HEAD` |
| Live SHA | `curl -s https://stillgrid.app/healthz \| jq -r .commit` |

## Common mistakes

- **Pushing without the gates.** Render deploys red builds — a failed `cargo test`/`tsc` ships broken code straight to prod.
- **Treating `git push` as "done".** It isn't live until `/healthz` reports your commit (step 5).
- **Skipping the change spot-check.** A matching commit proves the build deployed, not that the feature works.
- **Pushing `main` without the explicit go-ahead** (step 1).

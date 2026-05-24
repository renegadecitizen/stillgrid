# Deploying Stillgrid

The repo is configured to deploy to **Render** via a Docker build. Total time
from "create GitHub repo" to "site live at a Render URL" is about 15 minutes,
most of which is the first Docker build.

## One-time setup

### 1. Create the GitHub repo

```bash
cd ~/.chorus/workspace/Projects/stillgrid
git remote add origin git@github.com:YOUR_USERNAME/stillgrid.git
git push -u origin main
```

(Create the repo at https://github.com/new — private is fine. Don't initialize
with README/license — we already have files.)

### 2. Connect Render to the GitHub repo

1. Sign up / sign in at https://render.com.
2. **New → Blueprint** → "Connect a repository" → pick your `stillgrid` repo.
3. Render reads `render.yaml`, shows you a preview of one Web Service named
   `stillgrid`. Click **Apply**.
4. First build runs. Expect ~5–8 minutes (Rust compilation is the slow part).
5. Once green, you get a URL like `https://stillgrid.onrender.com`.

### 3. Point stillgrid.app at Render

1. In Render, open the `stillgrid` service → **Settings → Custom Domain**.
2. Add `stillgrid.app` and `www.stillgrid.app`.
3. Render shows you DNS records to create. At your domain registrar (Cloudflare):
   - `stillgrid.app` → `A` record pointing to Render's IP, **or** `CNAME` to
     `stillgrid.onrender.com` if your registrar supports `CNAME` at apex
     (Cloudflare does, via CNAME flattening).
   - `www.stillgrid.app` → `CNAME` to `stillgrid.onrender.com`.
4. TLS is auto-provisioned by Render once DNS propagates. Usually < 10 min.

## Subsequent deploys

Every push to `main` triggers an auto-deploy (set in `render.yaml`). To deploy:

```bash
git add . && git commit -m "your change" && git push
```

Render builds the Docker image, runs the new container, swaps it in
zero-downtime. Watch the build/log stream from the Render dashboard.

## How the Docker build works

`Dockerfile` is multi-stage:

1. **`engine`** — `rust:1.83-slim` compiles the three Rust binaries
   (`stillgrid-solve`, `stillgrid-generate`, `stillgrid-grade`) in release mode.
2. **`web`** — `node:22-slim` runs `npm install` and `vite build`, producing
   the SPA bundle.
3. **`runtime`** — `node:22-slim` with only what's needed at run time: the
   Node server source, the Rust binaries, and the web `dist/`.

The runtime container exposes port `3001`. The Express server:
- serves `/api/*` by spawning the Rust binaries
- serves `/` and any static asset from `web/dist/`
- falls back to `index.html` for client-side routes (SPA-style)

## Health check

Render polls `GET /healthz` (set in `render.yaml`). If it stops returning
`200 {ok: true}`, Render restarts the container.

## Costs

- **Render Starter plan**: $7/month. Always-on, no cold starts.
- **Render Free plan**: $0 but sleeps after 15 min idle. Fine for testing,
  bad for SEO crawls.

When traffic justifies it (~10K MAU+), bump to Standard ($25/month) for more
CPU/RAM and worker threads. Or move to Render's autoscaling.

## Phase 2 additions (when puzzle pool lands)

When we wire up Postgres, add to `render.yaml`:

```yaml
databases:
  - name: stillgrid-db
    plan: starter  # $7/mo, includes daily backups
    region: oregon

services:
  - type: web
    name: stillgrid
    envVars:
      - fromDatabase:
          name: stillgrid-db
          property: connectionString
        key: DATABASE_URL
```

And a background worker for the nightly puzzle-pool refill:

```yaml
  - type: worker
    name: stillgrid-poolfill
    runtime: docker
    dockerfilePath: ./Dockerfile
    dockerCommand: node --import=tsx server/src/poolfill.ts
    envVars:
      - fromDatabase: { name: stillgrid-db, property: connectionString }
        key: DATABASE_URL
```

## Local-vs-prod parity check

```bash
# Build the same image locally
docker build -t stillgrid:local .
docker run -p 3001:3001 stillgrid:local
# → http://localhost:3001
```

If it works locally in the container, it works on Render.

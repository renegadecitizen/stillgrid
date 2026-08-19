# Deploying Stillgrid

Stillgrid is a fully static site. There is no server, no container, and no
runtime bill — the Rust engine is compiled to WebAssembly and runs in the
visitor's browser, and every page a crawler can reach is written to disk at
build time.

Hosting is **Cloudflare Pages** (free tier: unlimited bandwidth, unlimited
requests). GitHub Actions does the build and pushes the result, so the
toolchain is pinned and reproducible rather than depending on whatever the
host's build image happens to provide.

## What the build produces

```
web/dist/
├── index.html, classic.html, killer.html, …    landing + SPA entry
├── learn-*.html                                technique guides
├── assets/
│   ├── main-<hash>.js / .css                   app bundle
│   └── stillgrid-engine-<hash>.wasm            the engine (~N00 KB)
├── daily/
│   ├── index.html                              archive index
│   └── <kind>/<date>.html                      one page per archived daily
├── pool-16.json                                pre-generated 16×16 puzzles
├── sitemap.xml                                 static URLs + every daily URL
├── _headers                                    Cache-Control rules
└── _redirects                                  /learn/* rewrites, /api/* → 410
```

## Build it locally

```bash
rustup target add wasm32-unknown-unknown     # once
cd engine && cargo build --release --bins    # native, for the prerender step
cd ../web && npm ci && npm run build         # wasm + bundle + prerender
npx vite preview                             # serve dist/ locally
```

`npm run build` runs four steps in order, and each one depends on the last:

1. `build:wasm` — `cargo build --release --lib --target wasm32-unknown-unknown`,
   then copies the result into `web/src/engine/` so Vite content-hashes it.
2. `tsc -b` — typecheck.
3. `vite build` — bundle into `dist/`.
4. `prerender` — generate the daily archive, merge the sitemap, copy the 16×16
   pool. This step shells out to the **native** engine binaries, which is why
   step 0 above builds them.

## One-time Cloudflare setup

1. Create a Pages project (Workers & Pages → Create → Pages → **Direct Upload**,
   named `stillgrid`). Direct Upload is correct here — Actions builds, not
   Cloudflare.
2. Create an API token with the **Cloudflare Pages: Edit** permission.
3. Add two repository secrets in GitHub (Settings → Secrets → Actions):
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
4. Push to `main`. The `deploy` workflow builds and uploads.
5. Once the first deploy is green, add the custom domains in the Pages project
   (Custom domains → `stillgrid.app` and `www.stillgrid.app`).

## Cutting the domain over from Render

Do this only after a Pages preview URL has been checked by hand. The order
matters — add the domain to Pages *before* changing DNS, so the certificate is
ready when traffic arrives.

1. In the Pages project, add `stillgrid.app` and `www.stillgrid.app` as custom
   domains. Cloudflare will show the DNS records it wants.
2. In the Cloudflare DNS tab for `stillgrid.app`, replace the Render `A` records
   (`216.24.57.x`) with the `CNAME` Pages asks for. Apex works via CNAME
   flattening.
3. Wait for the certificate to go active (usually a few minutes).
4. Verify, with a hard refresh: the daily archive, a 16×16 puzzle, the `/grade`
   tool, and `/learn/xy-wing` (the rewrite rules).
5. **Then** delete the Render service. Not before — while it still exists you
   can revert by pointing DNS back.

Keep the domain registration itself where it is; only the hosting moves.

## The daily rebuild

The archive grows by two pages a day. A scheduled workflow rebuilds and
redeploys shortly after midnight UTC so the new day's pages exist and the
archive index and sitemap include them. If it ever fails, the site keeps
serving yesterday's build — stale by one day, never broken.

## Rollback

Cloudflare Pages keeps every deployment. Roll back from the dashboard
(Deployments → … → Rollback) — it's instant and needs no rebuild.

## What this used to cost

Render Starter, $7/month, for an always-on container whose only job was to
shell out to a Rust binary a few times a second. Cloudflare Pages' free tier
covers this workload with room to spare; the only remaining cost is the
`stillgrid.app` domain registration.

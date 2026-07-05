# Migrate analytics: Plausible Cloud → Umami Cloud (free tier)

**Status:** Design approved 2026-07-05, awaiting Umami website ID + implementation plan
**Date:** 2026-07-05
**Owner:** Rob
**Related:** [Plausible integration spec](2026-05-25-plausible-integration-design.md) (event taxonomy lives there and is unchanged)

---

## Summary

Replace hosted Plausible ($9/mo) with Umami Cloud's free Hobby tier. Motivation is purely cost: stillgrid did 23 visitors / 37 pageviews in the 30 days before this design, which doesn't justify a paid analytics plan. Hard constraint: **the privacy posture is non-negotiable** — the live privacy page promises "No Google Analytics, no Meta pixel, no advertising network" and "no cookie banner because there are no cookies." Umami is cookieless and GDPR-compliant, so every published promise stays true with a one-word-scale edit (Plausible → Umami).

The event taxonomy (7 events + props, defined in the 2026-05-25 spec) carries over 1:1 — Umami's `umami.track(name, data)` accepts the same string/number/boolean props.

## Decisions locked

| Decision | Choice | Rationale |
|---|---|---|
| Provider | Umami Cloud (hosted, free Hobby tier) | Only free option with structured event props. GA4: breaks the published privacy promise, needs a consent banner. GoatCounter: events are bare counters, no props — would lose variant/size/tier slicing. Cloudflare Web Analytics: no custom events at all. Self-hosted Plausible CE/Umami: needs a paid Postgres(+ClickHouse) host, fails the $0 goal. |
| Free-tier limits accepted | 100k events/mo, 3 sites, **6-month data retention** | At ~37 pageviews + a handful of events per month we're at ≈0.1% of quota. Retention is the real trade-off vs Plausible's forever — accepted at current scale; revisit only if the site grows enough that trends >6 months matter. |
| Event taxonomy | Unchanged (names, props, call sites) | The 7 events answer the same product questions regardless of provider. No call-site edits. |
| Integration style | Script tag + existing typed helper | Same shape as today. `track()` signature unchanged; only the helper body and the `<script>` tags change. |
| `first_visit_ever` localStorage flag | **Keep the existing key name** even though it contains "plausible" | Renaming the key would re-fire `first_visit_ever` for every returning browser and corrupt the new-vs-returning signal. A stale name is cheaper than bad data. Confirm exact key in the implementation plan. |
| Historical Plausible data | CSV export before cancelling; **no import** into Umami | Umami has no Plausible importer and the volume is trivial. Keep the CSV locally outside the repo. |

## Architecture & file changes

```
web/
├── index.html                    # swap 2 Plausible lines → 1 Umami line
├── public/
│   ├── classic.html              # same swap
│   ├── killer.html               # same swap
│   ├── jigsaw.html               # same swap
│   ├── xsudoku.html              # same swap
│   └── privacy.html              # same swap + rewrite Analytics section copy
└── src/
    └── analytics.ts              # helper body: window.plausible → window.umami.track
CLAUDE.md                         # Analytics section: provider, dashboard URL, MCP note
```

Six HTML files, not five — `privacy.html` gained the script after the original Plausible spec.

Identical Umami snippet in all six (replaces both Plausible lines):

```html
<!-- Privacy-friendly analytics by Umami -->
<script defer src="https://cloud.umami.is/script.js" data-website-id="WEBSITE_ID"></script>
```

`WEBSITE_ID` is the UUID Umami issues when `stillgrid.app` is added as a site (Settings → Websites → Add website). Like Plausible's script ID, it is public by design — fine in committed HTML.

**No server changes. No engine changes. No npm dependencies. No call-site changes in App.tsx or storage.ts.**

### `analytics.ts` after the swap

```ts
declare global {
  interface Window {
    umami?: { track: (event: string, data?: EventProps) => void };
  }
}

export function track(event: EventName, props?: EventProps): void {
  if (!import.meta.env.PROD) return;
  if (typeof window.umami?.track !== "function") return;
  window.umami.track(event, props);
}
```

`EventName` union and `EventProps` unchanged.

### Privacy page copy

Rewrite the two Analytics paragraphs: Umami instead of Plausible, link Umami's site and data/privacy policy, same plain-English framing ("how many people played a killer puzzle today — never this specific person did X"). Update "Just Plausible." in the *What we don't use* section to "Just Umami." The meta description ("Analytics is cookieless") and the Cookies section ("no cookie banner because there are no cookies") remain true verbatim — do not touch the promises, only the provider name.

## What Umami tracks automatically

Same category of auto-metrics as Plausible from the script tag alone: pageviews, unique visitors, referrers/sources, entry pages, devices/browsers/OS, country/region, UTM parameters, plus bounce rate and visit duration. Confirm in the Umami dashboard after deploy; no code needed.

## Edge cases

- **Ad blockers.** `cloud.umami.is` is on common blocklists, same as `plausible.io`. The helper's `typeof` guard silently no-ops. Umami supports first-party proxying if data ever looks suspiciously low — not v1, same stance as the Plausible spec.
- **No queue stub.** The Plausible snippet queued events fired before the script loaded; the Umami snippet doesn't — `window.umami` is simply undefined until the script executes, and early events no-op via the guard. Marginally lossier in the first ~100ms of a page load; acceptable.
- **Dev environment.** `import.meta.env.PROD` guard unchanged — localhost never pollutes prod stats.

## Decommission plan (ordered)

1. Rob creates the Umami Cloud account, adds `stillgrid.app`, hands over the website ID.
2. Code swap lands, CI gates pass, deploy to Render, verify (below).
3. Export the Plausible CSV (dashboard → export) and keep it locally.
4. Rob cancels the Plausible subscription.
5. The `~/plausible-mcp` server retires — its API target goes dark once the subscription ends. Umami Cloud has a stats API, so an `umami-mcp` replacement is possible later; **out of scope** here. Update CLAUDE.md's dashboard URL and the plausible-mcp memory note.

## Verification after deploy

1. Visit `/`, `/classic`, `/killer`, `/jigsaw`, `/xsudoku`, `/privacy` on stillgrid.app; confirm the Umami script loads (network tab, 200) and pageviews appear in the Umami dashboard.
2. Start a puzzle → `puzzle_started` appears under Events with variant/tier/is_daily props.
3. Solve it → `puzzle_completed` with duration.
4. Confirm no request to `plausible.io` from any page.

## Out of scope

- Umami MCP server / dashboard queries from Claude (possible follow-up).
- First-party proxy for ad-blocker mitigation — wait for a data signal, same as before.
- Importing Plausible history into Umami.
- Any change to event names, props, or call sites.
- Consent banner — still not needed; that was the point.

## Open questions for the implementation plan

1. The Umami website ID (from Rob — blocks the HTML edits).
2. Exact `first_visit_ever` localStorage key name in code — keep it byte-identical.
3. Whether any other file references plausible.io (grep the repo: docs, sw.js caching rules, README).

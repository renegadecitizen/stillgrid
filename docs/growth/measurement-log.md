# Growth measurement log

Weekly measurement passes for the growth plan. One entry per pass, newest first. Every figure is dated; GSC data lags ~2 days.

Sources: Google Search Console (`sc-domain:stillgrid.app`) and Umami (free share-token flow — see CLAUDE.md § Analytics; Cloud API keys are Pro-gated, never buy Pro for this).

**Umami caveat:** data before 2026-07-07 contains self-test contamination (junk `text/html,…` paths, phantom `grade_used`/`puzzle_started`) — fixed by the `data-domains` guard in `fec9baf`. Ignore pre-fix noise.

## Trend at a glance

| Pass | Date | GSC 28d impr | Clicks | Avg pos | Umami 7d pv | Visitors | Notable |
|---|---|---|---|---|---|---|---|
| 1 | 2026-07-07 | 26 | 0 | 25.7 | 81* | 17* | Wave-one pages all indexed |
| 2 | 2026-07-14 | 477 | 2 | 34.1 | 46 | 33 | Breakout; first clicks ever |
| 3 | 2026-07-22 | 809 | 3 | 35.4 | 56 | 37 | uneed + fmhy referrals go live |
| 4 | 2026-07-27 | 1128 | 4 | 34.3 | 30 | 27 | Traffic dip, impressions up |
| 5 | 2026-08-03 | 1539 | 12 | 34.4 | 105 | 46 | Best engagement week; sitemap staleness found |
| 6 | 2026-10-30 | **48** | 6 | 25.6 | 59 | 42 | **Impressions cliff 08-16 (−97%)**; /learn/* + /daily canonical↔308 loop |
| 7 | 2026-11-02 | 51 | 7 | 17.6 | 46 | 36 | Flat at the floor; canonical loop still live (unfixed) |
| 8 | 2026-11-09 | 49 | 6 | 15.8 | 58 | 34 | **Deploy workflow auto-disabled (60-day inactivity); archive frozen at 11-03** |
| 9 | 2026-11-16 | 49 | 6 | 16.2 | 74 | 60 | Deploy still disabled (13 days of 404s); visitors +76%, mostly direct to `/` |
| 10 | 2026-11-23 | 72 | 7 | 29.1 | 80 | 60 | Deploy still disabled (20 days); impressions +47%, almost all /learn-xy-wing @65 |

\* pass-1 Umami numbers include pre-fix self-test junk.

## Standing gates

Carried forward each pass until the gate resolves.

- **M1 gate** — are wave-one pages indexed and impressions trending up? *Status: PASS since pass 2.*
- **Per-date daily pages** are the thin-page canary. If they sit "Discovered – currently not indexed" for several consecutive weeks, noindex per-date pages (keep the `/daily` index). *Status: NO (pass 10: still broken, 3rd week. 11-18 and 11-13 sampled pages are 404 and "Unknown to Google") (pass 9: canary still broken. Both sampled pages are 404 and "Unknown to Google" because the archive has been frozen at 11-03 for 13 days) (pass 8: 3rd consecutive pass, but 11-04+ pages now 404 because the nightly rebuild stopped, so the canary is broken this week) (pass 7: 2nd consecutive pass with recent per-date pages "Discovered – not indexed"; still on hold) — they indexed and ranked through pass 5, but since the 08-16 cliff recent ones sit "Discovered – currently not indexed" / unknown. Don't extend the backfill or noindex until the cliff is explained.*
- **More `/learn` technique pages** (ALS, etc.) only if the previously shipped one indexes. *Status: HOLD — forcing-chains indexed after the 08-03 resubmit, but since the Pages migration every `/learn/*` URL 308s to `/learn-*` while its canonical points back at `/learn/*` (loop). Fix that before adding pages.*
- **A dedicated `/kakuro-combinations` page** only if kakuro-family impressions appear in GSC. *Status: GATED — zero kakuro impressions across 5 passes.*
- **Referral watch** — fmhy.net (largest potential single source in the plan; flag prominently if it appears), uneed.best, github.com, search engines.

## Process lessons

- **Before recommending any on-page keyword work, grep the target page for the term first.** GSC impressions at a weak position do NOT imply the keyword is missing — it usually means the page is competition-bound, and more mentions make it worse. (Learned pass 4: a "add giant sudoku to /sudoku-16x16" recommendation was retracted same-day after finding the term already in 5 places on the page.)
- **Two on-page passes on `/evil-sudoku` and the calculator moved impressions but not rank.** Treat those pages as competition-bound and spend effort on off-page authority instead.
- **Pass gaps hide regressions.** Pass 5 → 6 was 88 days; an 08-16 impressions cliff and a migration-introduced canonical loop went unnoticed for ~2.5 months. Curl every canary URL (status + `Location` + canonical) each pass, not just GSC coverage.
- **GSC UI gotchas:** on a `sc-domain:` property the "Add a new sitemap" box needs the full `https://stillgrid.app/sitemap.xml` — a bare `sitemap.xml` path is rejected as "Invalid sitemap address". And there is no working deep link to Request Indexing (`search.google.com/search-console/inspect?resource_id=…&id=…` 404s); use the "Inspect any URL" bar at the top of the property.
- **GitHub disables scheduled workflows after 60 days with no repo commits** (`gh workflow list --all` shows `disabled_inactivity`). Every pass, check that the `deploy` workflow is `active` and that its last scheduled run is from today or yesterday. Learned pass 8: it stopped after the 11-03 run, 76 days after the last commit (08-19).
- **The GSC MCP credentials can expire mid-session.** In pass 5, reads worked early and then both `submit_sitemap` and `get_sitemaps` failed with "Authentication failed". The MCP's `reauthenticate` tool (interactive browser login) restores it. Write scope is untested, not known-absent.

---

## Pass 10 — 2026-11-23

*7 days after pass 9. Nothing shipped since 08-19; none of the pass-8/9 recommendations has been done.*

**Still broken: deploy = `disabled_inactivity`** (`gh workflow list --all`, 11-23). The archive has been frozen at 11-03 for **20 days**. Curl 11-23: classic 11-03 returns 200; classic 11-18, killer 11-13 and classic 11-22 all 404. Sitemap still 379 `<loc>`, newest 11-03.

**Resolved same day (11-23 18:03 UTC):** Rob ran `gh workflow enable deploy` + `gh workflow run deploy` (run 45234073658, success). Curl after: 11-04, 11-13, 11-22 and 11-23 per-date pages all 200; sitemap 419 `<loc>`, newest 11-23; `deploy` = active. It will disable again after another 60 days without repo activity, so a commit (e.g. the canonical-loop fix) is still needed.

**GSC 28d (10-26..11-22): 72 impressions / 7 clicks / avg position 29.1** (pass 9: 49 / 6 / 16.2). Impressions +47%, but the rise is almost all **/learn-xy-wing: 28 impr @64.8** (pass 9: 8). That low-ranked page is also why average position worsened. 11-17 had 9 impressions, the best day since the cliff. Branded `/` 36 @1.7 with all 7 clicks. Other pages: /classic 7@4.6, /daily/ 7@2.9, /killer 5, /calculator 5@5.6, /learn-coloring 5@38, /learn-swordfish 4@7, /learn-forcing-chains 4@15, /privacy 4, /learn-advanced 3, /learn-variants 3, plus 1 each for the rest. Queries: xy-wing family (~25 impr @60–80), "coloring sudoku" 1@86, "sudoku cage" 1@22. **Zero calculator, hexadoku/16x16, evil, daily, grader or kakuro queries.**

**Indexation (inspected 11-23; curl 11-23):**

| URL | Coverage | Last crawl | Live |
|---|---|---|---|
| /killer-sudoku-calculator | Indexed | 11-16 | 200 |
| /sudoku-16x16 | Indexed | 10-02 | 200 |
| /grade | Indexed | 11-06 | 200 |
| /evil-sudoku | Indexed | 09-25 | 200 |
| /daily | Page with redirect | **11-19** | 308 → /daily/ |
| /learn/xy-wing, /learn/swordfish | Page with redirect | 11-15 / 11-16 | 308 → /learn-x |
| /daily/classic/2026-11-18 | Unknown to Google | never | **404** |
| /daily/killer/2026-11-13 | Unknown to Google | never | **404** |

No change from pass 9. The canonical↔308 loop is still live (5th pass). Sitemap: Valid, 379 URLs, 0 errors, last downloaded 11-19, so no resubmit needed.

**Umami 7d (11-16..11-23): 80 pageviews / 60 visitors / 67 visits** vs prior 7d 74 / 60 / 65: pv +8%, visitors flat, visits +3%. The direct traffic to `/` held (44 pv). Paths: / 44, /grade 5, /evil-sudoku 5, /privacy 2, /daily/ 2, plus 1 each for /jigsaw, /classic, /learn-coloring, /learn-xy-wing, /learn, the calculator and one old per-date page. Referrers 7d: google 2, ddg 1. Country 7d (the pass-9 follow-up): US 30, SG 4, DE 4, ZA 4, BR 3, GB 3, FI 2, IN 2, others 1. Device: laptop 47, mobile 11. No single-country spike, so this does not look like one bot; it still has no referrer, so the source is unknown. Since 08-04: google 27, bing 15, chatgpt.com 11, ddg 6, yahoo 4, ecosia 3, github 3, google.co.uk 2, uneed 2, yandex 2, **fmhy.net 1 (unchanged)**, raindrop 1, reddit 1, gemini 1. Uneed listing (MCP 11-23): 10 votes, 0 reviews, DR 8, unchanged.

Events 7d: puzzle_started 98 (prior 122), first_visit_ever 39 (44), puzzle_completed 7 (4), grade_used 5 (3), calculator_used 0 (0), tier_unmatched 0, puzzle_shared 0.

**Gates:** M1 **FAIL** (impressions up but non-branded rank ~65; nothing new indexed). Per-date noindex: **HOLD**. The canary can't be read while new pages 404. /learn **HOLD** (loop unfixed; the `/learn-*` duplicates are what's gaining impressions). Kakuro **GATED** (0 impressions).

**Recommended next:** (1) **Rob: re-enable deploy now.** Run `gh workflow enable deploy`, then `gh workflow run deploy`. This is the 3rd week of 404s. (2) Fix the canonical loop. Google is consolidating onto `/learn-*`, so the quickest fix is to make `/learn-*` canonical in the pages and the sitemap. That commit also resets the 60-day clock. (3) Optional: add a monthly keepalive (or drop the inactivity risk by triggering the cron from a commit-producing job) so this can't recur.

## Pass 9 — 2026-11-16

*7 days after pass 8. Nothing shipped since 08-19; none of the pass-8 recommendations has been done.*

**Still broken: deploy = `disabled_inactivity`** (`gh workflow list --all`, 11-16). The archive has been frozen at 11-03 for 13 days. Curl 11-16: classic 11-03 returns 200; classic 11-11, killer 11-06 and classic 11-15 all return 404. The sitemap still has 379 `<loc>` entries, the newest 11-03.

**GSC 28d (10-19..11-15): 49 impressions / 6 clicks / avg position 16.2** (pass 8: 49 / 6 / 15.8). Still on the floor. 11-15 had 8 impressions and 2 clicks, tying the best day since the cliff. Branded `/` has 36 impressions @1.7 and all 6 clicks. Other pages: /learn-xy-wing 8@60, /daily/ 7@2.9, /killer 5@3.6, /learn-coloring 5@38, /learn-swordfish 5@19, /classic 4, and 1–3 each for the rest. Google is still indexing the `/learn-*` duplicates, now including /learn-advanced and /learn-variants. Queries: xy-wing family (7 impressions @61–72), "coloring sudoku" 1@86, "sudoku cage" 1@22. **Zero calculator, hexadoku/16x16, evil, daily, grader or kakuro queries.**

**Indexation (inspected 11-16; curl 11-16):**

| URL | Coverage | Last crawl | Live |
|---|---|---|---|
| /killer-sudoku-calculator | Indexed | **11-16** | 200 |
| /sudoku-16x16 | Indexed | 10-02 | 200 |
| /grade | Indexed | 11-06 | 200 |
| /evil-sudoku | Indexed | 09-25 | 200 |
| /daily | Page with redirect | 10-20 | 308 → /daily/ |
| /learn/xy-wing, /learn/swordfish | Page with redirect | 11-15 / 11-16 | 308 → /learn-x |
| /daily/classic/2026-11-11 | Unknown to Google | never | **404** |
| /daily/killer/2026-11-06 | Unknown to Google | never | **404** |

No change from pass 8. The canonical↔308 loop is still live (4th pass). Sitemap: Valid, 379 URLs, 0 errors, last downloaded 11-12, so no resubmit needed.

**Umami 7d (11-09..11-16): 74 pageviews / 60 visitors / 65 visits** vs prior 7d 58 / 34 / 46: pageviews +28%, **visitors +76%**, visits +41%. Bounces 19 and totaltime 80s are the same post-migration counting oddity. Paths: / 47, /evil-sudoku 4, /learn 2, /daily/ 2, /sudoku-16x16 2, plus 1 each for /grade, /privacy, /learn-xy-wing and two old per-date pages. Referrers 7d: bing 1, google 1. **So the visitor jump is almost entirely direct or no-referrer traffic to `/`, and the source is unknown.** Since 08-04: google 26, bing 15, chatgpt.com 11, ddg 5, yahoo 4, ecosia 3, github 3, google.co.uk 2, uneed 2, yandex 2, **fmhy.net 1 (unchanged)**, raindrop 1, reddit 1, gemini 1. Uneed listing (MCP 11-16): 10 votes, 0 reviews, DR 8, unchanged.

Events 7d: puzzle_started 122 (prior 93), **first_visit_ever 44 (21)**, puzzle_completed 4 (7), grade_used 3 (20), calculator_used 0 (3), tier_unmatched 0, puzzle_shared 0. New visitors doubled, but completions fell and the grade power-user went quiet. That fits drive-by direct traffic (a bookmark, an app link, or a bot running JS), not engaged players.

**Gates:** M1 **FAIL** (unchanged). Per-date noindex: **HOLD**. The canary can't be read while new pages 404. /learn **HOLD** (loop unfixed). Kakuro **GATED** (0 impressions).

**Recommended next:** (1) **Rob: re-enable deploy now.** Run `gh workflow enable deploy`, then `gh workflow run deploy`. This is the 2nd week of 404s on the daily archive. (2) Fix the canonical loop. That commit also resets the 60-day inactivity clock. (3) Next pass: if direct traffic to `/` holds at ~60 visitors/week, check the Umami dashboard for a country or device skew to tell bots from a real new source.

## Pass 8 — 2026-11-09

*7 days after pass 7. Still nothing shipped since 08-19.*

**Anomaly: the nightly archive rebuild has stopped.** `gh workflow list --all` shows `deploy` = **disabled_inactivity**. GitHub turns off scheduled workflows after 60 days without a commit, and the last commit was 08-19. The last scheduled run was 11-03 06:40 UTC. As a result, every per-date page from **2026-11-04 on returns 404** (curl 11-09: classic + killer 11-05, 11-07 and 11-09 all 404; 11-03 is 200). The sitemap stops at 11-03 (379 `<loc>`). Today's daily still plays in the SPA because the engine runs in the browser. Only the archive pages and the sitemap are frozen.

**GSC 28d (10-12..11-08): 49 impressions / 6 clicks / avg position 15.8** (pass 7: 51 / 7 / 17.6). Still on the post-08-16 floor at 0–8/day. Branded `/` accounts for 35 impressions @1.6 and all 6 clicks. Pages: /learn-xy-wing 11@54, /daily/ 5@3.2, /learn-swordfish 3@25, /sudoku-16x16 3@25, plus 1–2 each for evil, killer, calculator, grade and /learn. Queries: only the xy/xyz-wing family (6 impr @62–78) and "sudoku 16x16" 1@60. **Zero non-branded calculator, evil, daily, grader, hexadoku or kakuro queries.**

**Indexation (inspected 11-09; curl 11-09):**

| URL | Coverage | Last crawl | Live |
|---|---|---|---|
| /killer-sudoku-calculator | Indexed | 10-30 | 200 |
| /sudoku-16x16 | Indexed | 10-02 | 200 |
| /grade | Indexed | **11-06** | 200 |
| /evil-sudoku | Indexed | 09-25 | 200 |
| /daily | Page with redirect | 10-20 | 308 → /daily/ (canonical /daily) |
| /learn/xy-wing, /learn/swordfish | Page with redirect | 10-29 | 308 → /learn-x (canonical /learn/x) |
| /daily/classic/2026-11-04 | Unknown to Google | never | **404** |
| /daily/killer/2026-10-30 | Discovered – not indexed | never | 200 |

The canonical↔308 loop is unchanged (3rd pass). Sitemap: Valid, 379 URLs, 0 errors, last downloaded **11-07**, so no resubmit needed.

**Umami 7d (11-02..11-09): 58 pv / 34 visitors / 46 visits** vs prior 7d 46 / 36 / 38 → pv +26%, visitors −6%, visits +21%. Bounces 3 and totaltime 2041s are still the post-migration counting oddity. Paths: / 29, /grade 4, /killer-sudoku-calculator 3, /jigsaw 1. Referrers 7d: google 1 (prior: google 1). Since 08-04: google 23, bing 13, chatgpt.com 11, ddg 5, yahoo 4, ecosia 3, github 2, uneed 2, yandex 2, **fmhy.net 1 (unchanged)**, raindrop 1, google.co.uk 1, reddit 1, gemini 1. Uneed listing (MCP 11-09): 10 votes, 0 reviews, DR 8, unchanged.

Events 7d: puzzle_started 94 (prior 80), first_visit_ever 22 (28), grade_used 20 (22), puzzle_completed 7 (10), calculator_used 3 (0), tier_unmatched 0 (2), puzzle_shared 0 (0).

**Gates:** M1 **FAIL** (unchanged). Per-date noindex: **HOLD**. This is the 3rd pass with recent pages not indexed, but the cliff confounds it and the newest pages now 404 anyway. /learn **HOLD** (loop unfixed). Kakuro **GATED** (0 impressions).

**Recommended next:** (1) **Rob: re-enable the deploy workflow** (`gh workflow enable deploy`, or the Actions tab), then `gh workflow run deploy` to backfill 11-04..today. It will switch off again 60 days after the last commit, so either commit something at least every 60 days or add a keepalive step. (2) Fix the canonical loop. This has been carried since pass 6, and its commit would also reset the inactivity clock. (3) Rob: GSC UI check of Manual actions, Security issues, and Pages → "Why pages aren't indexed" around 08-16. Still not done.

## Pass 7 — 2026-11-02

*3 days after pass 6, so GSC 28d windows overlap ~90%. Nothing shipped since 08-19; the pass-6 fixes are not done.*

**GSC 28d (10-05..11-01): 51 impressions / 7 clicks / avg position 17.6** (pass 6: 48 / 6 / 25.6). Still on the post-08-16 floor (0–8/day). The position "gain" is just branded `/` taking a bigger share (33 impr @1.5, all 7 clicks). 11-01 = 8 impr @1.1, the best day in a month, all branded.

Pages: / 33, /learn-xy-wing 15@48, /daily/ 5@3.2, /learn-swordfish 3@25, /sudoku-16x16 3@25, evil 2, calculator 1, grade 1, + four old per-date pages at 1 each (@6–14). Queries: only xy/xyz-wing (9 impr @18–78) and "sudoku 16x16" 1@60. **Zero non-branded calculator, evil, daily, grader, hexadoku or kakuro queries.**

**Indexation (inspected 11-02; curl 11-02):**

| URL | Coverage | Last crawl | Live |
|---|---|---|---|
| /killer-sudoku-calculator | Indexed | 10-30 | 200 |
| /sudoku-16x16 | Indexed | 10-02 | 200 |
| /grade | Indexed | 09-05 | 200 |
| /evil-sudoku | Indexed | 09-25 | 200 |
| /daily | Page with redirect | 10-20 | 308 → /daily/ |
| /learn/xy-wing, /learn/swordfish | Page with redirect | 10-29 | 308 → /learn-x (canonical still /learn/x) |
| /daily/classic/2026-10-28 | Discovered – not indexed | never | 200 |
| /daily/killer/2026-10-23 | Discovered – not indexed | never | 200 |

No regressions vs pass 6, no improvements. The canonical↔308 loop is still live and `_redirects` is unchanged. Sitemap: Valid, 377 URLs, 0 errors, last downloaded **11-02**, so no resubmit needed.

**Umami 7d (10-26..11-02): 46 pv / 36 visitors / 38 visits** vs prior 7d 97 / 59 / 74 → pv −53%, visitors −39%. Bounces 1 and totaltime 91s are implausible, the same post-migration counting oddity as pass 6, so ignore them. Paths: / 30, /grade 7, /sudoku-16x16 2, /learn 1, /evil-sudoku 1. Referrers 7d: google 1 (prior: google 2, bing 1, ddg 1). Since 08-04: google 24, bing 14, chatgpt.com 11, ddg 5, yahoo 4, github 3, ecosia 3, uneed 2, yandex 2, **fmhy.net 1 (unchanged)**, raindrop 1, reddit 1, gemini 1. Uneed listing (MCP 11-02): 10 votes, 0 reviews, DR 8.

Events 7d: puzzle_started 80 (prior 197), first_visit_ever 28 (39), grade_used 22 (30), puzzle_completed 10 (4), tier_unmatched 2 (3), calculator_used 0 (2), puzzle_shared 0 (0). Completions are up while starts halve. grade_used 22 vs 7 /grade pv is the same power-user pattern.

**Gates:** M1 **FAIL** (unchanged). Per-date noindex: **HOLD**. This is the 2nd pass in a row with recent per-date pages Discovered–not indexed, but it's confounded by the site-wide cliff, so don't noindex yet. /learn **HOLD** (loop unfixed). Kakuro **GATED** (0 impressions).

**Recommended next (carried from pass 6, none done yet):** (1) Fix the canonical loop. In `web/public/_redirects` either point the rules at extensionless targets (`/learn/xy-wing /learn-xy-wing 200`), or make `/learn-*` and `/daily/` canonical in the pages and the sitemap. Then curl to confirm `/learn/xy-wing` returns 200. (2) Rob: in the GSC UI, check Manual actions, Security issues, and Pages → "Why pages aren't indexed" around 08-16. (3) Hold the next pass to ~11-09, since a 3-day gap mostly re-measures the same window.

## Pass 6 — 2026-10-30

*First pass in 88 days. The Render → Cloudflare Pages static migration shipped 2026-08-19 in between.*

**GSC 28d (10-02..10-29): 48 impressions / 6 clicks / avg position 25.6** (vs pass 5: 1539 / 12 / 34.4 — **impressions −97%**). Avg position "improved" only because what's left is branded `/` at ~1.5 (27 impr, all 6 clicks).

**Anomaly — impressions cliff on 2026-08-16.** Daily impressions ran 38–67/day through 08-15, then 2 / 6 / 0 / 4 / 1… and have stayed at 0–9/day for 2.5 months. Not an outage: Umami pageviews were steady across it (08-15: 9, 08-16: 3, 08-17: 14, 08-18: 8). Precedes the 08-19 migration commit by 3 days, so the migration isn't the obvious trigger (DNS cutover timing unknown). Indexed pages still return 200 with self-canonicals and no robots/noindex headers (checked 10-30). Cause unexplained from the API — needs a look at Manual actions / Security issues / Pages report in the GSC UI.

Pages 28d: / 27@1.5, /learn-xy-wing 19@55.6, /learn-swordfish 2, /sudoku-16x16 2@33, /daily/ 2, /evil-sudoku **1** (was 527), calculator **0** (was 265). Queries: only xy-wing family (≈14 impr @41–71) and "sudoku 16x16" 1@60. **Zero kakuro, evil, calculator, daily, grader.**

**Indexation (inspected 10-30):**

| URL | Coverage | Last crawl |
|---|---|---|
| /killer-sudoku-calculator | Indexed | 10-30 |
| /sudoku-16x16 | Indexed | 10-02 |
| /grade | Indexed | 09-05 |
| /evil-sudoku | Indexed | 09-25 |
| /learn/forcing-chains | Indexed (fixed by 08-03 resubmit) | 08-03 |
| /daily | **Page with redirect** | 10-20 |
| /learn/xy-wing, /learn/swordfish | **Page with redirect** | 10-29 |
| /daily/classic/2026-10-25 | Unknown to Google | never |
| /daily/killer/2026-10-20 | Discovered – not indexed | never |

**Regression found — canonical ↔ redirect loop (live, curl 10-30).** `_redirects` declares `/learn/<x> → /learn-<x>.html 200` (meant as rewrites), but Pages serves them as **308 → /learn-<x>** (its .html pretty-URL stripping). Those pages' canonical still says `/learn/<x>`, and the sitemap lists `/learn/<x>`. Same pattern for `/daily` → 308 `/daily/` with canonical `/daily`. Google is now indexing the `/learn-*` duplicates (GSC shows `/learn-xy-wing`, `/learn-core`, `/learn-forcing-chains`). This explains the `/learn` + `/daily` damage, not the site-wide cliff.

Sitemap: Valid, **371 URLs** (was 139), 367 indexed-count, 0 errors, last downloaded **10-29** — the pass-5 staleness is resolved. No resubmit needed.

**Umami 7d (10-23..10-30): 59 pv / 42 visitors / 48 visits / 5 bounces / 889s** vs prior 7d 90 / 58 / 69 / 8 / 6810 → pv −34%, visitors −28%. Top paths: / 34, /grade 7, /learn 3, /sudoku-16x16 2. Referrers 7d: duckduckgo 1 (prior: google 4, bing 1, ddg 1). **Since 08-04:** google 22, bing 14, **chatgpt.com 11**, ddg 5, yahoo 4, github 3, ecosia 3, uneed 2, **fmhy.net 1**, gemini 1, reddit 1. fmhy still a trickle — not the big source hoped for.

Events 7d: puzzle_started 92 (prior 201), first_visit_ever 30 (42), grade_used 23 (49), puzzle_completed 9 (2), tier_unmatched 2 (3); zero calculator_used / puzzle_shared. *Bounce count (5/48) is far below pass 5's 66% — likely the SPA counting differently post-migration; don't read it as an engagement jump.* grade_used 23 vs 7 /grade pv repeats the pass-5 power-user pattern.

**Gates:** M1 **FAIL (regressed)** — pages indexed but impressions collapsed. Per-date noindex → **HOLD** (don't act until the cliff is explained). /learn **HOLD** (fix the redirect loop first). Kakuro **GATED** (0 impressions).

**Recommended next:** (1) Rob: in the GSC UI check Manual actions, Security issues, and Pages → "Why pages aren't indexed" for anything dated ~08-16. (2) Fix the canonical loop: change `_redirects` targets to extensionless (`/learn/xy-wing /learn-xy-wing 200`) or make `/learn-*` the canonical everywhere; same decision for `/daily` vs `/daily/`. Verify with curl that `/learn/xy-wing` returns 200, then resubmit the sitemap. (3) Run passes weekly again. The 88-day gap is what let both problems go unnoticed.

## Pass 5 — 2026-08-03

**GSC 28d: 1539 impressions / 12 clicks / avg position 34.4** (vs pass 4: 1128 / 4 / 34.3 — impressions +36%, clicks 3×).

Weekly impressions flat (07-27..08-02 = 406 vs prior-7 391, ~58/day plateau), but clicks concentrated late: 8 of the 12 fell in the last 7 days (07-29 ×1, 07-30 ×1, 07-31 ×2, 08-01 ×4).

Clicks by page: **/classic 4 @12.6 (first ever)**, /grade 2 @12.3, /sudoku-16x16 2, / 1 @3.8, **/daily/killer/2026-06-26 1 @4 (first per-date-page click ever)**, /evil-sudoku 1, /jigsaw 1.

Top pages by impressions: /evil-sudoku **527** @50.4 (was 369@50.9 — impressions +43%, position still flat, so the 07-23 on-page pass did not move rank), /killer-sudoku-calculator 265 @32.5 (was 203@30.5, position slightly worse), /daily 243 @16.6, /sudoku-16x16 212 @22.4 (was 135@23.7 — best content page), /learn/xy-wing 83 @38.9, /learn/coloring 54 @34.0, /killer 51, /grade 39, /learn 37, /learn/swordfish 25. **/learn/forcing-chains: 0 impressions.**

Queries — evil still dominant ("sudoku evil" 225@53.1, "evil sudoku" 163@54.2, "evil sudoku extreme" 42@38.5); the on-page-targeted "how do you solve sudoku evil puzzles without guessing?" is **15@40.9, flat vs 14@40.5 — no lift**. 16x16 family growing ("giant sudoku" 37@31.2 was 18@27.9, hexadoku 36@9.2, "mega sudoku online" 5@53). Daily/archive strong ("what websites offer daily killer sudoku puzzles?" **18@54.2 — AI-phrased question query**, "daily sudoku killer" 16@8.3, "sudoku killer archives" 9@6.2). Calculator: "killer sudoku combinations" **28@55.1 — impressions up but position worse than 15@52.6, the lede tweak did not move it**. "sudoku grader" 14@10.4 (1 click). **Zero kakuro.**

**Indexation:** 7/7 older canaries "Submitted and indexed" (/sudoku-16x16 + /daily recrawled 08-03; calculator/grade/xy-wing/swordfish last crawled 07-07; evil 07-10). **/learn/forcing-chains and per-date 2026-07-29 (classic) / 2026-07-24 (killer) all "unknown to Google, never crawled."**

**Key finding: the sitemap was last downloaded 2026-07-07 — 27 days stale** (status Valid, 139 URLs, 0 errors, so no error state and no automatic resubmit). Nothing shipped after 07-07 has entered a sitemap Google has read. That single fact explains both `/learn/forcing-chains` and every post-07-07 per-date page being undiscovered.

→ **Rob resubmitted the sitemap 2026-08-03.** Next pass: check whether "last downloaded" moved off 07-07 and whether forcing-chains + post-07-07 per-date pages got crawled. **If last-downloaded is still 07-07 a week later, the problem is not submission** — verify `/sitemap.xml` returns 200 and valid XML to Googlebot's user agent, and that the dynamic route isn't erroring under crawl.

**Umami 7d: 105 pv / 46 visitors / 59 visits / 39 bounces / 2080s** vs prior-7d 29 / 26 / 27 / 25 / 1259 → pv +262%, visitors +77%, visits +119%, bounce rate 93%→66%, time +65%. Best engagement week on record, reversing pass 4's dip. Top paths: / (36), /daily (8), /grade (4), /learn (4), /jigsaw (3), /classic (2), per-date killer pages (4). Referrers: google 5, **chatgpt.com 2 (first AI-assistant referral — the GEO/AEO work paying off)**, bing 1, uneed.best 1, github 1 — **still no fmhy.net** (dark 2 weeks running).

Events: puzzle_started 94 (was 30), first_visit_ever 30 (16), **grade_used 21 (was 0)**, **puzzle_completed 12 (was 1)**; zero calculator_used / puzzle_shared / tier_unmatched. *Anomaly: 21 grade_used against only 4 /grade pageviews — consistent with one power user grading repeatedly rather than contamination (the data-domains guard is live). Watch whether it repeats.*

**Gates:** M1 **PASS**. /learn **HOLD** (forcing-chains unindexed at 12 days — blocked on sitemap staleness, not page quality). Kakuro **GATED**. Per-date noindex → **NO, emphatically**.

**Recommended next:** (1) resubmit sitemap + Request Indexing on `/learn/forcing-chains` — highest-leverage single action, unblocks 3 weeks of shipped URLs *(done 08-03)*; (2) accept that /evil-sudoku and the calculator are competition-bound, stop on-page work there, shift to off-page authority; (3) hold /learn/als + /kakuro-combinations on their gates.

## Pass 4 — 2026-07-27

**GSC 28d: 1128 impressions / 4 clicks / avg position 34.3** (vs pass 3: 809 / 3 / 35.4 — impressions +39%).

Weekly impressions re-accelerated: the mid-month settling (07-15..07-21 ~280/wk, ~35/day trough) reversed — 07-22..07-26 = 322 impressions in 5 days ≈64/day, and recent position improved (07-24..07-26 = 29.5 / 30.2 / 28.3, best of the month). Coincides with the 07-23 evil-sudoku on-page ship.

Clicks: "16 sudoku" 1 @26; page clicks /sudoku-16x16 (2), /evil-sudoku (1, first ever), /grade (1).

Top pages: /evil-sudoku **369** @50.9 (was 279@51 — position flat, on-page work only 5d old), /killer-sudoku-calculator 203 @30.5, /daily 173 @15.9, /sudoku-16x16 135 @23.7 (2 clicks, best-positioned content page), /learn/xy-wing 83 @38.9, /learn/coloring 44 @33.1, /killer 37, /grade 29 @12.3, /learn 28, /learn/swordfish 24.

Queries — evil dominant (~350 impressions, head position still weak ~54, but the targeted question "how do you solve sudoku evil puzzles without guessing?" now 14 @40.5). 16x16/hexadoku/giant (hexadoku 21@9.7, **"giant sudoku" 18@27.9 new**, "mega sudoku online" 5@53). Daily/archive strong position ("daily sudoku killer" 16@8.3, "sudoku killer archives" 8@6.1). Killer combos ("sudoku cage calculator" 7@8.4, "killer cage calculator" 6@10.3, "killer sudoku combinations" 15@52.6). "sudoku grader" 10@11.9. **Zero kakuro.**

**Indexation:** 7 of 8 content canaries indexed; /learn/forcing-chains "unknown to Google, never crawled" (shipped 07-22, 5 days old — normal lag at the time). Per-date: older pages index and rank well (classic 07-04 8@5.9; killer 06-04 / 06-12 / 06-24 / 07-04 / 07-06 all @3–9); recent ones normal ~1–2wk lag. Sitemap Valid, 139 URLs, 0 errors, **last downloaded 07-07 (20d stale — noted but not yet diagnosed as the blocker it turned out to be)**.

**Umami 7d: 30 pv / 27 visitors / 28 visits / 26 bounces / 1259s** vs prior-7d 59 / 33 / 42 / 30 / 3182 → traffic down WoW (pv −49%, visits −33%, visitors −18%, time −60%, bounce 93%). Tiny absolute numbers, high variance, and the uneed/fmhy launch bump fading; GSC impressions up contradicts a real decline, so this reads as referral cooldown noise. Referrers: bing 1, uneed.best 1 (was 7), google 1 — no fmhy, no github. Events: puzzle_started 32, first_visit_ever 17, puzzle_completed 2, calculator_used 1.

**Gates:** M1 PASS. /learn **HOLD** until forcing-chains indexes. Kakuro GATED. Per-date noindex → NO.

## Pass 3 — 2026-07-22

**GSC 28d: 809 impressions / 3 clicks / avg position 35.4** (vs pass 2: 477 / 2).

Weekly impressions settling from the launch spike: 07-15..07-21 ~280/wk vs 07-08..07-14 ~505/wk (peak day 07-10 = 109). Position flat ~35.

Top pages: /evil-sudoku 279, /killer-sudoku-calculator 159, /daily 118, /sudoku-16x16 71, /learn/xy-wing 67, /learn/coloring 26, /killer 26, /grade 23, /learn/swordfish 23, /learn 21.

Queries — evil/extreme now dominant (~230 impressions but weak position ~54). Hexadoku 10 @10.6 strong. Daily killer/archive strong position. Killer combos/calc. xy-wing ~40 @~42, swordfish ~15 @~55, coloring surfacing. **Zero kakuro.**

**Indexation:** all 8 content canaries indexed. Per-date: older pages index and rank; recent ones lag ~1–2wk. Sitemap Valid, 139 URLs, 0 errors.

**Umami 7d: 56 pv / 37 visitors / 41 visits / 30 bounces / 3994s** vs prior-7d 54 / 36 / 45 / 38 / 2344 → visitors flat, time on site +70%. **Referral breakthrough: uneed.best 7, fmhy.net 1** — both watched sources went live this week (uneed paid launch, fmhy out of the testing queue). Also nexplora-check.pages.dev 1, launchigniter.email 1. Events: puzzle_started 65, first_visit_ever 37, **puzzle_completed 3 (funnel non-empty for the first time)**, calculator_used 1.

**Gates:** M1 PASS. /learn gate OPEN and proven (xy-wing 67 impressions, all 3 indexed). Kakuro GATED. Per-date noindex → NO.

## Pass 2 — 2026-07-14

**GSC 28d: 477 impressions / 2 clicks (first clicks ever) / avg position 34.1** (vs pass 1: 26 / 0). Weekly impressions ~6/wk pre-07-07 → **~460/wk** (07-08..07-13 daily: 53 / 83 / 109 / 86 / 65 / 57). Decisive M1 breakout.

Top pages: /evil-sudoku 127, /daily 99, /killer-sudoku-calculator 97, /learn/xy-wing 45, /sudoku-16x16 27, /learn/swordfish 22, /grade 17, /learn/coloring 17.

Queries — evil/extreme biggest (~110 impressions, weak position ~55); daily killer/archive strong position; killer combos ~30; xy-wing ~40 @~42; swordfish ~15 @~55; coloring surfacing; "sudoku grader" 9 @12.4; hexadoku 5 @8.8. **Zero kakuro.**

**Indexation:** all 8 canaries indexed including new /learn/coloring. **Per-date canary flipped positive** — older per-date pages now indexed and ranking (classic 07-04 8 @5.9; several others @5–11). Recent ones still uncrawled (~1–2wk lag, normal).

**Umami 7d: 46 pv / 33 visitors / 39 visits** vs prior-7d 81 / 17 / 28 → visitors +94%, visits +39%, pv −43% (the pv drop is mostly pre-07-07 self-test junk leaving the window). 34/39 visits bounced. Referrers: google.com ×3 only. Events: puzzle_started 127, first_visit_ever 18; zero everything else — engagement funnel empty, high bounce, likely crawler-adjacent SEO traffic.

**Gates:** M1 PASS (breakout). /learn gate OPEN and proven (coloring indexed and surfacing in <1wk). Kakuro GATED. Per-date noindex → NO. Backfill extension now low-risk.

## Pass 1 — 2026-07-07

**GSC 28d: 26 impressions / 0 clicks / avg position 25.7**; trailing 14d ≈9 impressions (baseline was 8). Non-branded queries surfacing: "killer sudoku calculator" (3 impressions, position 74), "killer sudoku io" (1, position 72).

**Indexation win:** all 7 wave-one canaries "Submitted and indexed" (calculator, /sudoku-16x16, /daily, /grade, /evil-sudoku, /learn/xy-wing, /learn/swordfish) — /sudoku-16x16 flipped from "Discovered – currently not indexed" to indexed. Per-date daily pages not yet crawled (normal — the archive shipped the same day). Sitemap Valid, 139 URLs, 0 errors.

**Umami 7d: 81 pv / 17 visitors / 28 visits** (prior 7d = 0; Umami started ~07-05, so no real WoW yet, and the window still contains pre-fix self-test junk). Events: puzzle_started 26, first_visit_ever 15, grade_used 3, calculator_used 1. Referrers: bing / github / search.google 1 each — no fmhy, no uneed yet.

**Gates:** M1 indexation PASS → /learn technique-page gate OPEN. Kakuro GATED. Per-date noindex decision deferred.

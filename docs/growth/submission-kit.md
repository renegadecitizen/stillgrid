# Directory submission kit (one-off, $0, no ongoing engagement)

From the 2026-07-05 growth plan (adversarially verified research). Each entry: where, what it takes, exact copy to paste. Work through in order — items 1–3 start clocks. Track status in the table at the bottom.

## Standard copy (reuse everywhere, adjust length to fit)

**One-liner:** Stillgrid — free online sudoku, the quiet way. Classic, X-Sudoku, Jigsaw, and Killer at 6×6–16×16, with difficulty graded by the solving techniques each puzzle actually requires. No ads, no signup to play. Open source.

**Longer:** Stillgrid is a free, open-source sudoku site with a calm, distraction-free design. It plays classic sudoku plus X-Sudoku, Jigsaw, and Killer variants at 6×6 and 9×9 (16×16 for classic and X). Difficulty is honest — graded by the techniques a puzzle actually requires (singles → pairs → X-Wing → Swordfish → chains), not clue count. Daily challenge with streaks, works offline as a PWA, no ads, no account needed, all game state stays on your device.

**Facts for forms:** URL https://stillgrid.app · Repo https://github.com/renegadecitizen/stillgrid · License MIT · Pricing: free · Platform: web/PWA · Category: puzzle game.

## The list

1. **AlternativeTo** — register an account NOW (submissions need a 1-week-old account). Then: user icon → "Suggest new application". Use the longer copy. Mark Stillgrid as an alternative to existing sudoku entries; do NOT create a Sudoku.com page just to seed it (moderation risk). Value: durable citation LLMs read; minimal direct traffic.
2. **GitHub release** — done in-repo (LICENSE + v1.0 tag). Anchors the **awesome-selfhosted** 4-month clock → **submit PR ~early November 2026** to github.com/awesome-selfhosted/awesome-selfhosted-data (software/, Games section). HAND-WRITE that PR — LLM-generated contributions are bannable there. Strongest free backlink available when eligible.
3. **Uneed** — uneed.best/submit-a-tool, free queue (books out weeks; the earlier the better). Skip the paid boost. Value: DR-74 dofollow link.
4. **FMHY** (approved) — PR to github.com/fmhy/edit, gaming page → Puzzle Games section. Read their contributing guide first. Copy (factual, not promotional): `[Stillgrid](https://stillgrid.app) - Free multi-variant sudoku (classic / X / jigsaw / killer, 6×6–16×16), technique-graded difficulty, no ads, no signup, open source.` Value: plausibly the single largest traffic source in the plan (fmhy.net has millions of visits/mo); merge is discretionary.
5. **SaaSHub** — saashub.com/submit, free; submit + verify. Then cherry-pick ~15–30 game/web-app-relevant sites from its 107-item directory checklist over spare hours (most are B2B/AI — skip those). Value: ~DR-75 dofollow.
6. **512KB Club** — run the DebugBear Page Weight Scan on stillgrid.app first (measured ≈216.5KB uncompressed → Orange team). Submit a git patch editing `_data/sites.yml` at git.sr.ht/~bt/512kb-club, emailed to lists.sr.ht/~bt/512kb-club-devel (SourceHut workflow, no GitHub PRs). Value: quality backlink + "complete sudoku app in ~216KB" brand line.
7. ~~**pwa.directory**~~ — **DEAD, see status table.** The research assumed an email submission path; the domain has no MX records, so no address on the site can receive mail. Nothing submittable here.
8. **searchmysite.net** — searchmysite.net/admin/add/ (free Basic tier), domain proof via DNS (Cloudflare TXT record). Value: small-web index inclusion, perfect ethos match.
9. **Curlie** — curlie.org/en/Games/Puzzles/Brain_Teasers/Sudoku/ → prefer the Variants subcategory → "Suggest a site". May sit unreviewed forever; submit and forget.
10. **awesome-pwa** — PR to github.com/hemanth/awesome-pwa (Apps → Games and Entertainment). Merges land in sporadic batches (1–3+ months). Nofollow; modest referral.
11. **awesome-jsgames** — issue then PR to github.com/proyecto26/awesome-jsgames (Puzzle). Must link the repo and frame as open-source JS/React game. Merge latency months-to-never; only worth the 15 minutes.
12. **llmstxt.site + directory.llmstxt.cloud** — 5-minute copy-paste forms (llms.txt already ships). ~Zero expected traffic; bottom-priority freebie.
13. **OpenAlternative** — openalternative.co/submit; verify a FREE path still exists before spending time (live pricing showed only paid tiers). Do not pay.

**Dead / don't bother (verified):** leereilly/games (archived), Kagi Small Web (blogs only), nwinkler/awesome-sudoku-links (stale), Slant (bot-blocked), findpwa.com, appsco.pe, **pwa.directory** (no MX on the domain — every contact address bounces; confirmed 2026-07-27).

## Status (updated 2026-07-27)

| # | Directory | Status | Notes |
|---|---|---|---|
| 1 | AlternativeTo | ✅ submitted 2026-07-22 | suggested with the longer copy; primary alternative = Open Sudoku (+ picks among its alternatives, incl. Sudoku.best). Awaiting moderation — once live, claim the listing as developer and watch Umami for alternativeto.net referrers |
| 2 | awesome-selfhosted | calendared ~2026-11-05 | hand-write the PR (LLM PRs bannable); LICENSE + v1.0 ✅ done |
| 3 | Uneed | ✅ **launched 2026-07-19** (paid fast-track $14.99, bought 2026-07-05) | Live at uneed.best/tool/stillgrid, category Personal Life (Uneed only has 5 — this is the right bucket), tags Fun/Gaming/Open Source. **Outcome: #30 of 50+ for launch week, 10 votes / vote-value 35, 0 reviews, no rating.** `premium: false` — the fee bought the launch slot, not ongoing featured placement. Landed *exactly* on the free tier's 10-upvote survival threshold, so the paid tier was what guaranteed publication. Umami: uneed.best referrers 7 (week of 07-22) → 1 (07-27), bump fading. Declined the $249 100-directories blast and the $99/yr Pro upsell. **ROB — two listing edits open:** (a) attach the GitHub repo (field is empty despite the Open Source tag + MIT claim in the blurb), (b) replace the blurb — see paste-ready draft below. |
| 4 | FMHY | ⏳ in their testing queue | PR #5721 closed 2026-07-06 with "Sent to our Discord for testing, thanks!" — their normal triage (maintainers add sites that pass testing directly). Nothing to do; watch Umami referrers for fmhy.net. |
| 5 | SaaSHub | **ROB: needs account** | saashub.com/submit; then cherry-pick from their directory checklist |
| 6 | 512KB Club | **ROB: send one email** (patch ready at ~/Documents/stillgrid/0001-Add-stillgrid.app-202-KB-orange-team.patch; official DebugBear Page Weight 202 KB = Orange team, scan: debugbear.com/test/website-speed/5J2dAbSo/overview) | measured ~213 KB uncompressed before webfonts (188.7 KB main JS + 18.6 KB CSS + rest); run DebugBear Page Weight Scan for the official number, then email the sites.yml patch below to lists.sr.ht/~bt/512kb-club-devel |
| 7 | pwa.directory | ❌ **UNREACHABLE — abandoned 2026-07-27** | Rob's submission email bounced undeliverable. Cause verified: **`pwa.directory` publishes no MX records**, so every address on the site (`submit@`, `hello@`, `business@`, `privacy@`) is undeliverable — including the `mailto:` their own /submit button generates. Other channels also dead: GitHub org `pwa-directory` 404s, X `@pwa_directory` "account may be private, deleted". Site itself still serves (477+ PWAs listed) but there is no working way to reach anyone. **Do NOT pay the €49 Fast-Track** — that flow charges via Stripe and *then* tells you to "email us your submission details", i.e. you'd pay into the same dead inbox. Recheck only if MX appears (`dig +short MX pwa.directory`). |
| 8 | searchmysite | ✅ submitted | Basic tier (no domain proof needed — kit's DNS note was wrong); awaiting moderator review |
| 9 | Curlie | **ROB: form + captcha** | **CATEGORY CORRECTION:** Variants explicitly excludes sites that also cover classic — use the MAIN Sudoku category: curlie.org/public/suggest?t=games&cat=Games/Puzzles/Brain_Teasers/Sudoku — paste-ready copy below; form has reCAPTCHA so it must be you |
| 10 | awesome-pwa | ✅ PR filed | github.com/hemanth/awesome-pwa/pull/433 — batch merges, expect 1–3 months |
| 11 | awesome-jsgames | ✅ issue + PR filed | issues/19 + pull/20 — merge latency months |
| 12 | llmstxt.site | ✅ submitted | confirmation page received |
| 12b | directory.llmstxt.cloud | ✅ submitted | Tally form confirmed; notification to mccrazy0@gmail.com |
| 13 | OpenAlternative | **ROB: verify free path first** | live pricing showed paid-only; don't pay |

## Paste-ready drafts for Rob's items

**Uneed listing edit** (uneed.best/tool/stillgrid → edit product). Two changes:

1. **GitHub field** — set to `https://github.com/renegadecitizen/stillgrid`. It's currently empty even though the listing carries the Open Source tag and the blurb claims MIT; the repo is public MIT, so this just substantiates what's already claimed.
2. **Description** — the live blurb has a comma splice, calls the site a "platform", says "no ads", and claims 16×16 for all variants (prod: classic + X-Sudoku only; jigsaw/killer 400 at `size=16`). Replacement:

- Tagline (unchanged, still good): `Calm sudoku with variants, daily challenges`
- Rich description:
```html
<p>Stillgrid is sudoku, the quiet way — classic 9×9 plus the X-Sudoku, Jigsaw, and Killer variants, playable at 6×6 and 9×9, with classic and X-Sudoku also at 16×16.</p>
<p>Difficulty is graded by the solving technique each puzzle actually requires — singles, pairs, X-Wing, Swordfish, chains — rather than by clue count or a timer, so "harder" means a harder deduction, not just fewer givens. There's a daily challenge with streak tracking, and a set of technique pages that walks the same ladder the grader uses.</p>
<p>Free to play, with no signup needed to start a puzzle. Open source (MIT). Installs as an offline-capable PWA, and is built throughout for screen readers, keyboard play, and high contrast.</p>
```

Wording note: "free to play / no signup needed to start a puzzle" is the durable phrasing from roadmap item #12 — it stays true even if optional accounts land for the daily leaderboard. The site still answers the direct "Does Stillgrid show ads?" FAQ with a factual "no"; what #12 removed was the *forward-looking promise* from marketing copy, which is what a directory blurb is.

**Curlie** (main Sudoku category, form at the URL above):
- Site URL: `https://stillgrid.app`
- Title: `Stillgrid`
- Description (28 words, per their style rules): `Free browser sudoku with classic, diagonal, jigsaw, and killer variants at three grid sizes. Difficulty is graded by the solving techniques each puzzle requires. No account needed.`
- Email: yours. Then the reCAPTCHA + Submit.

**~~pwa.directory email~~ — NOT SENDABLE** (domain has no MX; see status row 7). Pitch kept only as reusable copy for the *next* PWA directory, with the two fixes it needs first: soften "Free, no ads, no signup" per roadmap #12, and qualify the size claim — 16×16 is classic + X-Sudoku only, so "6×6–16×16" over-claims for jigsaw/killer.
> Subject: PWA submission: Stillgrid
> URL: https://stillgrid.app — a calm, offline-capable sudoku PWA with four variants (classic, X, jigsaw, killer) at 6×6 and 9×9, plus classic and X-Sudoku at 16×16, and difficulty graded by the solving techniques each puzzle actually requires. Free to play, no signup needed to start a puzzle. Unlike the sudoku PWA you already list, Stillgrid focuses on variants, honest technique-graded difficulty, and a daily challenge.

**512KB Club email** (to lists.sr.ht/~bt/512kb-club-devel, after your DebugBear scan; attach as a git patch to `_data/sites.yml` in git.sr.ht/~bt/512kb-club or paste the entry):
```yaml
- domain: stillgrid.app
  size: <DebugBear uncompressed KB>
```
> Adding stillgrid.app — a complete multi-variant sudoku app. DebugBear Page Weight Scan: <link/screenshot>, uncompressed total <N> KB.

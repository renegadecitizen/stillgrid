# Stillgrid — Product Requirements Document

**Status:** Draft v1
**Owner:** Rob (solo operator)
**Last updated:** 2026-05-23

---

## 1. Vision

A modern, mobile-first sudoku site that respects the player — both the 65+ daily solver who's been bookmarking websudoku.com since 2007, and the harder-puzzle enthusiast who currently watches *Cracking the Cryptic* on YouTube because no playable site is good enough.

One engine, many variants, technique-graded difficulty, daily challenge with streaks, offline-installable, ad-supported, solo-run.

## 2. Why now

- **websudoku.com is structurally decaying.** Built on HTML framesets and form POSTs ca. 2004. 3.6M monthly visits, but 65+ demographic and 75% direct (bookmark) traffic. The base will attrit by 2030; no replacement is queued.
- **sudoku.com is app-pushy and login-gated.** Owned by Easybrain. A meaningful slice of solvers want a no-signup web experience.
- **The variants audience is real and unserved.** Cracking the Cryptic has 600K+ YouTube subscribers. No first-class *playable* variants site exists. Setters publish on Patreon-walled blogs.
- **The monetization math works.** Older + US + long session = Raptive RPM $20–$40. 1M sessions/mo realistic in 3 years = $200–500K/yr cashflow for one operator.

## 3. Goals (12-month)

| # | Goal | Metric |
|---|---|---|
| G1 | Launch a sudoku product that loads instantly, works offline, and feels modern | Lighthouse > 95, TTI < 1.5s on mid-tier mobile |
| G2 | Trustworthy difficulty rating that respects advanced solvers | Difficulty label = highest solver technique required (Tier 1–6) |
| G3 | Ship six variants from day one on a unified engine | Classic, Killer, Jigsaw, X-Sudoku, Mini 6×6, 16×16 |
| G4 | Capture programmatic long-tail SEO | 1,000+ indexable URLs (variant × difficulty × language) by month 6 |
| G5 | Build a daily-ritual habit | 30% of WAU come back ≥4 days/week by month 12 |
| G6 | Cross the Raptive admission bar | 100K monthly sessions by month 9; application submitted by month 10 |

## 4. Non-goals

- Real-money gambling, prize sudoku, casino tie-ins.
- Native iOS / Android apps in v1. (PWA covers it. Native is v2+.)
- User-generated content / community puzzle uploads in v1.
- Login walls. Optional account, never required to play.
- Newsletter signup popups, dark patterns, time-pressure paywalls.

## 5. Target users

### Primary: "The Daily Ritual" (45–75, US/UK/CA/DE)
Plays one or two puzzles every morning with coffee. Currently on websudoku.com or sudoku.com out of habit. Wants: clean grid, big text, undo, pencil marks, no signup, *very* predictable behavior. Pain: fumbly mobile pencil marks; ads that hijack scroll.

### Secondary: "The Variant Hunter" (25–55, global, English-fluent)
Watches Cracking the Cryptic. Knows what an X-Wing is, can name three Setter handles. Wants: hand-crafted constraint puzzles, accurate technique labels, advanced solver tools. Pain: nowhere to *play* the puzzles after watching the videos.

### Tertiary: "The Casual Mobile Solver" (18–35, global)
Opens a sudoku site once a week on the bus. Wants: works instantly, looks current, no friction. Pain: sudoku.com tries to install its app.

## 6. Product scope — v1 (launch)

### 6.1 Game engine

- 9×9 grid with constraint-based solver (handles all v1 variants).
- Six variants live at launch: **Classic, Killer, Jigsaw, X-Sudoku, Mini 6×6, 16×16**.
- Six difficulty tiers per variant, labeled by required solver technique (not by removed-cell count):
  - T1 Easy — naked/hidden singles only
  - T2 Medium — adds naked/hidden pairs, pointing pairs
  - T3 Hard — adds naked triples/quads, X-Wing, simple coloring
  - T4 Diabolical — adds Swordfish, XY-Wing, XYZ-Wing
  - T5 Nightmare — adds Jellyfish, finned X-Wing, forcing chains
  - T6 Setter's Choice — hand-crafted from a curated setter network

### 6.2 Player UI

- Real-time client-side state. No form submits.
- Keyboard, touch, and drag-to-select input.
- Auto-pencil-marks (toggleable) and manual pencil marks.
- Undo / redo (unlimited).
- Hint: surfaces the next move *with the technique name and explanation* ("Hidden single in row 3").
- Color highlight: rows/cols/box of current selection; same-number highlight.
- Configurable themes (light, sepia, dark, high-contrast).
- Large-text / dyslexia-friendly font option.

### 6.3 Daily challenge

- One classic + one killer per day. Same puzzle for all players globally.
- Streak counter (stored locally + optional cloud sync with optional account).
- Streak insurance: 2 free skip-tokens / month.
- Optional leaderboard (opt-in only). Default off.

### 6.4 Offline / PWA

- Installable PWA. Service worker caches engine + pre-fetched puzzle pool.
- 100 puzzles per variant cached locally for offline play.

### 6.5 Account (optional)

- Email + magic link. No password.
- Stores: streak, preferences, completed puzzles, optional leaderboard handle.
- Site fully usable without an account.

### 6.6 Print mode

- Generate a printable PDF: 4 puzzles per page, weekly pack.
- Free, no email gate (newspaper-feed audience will adore this).

### 6.7 Content

- 50 technique guides (one per solver technique) at launch.
- Per-variant rules + history + strategy page (6 pages × 6 languages = 36).
- Blog seeded with 5 link-magnet posts.

### 6.8 Localization

- 6 languages at launch: en, de, es, fr, it, pt. Hreflang correctly set.
- Localized templates for variant + difficulty pages.

### 6.9 SEO

- SSR React, all content present in initial HTML.
- Schema.org structured data: WebApplication, AggregateRating, BreadcrumbList, Organization, FAQPage, HowTo.
- One indexable URL per (variant × difficulty × language) = ~216 base pages, plus 50 technique pages × 6 languages = 300 content pages. ~500+ URLs at launch.
- Sitemap.xml generated nightly.

### 6.10 Monetization

- Display ads via Raptive — pending acceptance (100K sessions/mo threshold).
- Pre-Raptive (months 0–9): direct AdSense, kept minimal.
- No paid tier in v1. Considered for v2 (ad-free + extras).

## 7. Non-functional requirements

| Area | Requirement |
|---|---|
| Performance | Lighthouse > 95 on mobile; TTI < 1.5s on 4G + mid-tier Android |
| Generator | Pre-generated puzzle pool, never block request path |
| SEO | 100% SSR; no client-only routes for indexable content |
| Reliability | 99.9% uptime; degraded mode works without DB (static puzzles only) |
| Accessibility | WCAG AA; full keyboard play; screen-reader-friendly grid |
| Privacy | GDPR/CCPA compliant; consent banner; analytics deferred until consent |
| Cost | < $300/month infra at 100K sessions/mo |

## 8. Tech stack

- **Solver / generator:** Rust, compiled to WASM (client side) and a thin Node sidecar (server side).
- **Backend:** Node.js + Express. Postgres for puzzle pool + accounts.
- **Frontend:** React + Vite, SSR via a Node-rendered HTML shell. Tailwind for styling.
- **Hosting:** Heroku for app dynos + Postgres; Cloudflare for CDN + DNS.
- **Storage:** Cloudflare R2 for PDF/print artifacts.
- **Auth:** Magic-link email via Resend.
- **Analytics:** Plausible (privacy-first) + post-consent GA4.
- **Ads:** Raptive (once eligible); AdSense bridge before.
- **Consent:** Sourcepoint.

## 9. Brand

- **Working name:** Stillgrid.
- **Domain hunt** (Week 5): stillgrid.com, stillgrid.app, playstillgrid.com, sudokulab.com, beyondnine.com.
- **Voice:** first-person, calm, "the puzzle you come back to." Mirrors Holger's tone, but quieter.
- **Visual:** off-white background, generous whitespace, mono-ish numerals, single accent color. Anti-skeumorphic. Think Linear, not Candy Crush.

## 10. Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Generator difficulty rating feels off | High | Spend 3-4 weeks on it specifically; benchmark against HoDoKu and human solver feedback before launching |
| sudoku.com out-competes on mobile | Medium | Compete on no-signup + variants depth + setter network, not on raw sudoku |
| Raptive rejects application | Low | Run direct AdSense as fallback; reapply after 90 days |
| Cracking the Cryptic builds a competing site | Low | Reach out early about a partnership / setter network |
| AI Overviews eat "sudoku" SERPs | Medium-Low | Engagement-heavy content survives AI Overviews better than fact queries; double down on technique guides + community |
| Solo operator burnout | Medium | Detailed schedule with weekly checkpoints; cut scope hard if Week 16 ship date slips |

## 11. Success criteria

**Month 3 (private soft launch):** Core engine working with all 6 variants. 50 trusted testers. Daily-challenge streaks ticking. Lighthouse > 95.

**Month 6 (public launch):** ~500 indexable pages live. 10K monthly sessions. 5-language content. Print PDF live. First blog backlinks.

**Month 9:** 100K monthly sessions, Raptive applied.

**Month 12:** 250K monthly sessions, Raptive live, $5–10K monthly revenue.

**Month 24:** 1M monthly sessions, $20–40K monthly revenue, weighing v2 (native apps, paid tier).

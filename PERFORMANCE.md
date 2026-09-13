# Performance, SEO and accessibility

## Lighthouse, measured against production

**Measurement conditions, identical across both runs below:** Chrome DevTools
Lighthouse, **Navigation mode, Desktop**, against
`https://fxreplay-growth-challenge.vercel.app/`, with the `hero-interactive-replay` flag
**forced to `interactive_replay`** so the run measures the treatment arm — the heavier of
the two.

### Final

| Category | Score |
|---|---|
| Performance | **87** |
| Accessibility | **100** |
| Best practices | **100** |
| SEO | **100** |

| Metric | Before fixes | After fixes |
|---|---|---|
| Performance | 76 | **87** |
| First Contentful Paint | 0.6 s | **0.4 s** |
| Largest Contentful Paint | 0.7 s | 0.8 s |
| Total Blocking Time | 560 ms | **300 ms** |
| Cumulative Layout Shift | 0 | **0** |
| Speed Index | 1.3 s | **1.0 s** |

### What each fix contributed, and what cannot be attributed

**LCP request discovery — landed, and confirmed by its own disappearance.** Adding
`fetchPriority="high"` to the header wordmark put the attribute on the preload link
rather than only on the `<img>`. The item is **gone from the insights list**, which is
the direct evidence that it took effect — a stronger signal than any metric movement,
because it is the audit itself reporting the condition resolved.

**The rest of the movement is not attributable to that fix, and is not claimed as such.**
The only code change between the 76 run and the 87 run was those four lines. A single
`fetchpriority` attribute on one preload does not halve total blocking time, and LCP
actually moved the wrong way, from 0.7 s to 0.8 s. TBT falling 560 ms → 300 ms and Speed
Index 1.3 s → 1.0 s are therefore **run-to-run variance on a shared-tenancy host**, not
an optimisation this repository performed.

That variance is itself worth recording: an 11-point spread on a Lighthouse performance
score from an unchanged page is ordinary, and any single score quoted without repetition
carries roughly that much noise. Both numbers are real measurements of the same build,
which is the useful conclusion.

**Legacy JavaScript, est. 37 KiB — not attempted.** The saving is not ours to recover,
which was established by investigation rather than assumed:

- The project declares **no `browserslist`** anywhere, so Next builds against its default.
- Our shipped chunks contain **zero** legacy transpilation helpers — `_createClass`,
  `_classCallCheck`, `regeneratorRuntime`, `__awaiter` and `_asyncToGenerator` each
  appear in 0 chunks.
- **posthog-js ships a prebuilt bundle with its own browserslist**
  (`"> 0.5%, last 2 versions, Firefox ESR, not dead"`) and its own ES5 builds. A
  `browserslist` key here cannot recompile a third-party dist bundle.

The largest chunk shipped is **669 KB of posthog-js**, against 223 KB for the largest
application chunk. Narrowing the build target would change nothing about the flagged
bytes. The honest route to them is dropping posthog-js features we do not use —
`disable_surveys: true` alone removes 34 KB — which remains unattempted.

**Deliberately not attempted:** render-blocking requests, which is Next's own CSS
strategy, and cache lifetimes, worth 1 KiB. Both remain in the insights list and both are
correctly ignored.

### Earlier figures, withdrawn

Two numbers appeared in previous versions of this document and neither is measurable.

A run scoring **53** was taken on mobile emulation before the experiment's control arm
existed. A later run scoring **55** was presented as a before/after for a deferral
attempt, and that comparison was **invalid**: `"canvas"` appeared zero times in the
report, so it had measured the *control* arm while the 53 measured the treatment. The two
numbers described different pages.

Forcing the flag is what makes a figure quotable at all. With the flag at 50/50, a run
lands on whichever arm it happens to get and the score is unattributable — which is
exactly how the invalid comparison arose.

**The gap between 53 and 87 is overwhelmingly mobile emulation versus desktop, not
optimisation.** Four lines changed in this repository across that span. **The mobile score
has never been taken under controlled conditions and should be assumed materially worse
than 87.**

### Total blocking time is React hydration, not the canvas

The intuitive reading of blocking time on a page with an animating chart is that the
chart causes it. The evidence says otherwise, and it came from the run that was otherwise
useless.

On the **control arm — which has no animation loop at all** — total blocking time was
*higher*, at 3,110 ms against the treatment's 2,860 ms on the same mobile profile. The two
longest tasks, 963 ms and 671 ms, sat in a first-party application chunk. PostHog
contributed **2 ms** of blocking and 51 KB.

So the dominant cost is hydrating the page, not running the replay. That inverts the
optimisation priority: deferring the animation loop — the fix that looked most promising —
would have recovered the least, and the bundle is the thing to attack.

## Rendering strategy

| Route | Strategy |
|---|---|
| `/` | Prerendered static |
| `/signup` | Server-rendered on demand |
| `/api/users`, `/api/users/[id]` | Server-rendered on demand |

Server Components by default. Exactly three client components exist — the replay panel,
the signup form, and the analytics provider. Everything else, including all nine landing
section components, renders on the server and ships no JavaScript of its own.

The landing page is therefore static HTML with two islands hydrating into it. That is the
right shape for this page; the caveat is that Next ships a React runtime to support those
islands whether the page needs it everywhere or not, which is the argument for Astro made
in [ARCHITECTURE.md](ARCHITECTURE.md).

## Caching and CDN

Vercel's edge network serves the static route. The signup page and the API routes are
dynamic by necessity — the signup page reads a query parameter for `entry_point`, and the
API writes.

Fonts are self-hosted through `next/font` with `display: swap`, so there is no
render-blocking request to a third-party font host and no FOIT.

**What would change with a real market feed:** the candle series would be fetched
server-side and cached at the edge with a short TTL, rather than generated in the client
bundle. That moves data off the JavaScript payload and lets many visitors share one
upstream fetch.

## SEO

Lighthouse scores **100**. The page has a `<title>` and meta description written for the
product rather than inherited from the template, one `<h1>`, semantic landmarks,
`lang="en"`, and a viewport meta tag. All content is server-rendered, so a crawler sees
the full page without executing JavaScript.

Not present: `robots.txt`, `sitemap.xml`, Open Graph and Twitter card tags, and structured
data. For a single-page marketing site these are quick additions; they were cut for
budget and are listed here rather than claimed.

## Accessibility

Lighthouse scores **100**: of 73 accessibility audits, 32 passed, **0 failed**, and 31
were not applicable to this page. Lighthouse does not catch everything,
so the checks below were done directly against the rendered markup and the token values.

**Heading order.** Exactly one `<h1>`, three `<h2>`, three `<h3>`, no skipped levels —
verified by extracting the outline from the rendered HTML rather than by reading JSX.

**Landmarks.** `<header>`, `<main>`, four `<section>` elements each with an
`aria-labelledby` pointing at its heading, and `<footer>`. The social proof strip is
deliberately a plain `<div>`: it has no heading, and a fifth region would be noise for a
screen reader stepping through landmarks.

**Keyboard operability.** Every interactive element is a real `<button>` or `<a>`. Zero
clickable `<div>`s and zero `role="button"` in the rendered output. The replay's controls
— play, step, speed, buy, sell, close, replay — are all native buttons and the speed
selector is a native `<select>`, chosen over a custom menu specifically so it is operable
and announced without reimplementing either.

**Focus visibility.** A 2px focus ring is defined once in the base layer on
`:focus-visible`, with an offset and its own token. It is never suppressed anywhere in
the cascade.

**Contrast — computed, not eyeballed.** Every pairing calculated from token values:

| Pairing | Ratio | |
|---|---|---|
| `fg-primary` on canvas | 19.08:1 | AAA |
| `fg-secondary` on canvas | 9.51:1 | AAA |
| `fg-muted` on canvas | 5.82:1 | AA |
| `fg-muted` on `surface` | 5.58:1 | AA |
| `fg-muted` on `surface-raised` | 4.91:1 | AA |
| `text-on-accent` on `accent` (the CTA) | 4.75:1 | AA |
| `market-up` on `surface-raised` (Buy) | 5.10:1 | AA |
| `market-down` on `surface-raised` (Sell) | 4.65:1 | AA |
| `accent-bright` on `accent-subtle` (eyebrow) | 7.10:1 | AAA |
| `accent-soft` on canvas ("1M+") | 7.00:1 | AA |
| `fg-muted` over a grid line | 5.48:1 | AA |

Two results that changed the code rather than being reported after the fact:

- **`market-down` was 3.99:1** and failed AA. Lightened from `#d6454b` to `#db595f`,
  hue unchanged, giving 4.65:1.
- **`text-on-accent` on `accent-hover` is 3.63:1** and was never shipped. The CTA hover
  darkens to `accent-pressed` (6.29:1) instead of lightening, which is the opposite of
  the token naming's suggestion and the right call.

Electric Blue itself is 3.86:1 on `surface` and therefore can never carry text. That
constraint is why `accent-soft` and `accent-bright` exist.

**`prefers-reduced-motion`.** The replay does not autoplay under the reduce preference;
the visitor advances the chart with an explicit Step forward control, and the Play/Pause
toggle is removed entirely. This is watched with a `matchMedia` change listener rather
than sampled once, so flipping the system setting mid-session stops playback immediately.

The page's entrance and scroll-reveal animations are separately gated inside
`prefers-reduced-motion: no-preference`. That is deliberate belt and braces: the global
reduce block zeroes `animation-duration`, which does **not** stop a scroll-driven
animation, because a timeline paces it rather than a duration.

**`aria-live` for dynamic results.** Trade outcomes are announced through a
`aria-live="polite"` region, and so are signup failures. Both regions are present from
first render rather than created when the message appears, so a screen reader is already
watching them.

**Colour never carries meaning alone.** Every trade direction pairs colour with the word
LONG or SHORT *and* an arrow glyph. Every P&L figure carries an explicit `+` or `−`. The
replay's status pairs its dot with the word Playing, Paused or Ended. Red and green is
the worst available pair for deuteranopia, and a sign plus a label costs nothing.

All decorative SVG is `aria-hidden` — verified as **6 of 6** in the production
markup, alongside 1 `<h1>`, 3 `<h2>`, 3 `<h3>`, 4 `<section>` elements, and the
replay slot's single reserved `aspect-[16/10]` container.

## Production risks

Specific, ordered by how likely they are to matter.

**Ad blockers suppress client telemetry.** Not a risk but an observed fact: during this
build, 100% of client-side events were blocked while server-emitted events arrived
untouched. This audience runs blockers above average. The conversion numerator survives
because it is server-emitted; the denominator does not. **Treat client-side counts as a
floor.** Mitigation is a reverse proxy on a first-party path — documented in
[ANALYTICS.md](ANALYTICS.md), not implemented.

**The in-memory adapter does not survive multiple instances.** With Supabase configured
this is moot. Without it, a deployment across several serverless instances gives each its
own `Map`, so a user created on one is invisible to another and a cold start empties it.
Acceptable for a zero-config demo, not for anything real.

**No rate limiting on user creation.** `POST /api/users` is unauthenticated and
unthrottled. A trivial script can fill the users table. A real deployment needs a rate
limit keyed on IP at minimum, and probably a captcha or an email verification step.

**Seeded data instead of a real market feed.** Every visitor sees the same 120 EURUSD
candles. A returning visitor sees an identical session, which undermines the "replay real
market data" claim the page makes if anyone looks twice.

**Observability is limited to platform defaults.** A failed `trackServer` call writes to
the Vercel function log and nothing aggregates it. There is no error tracking, no alerting
and no uptime monitoring. The analytics layer has a development-time detector for total
telemetry loss, but nothing equivalent runs in production — which is the wrong way round,
given that the failure it catches was discovered in production.

**No tests.** Covered in [ARCHITECTURE.md](ARCHITECTURE.md), including the two contracts
that would be written first. The honest cost is that most defects in this build were found
by inspecting production data rather than by anything failing locally.

**Mobile performance is unmeasured under controlled conditions.** The quotable figure —
87 — is desktop. The only mobile runs predate the control arm or measured an unknown arm,
so the mobile score is genuinely unknown and should be assumed materially worse. Since the
heavier hero is exactly what the experiment is testing, performance should be measured per
arm on mobile before the result is trusted, rather than assumed neutral.

# Decisions

Every point where AI-generated output was corrected, rejected, or overridden, and every
non-obvious trade-off. Newest entries at the bottom. This is a deliverable, not a
scratchpad.

## 2026-09-12

- **`flag_resolved` added to the event context, because `variant: 'control'` was ambiguous.** Found by reading `src/lib/analytics/context.ts` rather than from a failing test — no test covered it, and none would have: `currentVariant` initialises to `'control'` and `onVariantResolved` falls back to that same default after its 2000ms timeout, so a flag that was blocked by an ad blocker, slow, or failed outright produced an event indistinguishable from a real control assignment, silently inflating the control arm and biasing the experiment toward "no effect". Fixed by adding a required `flag_resolved: z.boolean()` to `contextSchema`, set in `buildContext()` from the live resolution state, with the timeout path deliberately leaving `variantResolved` false; events carrying `flag_resolved: false` are to be excluded from experiment analysis rather than counted as control.
- **Analytics work committed to `feat/analytics-wiring` rather than onto `main`.** `main` is the default branch and has a remote tracking branch, so committing directly to it was avoided; nothing has been pushed, and folding the branch into `main` is a one-command fast-forward if the branch is unwanted.
- **`$pageleave` and `$feature_flag_called` declared as accepted PostHog system events rather than suppressed or left undocumented.** `$pageleave` is deliberately enabled through `capture_pageleave` and supplies time-on-page, a diagnostic that matters for a landing experience; `$feature_flag_called` cannot be disabled without losing feature flag functionality, which the experiment depends on. `autocapture` and `capture_pageview` remain off, so the funnel is not buried in click noise and `page_viewed` is not shadowed by `$pageview`. The list makes any other `$` event a defect to investigate rather than an open question for a reviewer.

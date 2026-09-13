/**
 * Boots analytics when the app mounts and emits the funnel-entry event.
 *
 * UTM parameters are read from `window.location.search` inside the effect rather than
 * through `useSearchParams`. The hook would force this subtree to render dynamically
 * and require a Suspense boundary; the effect only ever runs in the browser, where
 * `window` is available, so it gets the same data with none of that.
 */

'use client';

import { useEffect, useRef } from 'react';

import { initAnalytics, trackWhenVariantReady } from '@/lib/analytics/client';

/**
 * Booted at module scope, not from the effect below.
 *
 * React runs child effects before parent effects, so everything under this provider
 * mounted — and ran its effects — before the provider's own effect could call
 * `initAnalytics`. For events that was survivable, because the pre-init queue holds
 * them and replays them. For the experiment arm it was not: `HeroPanel` starts its
 * `onVariantResolved()` wait from its own mount effect, which means the 2000ms budget
 * began before PostHog had been initialised and before the flag request had been sent.
 * On a cold load the timer regularly won, the hero fell back to control, and the
 * visitor saw the static panel until they reloaded. Nothing surfaced it, because
 * falling back to control is the designed behaviour of a flag that did not resolve.
 *
 * Module scope runs during import evaluation, before any component mounts, so the flag
 * request is in flight while React is still rendering. `initAnalytics` is idempotent on
 * its own `initialized` flag and returns immediately during SSR, so calling it here is
 * safe in both environments.
 */
initAnalytics();

function readUtm(params: URLSearchParams, key: string): string | null {
  return params.get(key) ?? null;
}

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  /**
   * Guards the funnel-entry event against React strict mode.
   *
   * In development the App Router runs effects twice — mount, cleanup, mount — on the
   * same component instance. `initAnalytics` survives that on its own `initialized`
   * flag, but `page_viewed` had no such guard and fired twice, which doubles the
   * denominator and halves every conversion rate measured against a dev build.
   *
   * A ref rather than a module flag: refs persist across strict mode's simulated
   * remount, so this fires exactly once there, and it is still scoped to the
   * component, so a genuine remount on a future route change would fire again — which
   * is the behaviour a real navigation should have.
   */
  const enteredRef = useRef(false);

  useEffect(() => {
    if (enteredRef.current) return;
    enteredRef.current = true;

    const params = new URLSearchParams(window.location.search);

    // Funnel entry. It waits for the feature flag so the visit is attributed to the
    // right experiment arm; an entry counted against the wrong arm corrupts the
    // denominator of the primary metric and nothing downstream reveals it.
    void trackWhenVariantReady('page_viewed', {
      path: window.location.pathname,
      referrer: document.referrer || null,
      utm_source: readUtm(params, 'utm_source'),
      utm_medium: readUtm(params, 'utm_medium'),
      utm_campaign: readUtm(params, 'utm_campaign'),
    });
    // Runs once per mount, now guarded above. This is a single-page landing
    // experience, so there is no route change to re-fire on; if routes are added
    // later this needs a pathname dependency as well.
  }, []);

  return <>{children}</>;
}

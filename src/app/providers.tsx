/**
 * Boots analytics when the app mounts and emits the funnel-entry event.
 *
 * UTM parameters are read from `window.location.search` inside the effect rather than
 * through `useSearchParams`. The hook would force this subtree to render dynamically
 * and require a Suspense boundary; the effect only ever runs in the browser, where
 * `window` is available, so it gets the same data with none of that.
 */

'use client';

import { useEffect } from 'react';

import { initAnalytics, trackWhenVariantReady } from '@/lib/analytics/client';

function readUtm(params: URLSearchParams, key: string): string | null {
  return params.get(key) ?? null;
}

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initAnalytics();

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
    // Runs once per mount. This is a single-page landing experience, so there is no
    // route change to re-fire on. If routes are added later, this needs a pathname
    // dependency and a guard against double-firing in React strict mode.
  }, []);

  return <>{children}</>;
}

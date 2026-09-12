/**
 * Browser analytics.
 *
 * The only way to emit an event from the client. There is no exported escape hatch
 * that takes an arbitrary string, which is what makes invariant 1 in CLAUDE.md
 * enforceable rather than aspirational.
 *
 * Two PostHog defaults are turned off on purpose:
 *
 *   autocapture       fires an event for every click, producing hundreds of generic
 *                     events nobody declared. The funnel we present would be buried in
 *                     noise we do not control.
 *   capture_pageview  fires PostHog's own $pageview. We emit `page_viewed` instead,
 *                     with the properties the tracking plan declares.
 *
 * The rule both defaults violate: we measure what we decided to measure.
 */

'use client';

import posthog from 'posthog-js';

import {
  EXPERIMENT_FLAG,
  buildContext,
  onVariantResolved,
  setVariant,
} from './context';
import {
  TrackingPlanViolation,
  validateEvent,
  type EventName,
  type EventProperties,
} from './tracking-plan';

let initialized = false;

export function initAnalytics(): void {
  if (initialized || typeof window === 'undefined') return;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

  if (!key || !host) {
    // Loud in development, silent in production. A missing key should stop us during
    // implementation, not take down a landing page at 2am.
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        '[analytics] NEXT_PUBLIC_POSTHOG_KEY or NEXT_PUBLIC_POSTHOG_HOST is not set. ' +
          'Events will not be sent.',
      );
    }
    return;
  }

  posthog.init(key, {
    api_host: host,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: true,
    person_profiles: 'identified_only',
  });

  // Flags arrive a moment after boot. When they land, resolve the experiment arm so
  // that funnel-entry events are attributed to the right variant.
  posthog.onFeatureFlags(() => {
    const value = posthog.getFeatureFlag(EXPERIMENT_FLAG);
    setVariant(value === 'interactive_replay' ? 'interactive_replay' : 'control');
  });

  initialized = true;
}

/**
 * Emits an event.
 *
 * The event name is constrained to the tracking plan by the type system, and the
 * properties are validated against that event's schema at runtime. A typo fails to
 * compile; a malformed payload fails before it leaves the browser.
 *
 * Returns the event id so a caller can send the same id to the server when both sides
 * emit the same logical event.
 */
export function track<E extends EventName>(
  event: E,
  properties: EventProperties<E>,
): string | null {
  const context = buildContext();

  try {
    const validated = validateEvent(event, properties, context, 'client');

    posthog.capture(event, {
      ...validated.properties,
      ...validated.context,
    });

    return context.event_id;
  } catch (error) {
    if (error instanceof TrackingPlanViolation) {
      // In development this is a bug and should be impossible to ignore. In production
      // we drop the event: bad analytics is a defect, a broken page is an outage.
      if (process.env.NODE_ENV === 'development') throw error;
      console.error(error.message);
      return null;
    }
    throw error;
  }
}

/**
 * Emits an event only once the experiment arm is known.
 *
 * Use for funnel-entry events. A `page_viewed` recorded against the wrong variant
 * silently corrupts the denominator of the primary conversion metric, and nothing
 * downstream will tell you it happened.
 */
export async function trackWhenVariantReady<E extends EventName>(
  event: E,
  properties: EventProperties<E>,
): Promise<string | null> {
  await onVariantResolved();
  return track(event, properties);
}

/**
 * Links the anonymous visitor to the account that was just created.
 *
 * This is the step that makes the funnel work. Everything before signup is attributed
 * to a random `distinct_id` in a cookie. Without this call, PostHog sees an anonymous
 * visitor who played the replay and a separate identified user who appeared from
 * nowhere, and the funnel never closes.
 */
export function identifyUser(userId: string, email?: string): void {
  if (!initialized) return;
  posthog.identify(userId, email ? { email } : undefined);
}

/**
 * The current visitor's `distinct_id`.
 *
 * The server has no access to the browser cookie, so it cannot know who it is emitting
 * for. The signup request carries this value in its body, and the server uses it when
 * emitting `account_created`, keeping both sides on the same person.
 */
export function getDistinctId(): string | null {
  if (!initialized) return null;
  return posthog.get_distinct_id();
}

/** Read-only access to the resolved arm, for components that branch on it. */
export { getVariant } from './context';

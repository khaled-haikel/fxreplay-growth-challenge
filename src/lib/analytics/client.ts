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
  isFlagResolved,
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

/* -------------------------------------------------------------------------- */
/* Pre-init queue                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Events emitted before PostHog finished initialising.
 *
 * React runs child effects before parent effects. `AnalyticsProvider` wraps the tree,
 * so every component below it mounts first — and `ReplayPanel` calls `play("autoplay")`
 * from its own mount effect, which reaches `track('replay_started')` before
 * `initAnalytics()` has run. Production data showed the consequence: `replay_started`
 * was absent from every first page load while `trade_opened` five seconds later came
 * through fine, and the event appeared normally on a client-side navigation back,
 * where the module was already initialised.
 *
 * Returning early when uninitialised would not fix that. Losing step two of the funnel
 * silently is the defect; a guard that drops the event is the same defect with a
 * cleaner conscience. So events are held and replayed in order once init completes.
 */
interface QueuedEvent {
  event: string;
  payload: Record<string, unknown>;
}

/**
 * Capacity bound. Twenty-five is far more than the handful of events a mount burst can
 * produce, and reaching it means init is never coming — at which point the session is
 * lost regardless. New events are dropped rather than old ones, because the earliest
 * events are the funnel steps that matter and a partial head is worth more than a
 * partial tail.
 */
const MAX_QUEUED_EVENTS = 25;

/**
 * Time bound, so the queue cannot hold anything indefinitely. `initAnalytics` runs from
 * a mount effect; if ten seconds have passed it is not going to run at all, and holding
 * the events past that point only pretends they might still be delivered.
 */
const QUEUE_TTL_MS = 10_000;

let pendingEvents: QueuedEvent[] = [];
let droppedForCapacity = 0;
let droppedForTimeout = 0;
let queueExpiry: ReturnType<typeof setTimeout> | null = null;

function enqueue(event: string, payload: Record<string, unknown>): void {
  if (pendingEvents.length >= MAX_QUEUED_EVENTS) {
    droppedForCapacity += 1;
    return;
  }

  pendingEvents.push({ event, payload });

  if (queueExpiry === null) {
    queueExpiry = setTimeout(() => {
      droppedForTimeout += pendingEvents.length;
      pendingEvents = [];
      queueExpiry = null;
      if (process.env.NODE_ENV === 'development' && droppedForTimeout > 0) {
        console.error(
          `[analytics] ${droppedForTimeout} event(s) were queued before init and ` +
            `discarded after ${QUEUE_TTL_MS}ms because initAnalytics() never ran.`,
        );
      }
    }, QUEUE_TTL_MS);
  }
}

/**
 * Replays the queue in the order it was captured.
 *
 * The payloads were validated at emit time, not here: a malformed event has already
 * failed at the call site that wrote it, which is where the stack trace is useful.
 * This function only delivers.
 */
function flushPendingEvents(): void {
  if (queueExpiry !== null) {
    clearTimeout(queueExpiry);
    queueExpiry = null;
  }

  if (pendingEvents.length === 0) return;

  const queued = pendingEvents;
  pendingEvents = [];

  for (const item of queued) {
    posthog.capture(item.event, item.payload);
  }

  if (process.env.NODE_ENV === 'development') {
    console.info(
      `[analytics] flushed ${queued.length} event(s) queued before init:`,
      queued.map((item) => item.event).join(', '),
    );
  }
}

/**
 * How long to wait before deciding the transport is dead.
 *
 * Long enough for a flags round trip on a slow connection, short enough that a
 * developer is still looking at the page when the warning appears.
 */
const TRANSPORT_CHECK_MS = 3500;

/**
 * Development-only check that events are actually leaving the browser.
 *
 * The defect this exists for: an ad blocker suppressed 100% of client-side telemetry
 * — every declared event plus PostHog's own `$pageleave` and `$feature_flag_called` —
 * and nothing anywhere said so. The page rendered, the console was clean, the build
 * passed, and the funnel silently lost its denominator. It was found by opening
 * PostHog hours later and noticing the project held exactly one event type.
 *
 * No synthetic event is sent to test this. `posthog.init` already requests feature
 * flags unconditionally, so a fired `onFeatureFlags` callback is proof of a completed
 * round trip to PostHog — the signal was already being received here and thrown away.
 *
 * An important limitation, because it changes what the two branches below mean:
 * `eventCaptured` fires when posthog QUEUES an event locally. It proves our code
 * reached `posthog.capture()`; it does NOT prove the event was delivered. Only the
 * flags round trip proves delivery, which is why it carries the diagnosis and the
 * capture count is only used to tell "nothing was wired up" from "nothing got out".
 */
function armTransportCheck(): void {
  if (process.env.NODE_ENV !== 'development') return;

  let capturedCount = 0;
  const unsubscribe = posthog.on('eventCaptured', () => {
    capturedCount += 1;
  });

  window.setTimeout(() => {
    unsubscribe();

    if (!posthog.__loaded) {
      console.error(
        '[analytics] posthog.init() never completed. No client events are being ' +
          'sent. Check NEXT_PUBLIC_POSTHOG_KEY and NEXT_PUBLIC_POSTHOG_HOST.',
      );
      return;
    }

    if (!isFlagResolved()) {
      console.error(
        [
          `[analytics] No response from PostHog in ${TRANSPORT_CHECK_MS}ms.`,
          'The feature flag request never came back, which means nothing is reaching',
          'PostHog and NO client-side event will arrive: page_viewed, the replay',
          'events and signup_started are all being dropped.',
          '',
          'Most likely an ad blocker or browser tracking protection.',
          'Confirm in DevTools > Network, filtered on "posthog".',
          'Server-side events (account_created) are unaffected.',
          'Production mitigation: reverse-proxy PostHog through a first-party path.',
        ].join(' '),
      );
      return;
    }

    if (capturedCount === 0) {
      console.warn(
        '[analytics] PostHog is reachable but no event has been captured. The ' +
          'transport is healthy and nothing is calling track().',
      );
    }

    // The queue should be empty by now: init has run and flushed it. If it is not,
    // something is emitting into a queue that will never drain.
    if (pendingEvents.length > 0) {
      console.error(
        `[analytics] ${pendingEvents.length} event(s) are still queued after init. ` +
          'They were emitted before initAnalytics() completed and have not been ' +
          'flushed, so they will not reach PostHog.',
      );
    }

    if (droppedForCapacity > 0) {
      console.error(
        `[analytics] ${droppedForCapacity} event(s) were dropped before init: the ` +
          `pre-init queue is capped at ${MAX_QUEUED_EVENTS}.`,
      );
    }

    if (droppedForTimeout > 0) {
      console.error(
        `[analytics] ${droppedForTimeout} event(s) were discarded because init did ` +
          'not complete within the queue lifetime.',
      );
    }
  }, TRANSPORT_CHECK_MS);
}

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

  // Anything that fired from a child effect before this point is delivered now, in
  // the order it was emitted.
  flushPendingEvents();

  armTransportCheck();
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

    const payload = { ...validated.properties, ...validated.context };

    // Validation has already happened above, at the point the event was written.
    // All that is left is delivery, and delivery can wait for init; correctness
    // cannot.
    if (initialized) {
      posthog.capture(event, payload);
    } else {
      enqueue(event, payload);
    }

    // The ambiguity this removes: when nothing shows up in PostHog, is it because
    // our code never called capture, or because capture was called and nothing got
    // out? One line in the console separates those permanently.
    if (process.env.NODE_ENV === 'development') {
      console.info(`[analytics] ${initialized ? 'sent' : 'queued'} ${event}`, payload);
    }

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
export function identifyUser(
  userId: string,
  properties?: { email?: string; name?: string },
): void {
  if (!initialized) return;

  // Only send keys that actually have a value. `identify` treats the properties
  // object as `$set`, and writing `name: undefined` onto a person is a different
  // thing from not writing it at all.
  const set = Object.fromEntries(
    Object.entries(properties ?? {}).filter(([, value]) => Boolean(value)),
  );

  posthog.identify(userId, Object.keys(set).length > 0 ? set : undefined);

  if (process.env.NODE_ENV === 'development') {
    console.info('[analytics] identified', userId, set);
  }
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

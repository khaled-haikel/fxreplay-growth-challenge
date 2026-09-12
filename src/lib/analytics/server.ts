/**
 * Server-side analytics.
 *
 * Used by conversion events only. `account_created` is emitted from here, after the
 * user row is committed, per invariant 2 in CLAUDE.md: what we count is an account that
 * exists, not a form that was submitted.
 *
 * Two things make the server different from the browser, and both are easy to get
 * wrong:
 *
 * 1. There is no cookie, so there is no `distinct_id`. The caller must pass the one
 *    the browser is using. If the server invents its own, PostHog sees two different
 *    people and the funnel silently never closes.
 *
 * 2. A serverless function is killed the moment it returns a response. The Node SDK
 *    batches events and flushes them later, and "later" never arrives. Events vanish
 *    with no error anywhere. So we flush immediately and await it before returning.
 */

import { PostHog } from 'posthog-node';

import {
  TrackingPlanViolation,
  validateEvent,
  type EventContext,
  type EventName,
  type EventProperties,
} from './tracking-plan';

/**
 * A fresh client per emission.
 *
 * A module-level singleton is the usual pattern, but it does not survive `shutdown()`,
 * and on serverless we have to shut down to guarantee delivery. Creating a client is
 * cheap; losing a conversion event is not.
 */
function createClient(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

  if (!key || !host) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[analytics/server] PostHog env vars are not set. Events dropped.');
    }
    return null;
  }

  return new PostHog(key, {
    host,
    // Send on the first event rather than waiting for a batch that will never fill.
    flushAt: 1,
    flushInterval: 0,
  });
}

interface TrackServerArgs<E extends EventName> {
  event: E;
  properties: EventProperties<E>;
  /**
   * Context the browser resolved and sent along with the request. The server cannot
   * derive `variant`, `session_id`, or `device_type` on its own.
   */
  context: EventContext;
  /** The visitor's `distinct_id`, taken from the request body. */
  distinctId: string;
}

/**
 * Emits a server-side event and waits for delivery.
 *
 * Never throws at the call site. An analytics failure must not turn a successful
 * signup into a 500: the account exists either way, and losing the event is the
 * smaller loss. Failures are logged so they surface in observability.
 */
export async function trackServer<E extends EventName>({
  event,
  properties,
  context,
  distinctId,
}: TrackServerArgs<E>): Promise<void> {
  let client: PostHog | null = null;

  try {
    const validated = validateEvent(event, properties, context, 'server');

    client = createClient();
    if (!client) return;

    client.capture({
      distinctId,
      event,
      properties: {
        ...validated.properties,
        ...validated.context,
      },
    });

    // The await is the whole point. Without it the process may exit first.
    await client.shutdown();
  } catch (error) {
    if (error instanceof TrackingPlanViolation) {
      if (process.env.NODE_ENV === 'development') throw error;
      console.error(error.message);
      return;
    }

    console.error('[analytics/server] failed to emit event', { event, error });

    if (client) {
      await client.shutdown().catch(() => undefined);
    }
  }
}

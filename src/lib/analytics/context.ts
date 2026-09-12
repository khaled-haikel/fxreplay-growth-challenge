/**
 * Shared event context.
 *
 * Every event carries these five fields. They live here rather than being passed at
 * each call site, because a field that has to be remembered is a field that will be
 * forgotten in exactly one place and discovered three weeks later.
 *
 * Browser-only: it reads viewport size and session storage.
 */

import type { EventContext } from './tracking-plan';

/** Feature flag that drives the experiment. Also referenced in server.ts. */
export const EXPERIMENT_FLAG = 'hero-interactive-replay';

type Variant = EventContext['variant'];

/**
 * The resolved experiment arm.
 *
 * Feature flags arrive asynchronously, a moment after PostHog boots. Until they do,
 * this holds the control default. Anything that must be attributed correctly should
 * wait for `onVariantResolved` rather than reading this immediately on mount.
 */
let currentVariant: Variant = 'control';
let variantResolved = false;
const variantWaiters: Array<() => void> = [];

export function setVariant(variant: Variant): void {
  currentVariant = variant;
  if (!variantResolved) {
    variantResolved = true;
    variantWaiters.forEach((resolve) => resolve());
    variantWaiters.length = 0;
  }
}

export function getVariant(): Variant {
  return currentVariant;
}

/**
 * Resolves once the experiment arm is known.
 *
 * Used by funnel-entry events, which are worthless if attributed to the wrong arm.
 * The timeout exists because a blocked or slow flag request must not mean no analytics
 * at all: after it, we proceed on the control default and accept the known bias.
 *
 * The timeout path deliberately does NOT set `variantResolved`. Only `setVariant`,
 * called when the flag actually lands, may do that. This is what lets `buildContext`
 * mark the event `flag_resolved: false` and keeps a timed-out lookup out of the
 * experiment instead of quietly padding the control arm.
 */
export function onVariantResolved(timeoutMs = 2000): Promise<Variant> {
  if (variantResolved) return Promise.resolve(currentVariant);

  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(currentVariant), timeoutMs);
    variantWaiters.push(() => {
      clearTimeout(timer);
      resolve(currentVariant);
    });
  });
}

/** Whether the experiment arm came from a resolved flag rather than the fallback. */
export function isFlagResolved(): boolean {
  return variantResolved;
}

/* -------------------------------------------------------------------------- */

const SESSION_KEY = 'fxr_session_id';

/**
 * A session id that survives navigation but not a new tab or a new visit.
 *
 * PostHog maintains its own session concept. We keep ours so that the funnel does not
 * depend on vendor-specific semantics, and so the same id can be sent to the server
 * alongside the signup request.
 */
function getSessionId(): string {
  if (typeof window === 'undefined') return 'ssr';

  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;

    const fresh = crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_KEY, fresh);
    return fresh;
  } catch {
    // Private browsing and some embedded webviews throw on storage access. An
    // ephemeral id is better than a thrown error inside an analytics call.
    return crypto.randomUUID();
  }
}

function getDeviceType(): EventContext['device_type'] {
  if (typeof window === 'undefined') return 'desktop';
  const width = window.innerWidth;
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

/**
 * Builds the context attached to a single event.
 *
 * `event_id` is fresh per event. It is the deduplication key: when the same logical
 * event can be emitted from both the browser and the server, both sides send the same
 * id and the destination counts it once.
 *
 * `flag_resolved` is read from the live resolution state rather than passed in, so an
 * event emitted before the flag lands is marked honestly without the call site having
 * to remember to do it.
 */
export function buildContext(eventId: string = crypto.randomUUID()): EventContext {
  return {
    variant: currentVariant,
    flag_resolved: variantResolved,
    event_id: eventId,
    session_id: getSessionId(),
    device_type: getDeviceType(),
  };
}

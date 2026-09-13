/**
 * Tracking plan: the single source of truth for analytics.
 *
 * Everything downstream derives from this file:
 *   - TypeScript types for every event payload
 *   - Runtime validation at the emit boundary
 *   - The funnel definition used in PostHog
 *   - The generated analytics documentation
 *   - The contract the MCP server exposes to agents
 *
 * Rules enforced here rather than by discipline:
 *   - An event that is not declared here cannot be emitted. There is no string-literal
 *     escape hatch in `track()`.
 *   - Property schemas are strict. An undeclared property is a validation error, not
 *     something that quietly lands in the warehouse.
 *   - Each event declares where it may be emitted from. Conversion events are
 *     server-only, so they do not depend on a browser that may close the tab, lose
 *     connectivity, or run an ad blocker.
 *
 * Naming: snake_case, past-tense verb. The event describes something that happened,
 * not something the code is about to do.
 */
import { z } from 'zod';
/* -------------------------------------------------------------------------- */
/* Shared context                                                             */
/* -------------------------------------------------------------------------- */
/**
 * Attached to every event. `variant` is here rather than on individual events so
 * that any event can be sliced by experiment arm without re-instrumenting.
 */
export const contextSchema = z
    .object({
    /** Experiment arm, resolved from the PostHog feature flag. */
    variant: z.enum(['control', 'interactive_replay']),
    /**
     * Whether `variant` reflects a flag that actually resolved.
     *
     * `false` means the flag never arrived — blocked by an ad blocker, slow, or the
     * request failed — and `variant` fell back to the control default. Without this
     * field the two cases are indistinguishable: a real control assignment and a
     * failed flag lookup both read as `variant: 'control'`, so every failure silently
     * inflates the control arm and biases the experiment toward no effect.
     *
     * Events with `flag_resolved: false` must be EXCLUDED from experiment analysis,
     * not counted as control. They remain valid for non-experiment reporting, where
     * the arm does not matter.
     */
    flag_resolved: z.boolean(),
    /** Deduplication key, shared when the same event can originate on both sides. */
    event_id: z.string().uuid(),
    session_id: z.string().min(1),
    device_type: z.enum(['mobile', 'tablet', 'desktop']),
})
    .strict();
function defineEvent(def) {
    return def;
}
/* -------------------------------------------------------------------------- */
/* Events                                                                     */
/* -------------------------------------------------------------------------- */
export const trackingPlan = {
    /* ---- Funnel entry ---- */
    page_viewed: defineEvent({
        description: 'Funnel entry. A visitor loads the landing page.',
        trigger: 'Landing page mount.',
        emittedFrom: 'client',
        properties: z
            .object({
            path: z.string(),
            referrer: z.string().nullable(),
            utm_source: z.string().nullable(),
            utm_medium: z.string().nullable(),
            utm_campaign: z.string().nullable(),
        })
            .strict(),
    }),
    /* ---- Engagement ---- */
    replay_started: defineEvent({
        description: 'Visitor starts the interactive replay. First signal of intent beyond scrolling.',
        trigger: 'Play control activated, or autoplay begins when motion is allowed.',
        emittedFrom: 'client',
        properties: z
            .object({
            symbol: z.string(),
            /** Distinguishes deliberate starts from autoplay. They convert differently. */
            initiated_by: z.enum(['user', 'autoplay']),
            /** True when prefers-reduced-motion is set, so autoplay was suppressed. */
            reduced_motion: z.boolean(),
        })
            .strict(),
    }),
    trade_opened: defineEvent({
        description: 'Visitor takes a position inside the replay.',
        trigger: 'Buy or sell control activated.',
        emittedFrom: 'client',
        properties: z
            .object({
            direction: z.enum(['long', 'short']),
            candle_index: z.number().int().nonnegative(),
            /** Time from replay start to this trade. Proxy for how quickly value lands. */
            time_since_replay_start_ms: z.number().int().nonnegative(),
        })
            .strict(),
    }),
    /**
     * ACTIVATION. The moment the visitor has experienced the product rather than read
     * about it. Without this step the funnel has only entry and conversion, and a
     * drop-off tells you nothing about where it happened.
     */
    trade_closed: defineEvent({
        description: 'Visitor closes a position and sees the result. Activation event: the point at ' +
            'which the product has been experienced rather than described.',
        trigger: 'Close control activated, or the replay reaches the end of data with an open position.',
        emittedFrom: 'client',
        properties: z
            .object({
            direction: z.enum(['long', 'short']),
            outcome: z.enum(['win', 'loss', 'breakeven']),
            /** Result in R multiples. Traders read R, not currency, in a simulator. */
            pnl_r: z.number(),
            hold_candles: z.number().int().positive(),
            /** 1 for the first trade of the session, 2 for the second, and so on. */
            trade_number: z.number().int().positive(),
        })
            .strict(),
    }),
    replay_completed: defineEvent({
        description: 'Replay reached the end of its data without the visitor ever opening a trade. ' +
            'Diagnostic: separates "did not engage" from "engaged but did not act".',
        trigger: 'Final candle rendered with zero trades opened during the session.',
        emittedFrom: 'client',
        properties: z
            .object({
            symbol: z.string(),
            candles_watched: z.number().int().positive(),
        })
            .strict(),
    }),
    /* ---- Intent ---- */
    cta_clicked: defineEvent({
        description: 'Any primary call to action. Attributes conversions to placement.',
        trigger: 'CTA activated.',
        emittedFrom: 'client',
        properties: z
            .object({
            placement: z.enum(['hero', 'post_trade', 'features', 'footer', 'nav']),
            label: z.string(),
        })
            .strict(),
    }),
    signup_started: defineEvent({
        description: 'Visitor begins the signup form. Separates intent from completion.',
        trigger: 'First meaningful interaction with a signup field.',
        emittedFrom: 'client',
        properties: z
            .object({
            entry_point: z.enum(['hero', 'post_trade', 'features', 'footer', 'nav']),
            /** Whether the visitor had already closed a trade. The core experiment cut. */
            had_traded: z.boolean(),
        })
            .strict(),
    }),
    signup_failed: defineEvent({
        description: 'Signup attempt did not produce an account. Guardrail metric: if a variant ' +
            'lifts conversion while raising this, the lift is not real.',
        trigger: 'Users API returns a non-2xx response, or the request never completes.',
        emittedFrom: 'client',
        properties: z
            .object({
            reason: z.enum(['validation', 'duplicate_email', 'server_error', 'network']),
            field: z.string().nullable(),
            status_code: z.number().int().nullable(),
        })
            .strict(),
    }),
    /* ---- Conversion ---- */
    /**
     * PRIMARY CONVERSION. Server-only by design, per invariant 2 in CLAUDE.md. It fires
     * from the Route Handler after the row is committed, so what is counted is an
     * account that exists, not a form that was submitted.
     */
    account_created: defineEvent({
        description: 'Primary conversion. An account row was committed. Emitted server-side so the ' +
            'number reflects accounts that exist rather than submissions that were attempted.',
        trigger: 'POST /api/users succeeds and the transaction commits.',
        emittedFrom: 'server',
        properties: z
            .object({
            user_id: z.string().uuid(),
            entry_point: z.enum(['hero', 'post_trade', 'features', 'footer', 'nav']),
            /** Trades completed before converting. The activation-to-conversion link. */
            trades_before_signup: z.number().int().nonnegative(),
            time_to_signup_ms: z.number().int().nonnegative().nullable(),
        })
            .strict(),
    }),
};
/* -------------------------------------------------------------------------- */
/* Funnel                                                                     */
/* -------------------------------------------------------------------------- */
/**
 * Ordered funnel used in PostHog and in the analytics document.
 *
 * Primary conversion metric: unique visitors reaching `account_created`, divided by
 * unique visitors reaching `page_viewed`, measured per experiment arm.
 *
 * The intermediate steps are what make the result interpretable. A flat conversion
 * number tells you the variant lost; step conversion tells you whether nobody pressed
 * play, or everybody played and nobody signed up. Those are different problems.
 */
export const conversionFunnel = [
    { step: 1, event: 'page_viewed', label: 'Landed' },
    { step: 2, event: 'replay_started', label: 'Started the replay' },
    { step: 3, event: 'trade_closed', label: 'Completed a trade (activation)' },
    { step: 4, event: 'signup_started', label: 'Began signup' },
    { step: 5, event: 'account_created', label: 'Created an account' },
];
/**
 * Guardrail metrics. A variant that improves primary conversion while degrading any
 * of these does not ship.
 */
export const guardrails = [
    {
        name: 'Signup failure rate',
        definition: 'signup_failed / signup_started',
        rule: 'Must not increase. A lift bought with a broken form is not a lift.',
    },
    {
        name: 'Activation quality',
        definition: 'trade_closed / replay_started',
        rule: 'Must not decrease. If more people start the replay but fewer finish a trade, ' +
            'the hero is attracting attention without delivering the value it promises.',
    },
];
/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */
export class TrackingPlanViolation extends Error {
    event;
    detail;
    constructor(event, detail) {
        super(`[tracking-plan] ${event}: ${detail}`);
        this.event = event;
        this.detail = detail;
        this.name = 'TrackingPlanViolation';
    }
}
/**
 * Validates an event against the plan before it is emitted.
 *
 * Throws in development so violations surface during implementation. In production the
 * caller is expected to catch, drop the event, and report the violation: analytics must
 * never take down a page.
 */
export function validateEvent(event, properties, context, emittedFrom) {
    const definition = trackingPlan[event];
    if (!definition) {
        throw new TrackingPlanViolation(String(event), 'not declared in the tracking plan');
    }
    if (definition.emittedFrom !== emittedFrom) {
        throw new TrackingPlanViolation(String(event), `may only be emitted from the ${definition.emittedFrom}, attempted from the ${emittedFrom}`);
    }
    const parsedProperties = definition.properties.safeParse(properties);
    if (!parsedProperties.success) {
        throw new TrackingPlanViolation(String(event), `invalid properties: ${parsedProperties.error.issues
            .map((i) => `${i.path.join('.') || '(root)'} ${i.message}`)
            .join('; ')}`);
    }
    const parsedContext = contextSchema.safeParse(context);
    if (!parsedContext.success) {
        throw new TrackingPlanViolation(String(event), `invalid context: ${parsedContext.error.issues
            .map((i) => `${i.path.join('.') || '(root)'} ${i.message}`)
            .join('; ')}`);
    }
    return {
        properties: parsedProperties.data,
        context: parsedContext.data,
    };
}
/* -------------------------------------------------------------------------- */
/* Accepted system events                                                     */
/* -------------------------------------------------------------------------- */
/**
 * PostHog system events we knowingly accept.
 *
 * Invariant 1 says event names are never invented, which makes any event outside the
 * tracking plan suspect. PostHog emits some of its own regardless, so the honest thing
 * is to declare which ones we expect and why, rather than leaving a reviewer to guess
 * whether an unfamiliar `$` event is a defect or a default nobody turned off.
 *
 * Disabled on purpose in `client.ts`, and therefore NOT in this list:
 *
 *   autocapture       one event per click, keyed on CSS selectors. High volume, and
 *                     the keys break whenever markup changes, so the funnel we
 *                     designed would be buried in noise we do not control.
 *   capture_pageview  PostHog's own `$pageview`. We emit `page_viewed` instead, with
 *                     the properties this plan declares.
 *
 * Any system event arriving that is not listed here is a defect to investigate: it
 * means a default was re-enabled, or the SDK changed behaviour under us.
 */
export const acceptedSystemEvents = [
    {
        event: '$pageleave',
        reason: 'Enabled via `capture_pageleave` in client.ts. Gives time-on-page, a diagnostic ' +
            'signal that matters for a landing experience where the question is whether ' +
            'visitors engaged or bounced. Its system properties are stable, unlike ' +
            'autocapture, which keys events on CSS selectors that change with the markup.',
    },
    {
        event: '$feature_flag_called',
        reason: 'Emitted by PostHog whenever `getFeatureFlag` runs. Required for experiment ' +
            'analysis: it is how PostHog attributes exposure to an arm. It cannot be ' +
            'disabled without losing feature flag functionality, so it is accepted rather ' +
            'than suppressed.',
    },
];

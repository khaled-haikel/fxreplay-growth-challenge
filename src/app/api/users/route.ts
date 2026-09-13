/**
 * POST /api/users  — create an account
 * GET  /api/users  — list accounts, paginated
 */

import { trackServer } from "@/lib/analytics/server";
import {
  errorResponse,
  fieldErrorsFrom,
  signupAnalyticsSchema,
} from "@/lib/users/api-contract";
import { userRepository } from "@/lib/users/repository";
import { createUserSchema } from "@/lib/users/schema";
import { z } from "zod";

/**
 * The POST body: the user fields, plus the analytics envelope the browser attaches.
 *
 * Validated as a whole rather than by picking `email` and `name` out of it. Cherry
 * picking silently discards anything else the caller sent, which makes the schema's
 * `.strict()` a decoration — a client posting `isAdmin: true` would have got a 201
 * and never learned that the field went nowhere. `analytics` is typed loosely here
 * because it has its own schema and its own, far more forgiving, failure path.
 */
const createRequestSchema = createUserSchema
  .extend({ analytics: z.unknown().optional() })
  .strict();

/** Paginated even at three rows, because that is the contract that survives growth. */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function POST(request: Request): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse("validation_error", "Request body must be valid JSON.");
  }

  // This is the hostile-client boundary: everything in the body is checked.
  const parsed = createRequestSchema.safeParse(payload ?? {});

  if (!parsed.success) {
    return errorResponse(
      "validation_error",
      "Some details need fixing before we can create the account.",
      fieldErrorsFrom(parsed.error),
    );
  }

  // Check-then-insert closes the common case with a good message. It is not the
  // guarantee — two requests can interleave between the read and the write, which
  // is why the unique index exists in the migration.
  const existing = await userRepository.findByEmail(parsed.data.email);
  if (existing) {
    return errorResponse(
      "duplicate_email",
      "An account with that email already exists.",
      [{ field: "email", reason: "This email is already registered" }],
    );
  }

  let user;
  try {
    user = await userRepository.create({
      email: parsed.data.email,
      name: parsed.data.name,
    });
  } catch (error) {
    console.error("[api/users] create failed", error);
    return errorResponse(
      "server_error",
      "We could not create the account. Please try again.",
    );
  }

  /*
   * CONVERSION EVENT. After the row is committed, never before, and never from the
   * browser (invariant 2).
   *
   * A malformed analytics payload must not cost a signup. The account exists at this
   * point; refusing to return 201 because a `session_id` was missing would throw away
   * a real conversion to protect a measurement of it, which is exactly backwards.
   * So the payload is parsed leniently here, and a failure is logged and dropped.
   */
  const analytics = signupAnalyticsSchema.safeParse(parsed.data.analytics);

  if (!analytics.success) {
    console.warn(
      "[api/users] analytics payload rejected, account_created not emitted:",
      fieldErrorsFrom(analytics.error),
    );
  } else {
    try {
      await trackServer({
        event: "account_created",
        properties: {
          user_id: user.id,
          entry_point: analytics.data.entry_point,
          trades_before_signup: analytics.data.trades_before_signup,
          time_to_signup_ms: analytics.data.time_to_signup_ms,
        },
        context: analytics.data.context,
        distinctId: analytics.data.distinctId,
      });
    } catch (error) {
      // trackServer already swallows its own failures; this is the belt to its
      // braces. Under no circumstances does a 201 become a 500 over an event.
      console.error("[api/users] account_created failed to emit", error);
    }
  }

  return Response.json({ data: user }, { status: 201 });
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;

  const requestedLimit = Number(params.get("limit") ?? DEFAULT_LIMIT);
  const requestedOffset = Number(params.get("offset") ?? 0);

  if (!Number.isFinite(requestedLimit) || requestedLimit < 1) {
    return errorResponse("validation_error", "`limit` must be a positive number.", [
      { field: "limit", reason: "Must be a positive number" },
    ]);
  }

  if (!Number.isFinite(requestedOffset) || requestedOffset < 0) {
    return errorResponse("validation_error", "`offset` cannot be negative.", [
      { field: "offset", reason: "Must be zero or greater" },
    ]);
  }

  // Capped rather than rejected: a caller asking for 10,000 rows gets the maximum
  // page and the `limit` echoed back, which is friendlier than a 400 and still
  // stops one request from reading the whole table.
  const limit = Math.min(Math.floor(requestedLimit), MAX_LIMIT);
  const offset = Math.floor(requestedOffset);

  try {
    const { users, total } = await userRepository.list({ limit, offset });

    return Response.json({
      data: users,
      pagination: {
        limit,
        offset,
        total,
        hasMore: offset + users.length < total,
      },
    });
  } catch (error) {
    console.error("[api/users] list failed", error);
    return errorResponse("server_error", "We could not list accounts right now.");
  }
}

/**
 * The wire contract for the Users API.
 *
 * One error shape across all three endpoints. A client that can parse a failure from
 * POST can parse one from PATCH without a second code path, and the signup form maps
 * `code` straight onto the `signup_failed` reason enum — which is only possible
 * because the codes were chosen to line up with it rather than invented per route.
 */

import { z } from "zod";

import { contextSchema, trackingPlan } from "@/lib/analytics/tracking-plan";

export type ApiErrorCode =
  | "validation_error"
  | "duplicate_email"
  | "not_found"
  | "server_error";

export interface ApiFieldError {
  field: string;
  reason: string;
}

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    fields?: ApiFieldError[];
  };
}

const STATUS_FOR: Record<ApiErrorCode, number> = {
  validation_error: 400,
  duplicate_email: 409,
  not_found: 404,
  server_error: 500,
};

export function errorResponse(
  code: ApiErrorCode,
  message: string,
  fields?: ApiFieldError[],
): Response {
  const body: ApiErrorBody = { error: { code, message, ...(fields && { fields }) } };
  return Response.json(body, { status: STATUS_FOR[code] });
}

/** Flattens a Zod failure into the field/reason pairs the form renders inline. */
export function fieldErrorsFrom(error: z.ZodError): ApiFieldError[] {
  return error.issues.map((issue) => ({
    field: issue.path.join(".") || "_",
    reason: issue.message,
  }));
}

/* -------------------------------------------------------------------------- */
/* Analytics payload                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The context the server cannot derive for itself.
 *
 * There is no cookie on this side, so no `distinct_id`; no viewport, so no device
 * type; no feature flag client, so no variant. All of it has to travel with the
 * request or `account_created` lands against a stranger and the funnel never closes.
 *
 * `entry_point` is pulled off the tracking plan rather than retyped. Writing
 * `z.enum(['hero', 'post_trade', ...])` here would be a second definition of a
 * closed set, and the two would drift the first time a placement is added.
 */
const entryPointSchema = trackingPlan.account_created.properties.shape.entry_point;

export const signupAnalyticsSchema = z
  .object({
    distinctId: z.string().min(1),
    context: contextSchema,
    entry_point: entryPointSchema,
    trades_before_signup: z.number().int().nonnegative(),
    time_to_signup_ms: z.number().int().nonnegative().nullable(),
  })
  .strict();

export type SignupAnalytics = z.infer<typeof signupAnalyticsSchema>;

/**
 * PATCH /api/users/[id] — update an account
 */

import {
  errorResponse,
  fieldErrorsFrom,
} from "@/lib/users/api-contract";
import { userRepository } from "@/lib/users/repository";
import { updateUserSchema } from "@/lib/users/schema";

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/users/[id]">,
): Promise<Response> {
  const { id } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse("validation_error", "Request body must be valid JSON.");
  }

  const parsed = updateUserSchema.safeParse(payload);
  if (!parsed.success) {
    return errorResponse(
      "validation_error",
      "Some details need fixing before we can save the change.",
      fieldErrorsFrom(parsed.error),
    );
  }

  // A change of email has to clear the same uniqueness bar as a create, and it has
  // to allow the no-op: patching a user with the email it already has is not a
  // conflict with itself.
  if (parsed.data.email) {
    const owner = await userRepository.findByEmail(parsed.data.email);
    if (owner && owner.id !== id) {
      return errorResponse(
        "duplicate_email",
        "Another account already uses that email.",
        [{ field: "email", reason: "This email is already registered" }],
      );
    }
  }

  try {
    const updated = await userRepository.update(id, parsed.data);

    if (!updated) {
      return errorResponse("not_found", "No account with that id.");
    }

    return Response.json({ data: updated });
  } catch (error) {
    console.error("[api/users/:id] update failed", error);
    return errorResponse(
      "server_error",
      "We could not save that change. Please try again.",
    );
  }
}

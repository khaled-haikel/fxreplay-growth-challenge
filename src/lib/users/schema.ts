/**
 * What a valid user is. One definition, used on both sides of the wire.
 *
 * The browser validates so a typo is caught before a round trip. The server
 * validates because the browser is hostile — anyone can POST whatever they like to
 * a public endpoint, and a form is not a security boundary. Both import this file,
 * which is the whole point: two definitions of a valid user drift, and the day they
 * drift is the day the client accepts something the server rejects and the visitor
 * sees a failure they cannot act on (invariant 3 in CLAUDE.md).
 *
 * No password field. Authentication is explicitly out of scope for this build, and
 * a half-built credential store is worse than none.
 */

import { z } from "zod";

/**
 * Normalised at the schema boundary, not at the call site.
 *
 * `Ana@Example.com ` and `ana@example.com` are the same account to a human, so they
 * must be the same account to the uniqueness check. Doing the trim and the lowercase
 * here means every consumer — form, route handler, repository — sees the same
 * canonical value, and the 409 on duplicate email cannot be walked around with a
 * capital letter.
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Enter your email address")
  .email("That does not look like a valid email address");

export const nameSchema = z
  .string()
  .trim()
  .min(2, "Your name needs at least 2 characters")
  .max(60, "Your name cannot be longer than 60 characters");

/** The payload for creating an account. */
export const createUserSchema = z
  .object({
    email: emailSchema,
    name: nameSchema,
  })
  .strict();

/**
 * The payload for updating one. Every field optional, but at least one required —
 * an empty PATCH is a caller mistake, not a no-op worth a 200.
 */
export const updateUserSchema = createUserSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

/** A user as stored and as returned by the API. */
export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

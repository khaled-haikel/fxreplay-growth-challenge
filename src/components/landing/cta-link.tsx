/**
 * The primary call to action.
 *
 * One definition rather than a duplicated anchor in two sections. This is the element
 * the whole page exists to get clicked, and it is the seam where `cta_clicked`
 * instrumentation lands in the next step: one file to convert, one place to thread a
 * `placement` through, and no risk of the two CTAs drifting apart in the meantime.
 *
 * An anchor, not a button: it navigates to the signup route rather than acting on the
 * current page. Keyboard operability and the focus ring come from the base layer in
 * globals.css, so they cannot be forgotten here.
 *
 * Hover deliberately darkens to `accent-pressed` instead of lightening to
 * `accent-hover`: white-on-accent-hover measures 3.62:1, under the 4.5:1 AA floor for
 * body-sized text. Darkening takes it to 6.29:1. See the note in the handover.
 */

/**
 * `placement` becomes the `from` query parameter, which the signup page turns into
 * the `entry_point` on `signup_started` and `account_created`. Without it every
 * conversion would be attributed to the hero by default, and the question the
 * experiment exists to answer — does the replay convert better than the copy —
 * would have no data behind it.
 */
import Link from "next/link";

export function CtaLink({
  placement,
  children,
}: {
  placement: "hero" | "post_trade" | "features" | "footer" | "nav";
  children: React.ReactNode;
}) {
  return (
    <Link
      href={`/signup?from=${placement}`}
      className="inline-flex items-center justify-center rounded-full bg-accent px-8 py-3.5 text-base font-bold text-fg-on-accent transition-[background-color,transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:bg-accent-pressed hover:shadow-lg"
    >
      {children}
    </Link>
  );
}

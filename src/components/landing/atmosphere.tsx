/**
 * Decorative background layers.
 *
 * Both are empty elements: they carry no content, are hidden from assistive tech, do
 * not intercept pointer events, and sit on a negative z-index so nothing can end up
 * on the wrong side of them. The visual work happens in `.fx-grid` / `.fx-glow` in
 * globals.css, where the brand primitives live.
 *
 * Any section using these needs `relative isolate` so the negative z-index resolves
 * inside that section rather than escaping behind the page background.
 */

export function GridTexture({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`fx-grid pointer-events-none absolute inset-0 -z-10 ${className}`}
    />
  );
}

/**
 * Position and size are passed in, because the glow is always anchored to a specific
 * piece of content — the replay panel, the closing CTA — rather than to a section.
 */
export function Glow({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`fx-glow pointer-events-none absolute -z-10 ${className}`}
    />
  );
}

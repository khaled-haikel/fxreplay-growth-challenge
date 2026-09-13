/**
 * An application window.
 *
 * Both panels on this page — the replay in the hero, the evaluation rules in the
 * audience section — share one definition so their chrome cannot drift apart.
 *
 * The treatment is deliberately background AND border together. `surface` sits only
 * 1.04:1 off `canvas`, which is invisible on most screens, so a fill alone does not
 * separate anything: the `line-default` edge is what actually makes this read as a
 * raised object rather than a patch of slightly different black.
 */

export function Panel({
  bar,
  children,
  surface = "base",
  className = "",
}: {
  /** Title bar contents. Laid out as a flex row by the panel itself. */
  bar: React.ReactNode;
  children: React.ReactNode;
  /**
   * Which elevation the panel sits at. `raised` is for a panel on top of a
   * `surface` band, where a `surface` fill would be invisible against its own
   * background and the border would be carrying the separation alone.
   *
   * A prop rather than a className override: two competing `bg-*` utilities are
   * resolved by stylesheet order, not by the order they appear in the string.
   */
  surface?: "base" | "raised";
  className?: string;
}) {
  const fill = surface === "raised" ? "bg-surface-raised" : "bg-surface";

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-line-default ${fill} ${className}`}
    >
      <div className="flex items-center gap-3 border-b border-line-subtle px-4 py-2.5">
        {bar}
      </div>
      {children}
    </div>
  );
}

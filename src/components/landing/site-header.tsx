import Image from "next/image";

/**
 * Not sticky. A landing page this short does not need a rail following the visitor
 * down it, and a sticky bar would sit on top of the replay, which is the one thing
 * here worth looking at.
 *
 * "Sign in" is deliberately muted and is not a second CTA: the accent belongs to
 * "Try FX Replay free" alone, and returning users know where to look.
 */

export function SiteHeader() {
  return (
    <header className="border-b border-line-subtle">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
        <Image
          src="/FXReplayLogo.svg"
          alt="FX Replay"
          width={1609}
          height={209}
          priority
          className="h-[20px] w-auto"
        />

        <a
          href="/signin"
          className="text-sm text-fg-muted hover:text-fg-primary"
        >
          Sign in
        </a>
      </div>
    </header>
  );
}

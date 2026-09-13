import { Audience } from "@/components/landing/audience";
import { ClosingCta } from "@/components/landing/closing-cta";
import { Hero } from "@/components/landing/hero";
import { Proof } from "@/components/landing/proof";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { SocialProof } from "@/components/landing/social-proof";

/**
 * Four sections and nothing else. Every extra band between the hero and the CTA is
 * another chance to leave, and this page has exactly one job. The social proof strip
 * is a band rather than a section: no heading, no landmark, two lines tall.
 */

export default function Home() {
  return (
    <div className="relative isolate flex flex-1 flex-col">
      {/* A short lift at the very top so the page does not begin on flat black. */}
      <div
        aria-hidden="true"
        className="fx-top-fade pointer-events-none absolute inset-x-0 top-0 -z-10 h-[200px]"
      />

      <SiteHeader />

      <main className="flex-1">
        <Hero />
        <SocialProof />
        <Proof />
        <Audience />
        <ClosingCta />
      </main>

      <SiteFooter />
    </div>
  );
}

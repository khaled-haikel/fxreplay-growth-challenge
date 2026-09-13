import type { Metadata } from "next";
import { JetBrains_Mono, Lato, Nunito_Sans } from "next/font/google";
import "./globals.css";
import { AnalyticsProvider } from "./providers";

/**
 * Three fonts, three roles, no overlap. The variable names are the contract with
 * globals.css, which maps them onto --font-display, --font-sans and --font-mono.
 */

// Display only: headlines at weight 900. 400 and 700 are loaded for the wordmark
// and any inline emphasis inside a heading.
const lato = Lato({
  variable: "--font-lato",
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  display: "swap",
});

// Body and UI.
const nunitoSans = Nunito_Sans({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

// Numeric values only — price, P&L, R multiples, anything that must not shift
// horizontally as digits change.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "FX Replay — practise your prop firm evaluation before you pay for it",
  description:
    "Replay real market data candle by candle, take the trade, and see the result. " +
    "Rehearse the drawdown and daily loss rules your evaluation holds you to, while " +
    "the attempt is still free.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${lato.variable} ${nunitoSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AnalyticsProvider>{children}</AnalyticsProvider>
      </body>
    </html>
  );
}

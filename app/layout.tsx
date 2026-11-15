import type { Metadata, Viewport } from "next";
import { Fredoka, Nunito } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
});

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: {
    default: "Thin Ice",
    template: "%s · Thin Ice",
  },
  description:
    "A party game for friend groups. Write two true things about yourself, let an AI forge the lie, and find out who really knows you.",
  // Rooms hold things players wrote about themselves; keep them out of search.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eaf6ff" },
    { media: "(prefers-color-scheme: dark)", color: "#071a2f" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${fredoka.variable} ${nunito.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

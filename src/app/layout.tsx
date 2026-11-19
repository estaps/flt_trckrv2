import type { Metadata, Viewport } from "next";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "./globals.css";
import { prisma } from "@/lib/db";
import { cookies } from "next/headers";
import { NavLinks } from "@/components/NavLinks";
import { LookSwitch } from "@/components/LookSwitch";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Flight Tracker",
  description: "Trips, flights, expenses and ticket captures",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#172031" },
  ],
};

// Badge counts for the header. A database hiccup should not take every page down with it.
async function counts() {
  try {
    const [inbox, alerts] = await Promise.all([
      prisma.document.count({ where: { status: { in: ["needs_review", "failed"] } } }),
      prisma.priceAlert.count({ where: { readAt: null } }),
    ]);
    return { inbox, alerts };
  } catch {
    return { inbox: 0, alerts: 0 };
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { inbox, alerts } = await counts();
  const look = (await cookies()).get("look")?.value === "board" ? "board" : "pass";
  return (
    <html lang="en" data-look={look === "board" ? "board" : undefined}>
      <body>
        <header className="top">
          <div className="top-inner">
            <a href="/" className="brand"><i aria-hidden="true" />FLIGHT TRACKER</a>
            <NavLinks inboxCount={inbox} alertCount={alerts} />
            <LookSwitch initial={look} />
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}

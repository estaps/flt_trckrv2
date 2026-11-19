"use client";

import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Trips", match: (p: string) => p === "/" || p.startsWith("/trips") || p.startsWith("/expenses") },
  { href: "/inbox", label: "Inbox", match: (p: string) => p.startsWith("/inbox") },
  { href: "/upload", label: "Upload", match: (p: string) => p.startsWith("/upload") },
  { href: "/ecredits", label: "eCredits", match: (p: string) => p.startsWith("/ecredits") },
  { href: "/prices", label: "Prices", match: (p: string) => p.startsWith("/prices") },
];

export function NavLinks({ inboxCount, alertCount }: { inboxCount: number; alertCount: number }) {
  const path = usePathname() ?? "/";
  return (
    <nav aria-label="Main">
      {LINKS.map((l) => {
        const badge = l.href === "/inbox" ? inboxCount : l.href === "/prices" ? alertCount : 0;
        return (
          <a key={l.href} href={l.href} aria-current={l.match(path) ? "page" : undefined}>
            {l.label}
            {badge > 0 ? <span className="count" aria-label={`${badge} new`}>{badge}</span> : null}
          </a>
        );
      })}
    </nav>
  );
}

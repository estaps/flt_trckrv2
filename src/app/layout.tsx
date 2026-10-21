import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flight Tracker",
  description: "Trips, flights, expenses and ticket captures",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <a href="/" className="brand">Flight Tracker</a>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}

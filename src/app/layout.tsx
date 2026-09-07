import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CleanOps — Operations Console",
  description:
    "Operations incident management: sites, workers, assignments, and AI-assisted incident triage.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

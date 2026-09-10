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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: "try{var t=localStorage.getItem('cleanops-theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){}",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

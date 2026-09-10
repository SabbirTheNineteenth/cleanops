export function assertSeedTarget(url: string): void {
  if (url === ":memory:" || url.startsWith("file:")) return;

  throw new Error(
    "db:seed is restricted to local SQLite targets and must never run against a remote database",
  );
}

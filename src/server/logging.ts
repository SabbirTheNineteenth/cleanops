export function logBestEffortFailure(
  operation: string,
  error: unknown,
  context: Record<string, string | number | undefined> = {},
): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({
    level: "error",
    category: "best_effort",
    operation,
    message,
    ...context,
  }));
}

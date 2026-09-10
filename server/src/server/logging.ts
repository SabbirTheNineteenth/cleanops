export function logBestEffortFailure(
  operation: string,
  error: unknown,
  context: Record<string, string | number | undefined> = {},
): void {
  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error && error.cause instanceof Error
    ? error.cause.message
    : undefined;
  console.error(JSON.stringify({
    level: "error",
    category: "best_effort",
    operation,
    message,
    cause,
    ...context,
  }));
}

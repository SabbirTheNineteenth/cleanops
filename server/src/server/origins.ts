type Environment = Record<string, string | undefined>;

function validateOrigin(value: string, mode: string): string {
  if (value.includes("*")) throw new Error("WEB_ORIGIN must not contain a wildcard");

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("WEB_ORIGIN must be an absolute origin");
  }

  if (url.origin !== value) throw new Error("WEB_ORIGIN must be an origin without a path, query, or fragment");
  if (mode === "production" && url.protocol !== "https:") {
    throw new Error("WEB_ORIGIN must use HTTPS in production");
  }
  return url.origin;
}

export function resolveAllowedWebOrigins(
  environment: Environment = process.env,
  mode = process.env.NODE_ENV ?? "development",
): string[] {
  const configured = environment.WEB_ORIGINS ?? environment.WEB_ORIGIN;
  if (!configured) {
    if (mode === "production") throw new Error("WEB_ORIGIN or WEB_ORIGINS must be configured in production");
    return ["http://localhost:3001"];
  }

  const origins: string[] = [];
  for (const rawOrigin of configured.split(",")) {
    const origin = rawOrigin.trim();
    if (origin) origins.push(validateOrigin(origin, mode));
  }

  if (origins.length === 0) throw new Error("WEB_ORIGIN or WEB_ORIGINS must contain at least one origin");
  return [...new Set(origins)];
}

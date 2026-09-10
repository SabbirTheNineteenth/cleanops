export function databaseClientConfig(env: NodeJS.ProcessEnv = process.env) {
  const url = env.DATABASE_URL?.trim();
  const isVercelProduction = env.NODE_ENV === "production" && env.VERCEL === "1";

  if (isVercelProduction && (!url || url.startsWith("file:"))) {
    throw new Error("DATABASE_URL must reference a durable remote database in Vercel production");
  }

  return {
    url: url || "file:cleanops.db",
    authToken: env.DATABASE_AUTH_TOKEN,
  };
}

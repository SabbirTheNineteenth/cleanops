import { createRequire } from "node:module";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { app as sourceApp } from "../src/server/app";

const require = createRequire(import.meta.url);
const { app } = require("../dist/server/app.js") as { app: typeof sourceApp };

// Keep Vercel from consuming POST bodies before this adapter builds a Request.
export const config = {
  api: {
    bodyParser: false,
  },
};

function requestHeaders(req: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }
  return headers;
}

function requestOrigin(req: IncomingMessage): string {
  const forwardedProtocol = req.headers["x-forwarded-proto"];
  const protocol = Array.isArray(forwardedProtocol)
    ? forwardedProtocol[0]
    : forwardedProtocol?.split(",")[0]?.trim() || "https";
  const host = req.headers.host ?? "localhost";
  return `${protocol}://${host}`;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const method = req.method ?? "GET";
  const request = new Request(new URL(req.url ?? "/", requestOrigin(req)), {
    method,
    headers: requestHeaders(req),
    body: method === "GET" || method === "HEAD" ? undefined : body,
  });
  const response = await app.fetch(request);

  response.headers.forEach((value, key) => {
    if (key !== "set-cookie") res.setHeader(key, value);
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) res.setHeader("set-cookie", cookies);

  res.statusCode = response.status;
  res.end(Buffer.from(await response.arrayBuffer()));
}

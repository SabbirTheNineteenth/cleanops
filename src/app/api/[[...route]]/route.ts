import { handle } from "hono/vercel";
import { app } from "@/server/app";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const handler = handle(app);

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;

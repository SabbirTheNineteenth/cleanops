import { createHash } from "node:crypto";

/** Stable checksum for an immutable, checked-in migration payload. */
export function migrationChecksum(content: string): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

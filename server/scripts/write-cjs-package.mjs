import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const distDirectory = resolve(process.cwd(), "dist");
const dbDirectory = resolve(distDirectory, "db");
await mkdir(dbDirectory, { recursive: true });
await writeFile(resolve(distDirectory, "package.json"), '{"type":"commonjs"}\n');
await copyFile(resolve(process.cwd(), "src", "db", "client-runtime.cjs"), resolve(dbDirectory, "client-runtime.cjs"));

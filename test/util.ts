import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const FIXTURES_DIR = path.join(__dirname, "fixtures");

export function fixturePath(...segments: string[]): string {
  return path.join(FIXTURES_DIR, ...segments);
}

export async function readJsonFixture(...segments: string[]): Promise<unknown> {
  const raw = await readFile(fixturePath(...segments), "utf-8");
  return JSON.parse(raw);
}

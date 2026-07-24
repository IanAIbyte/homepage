import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// <homepage-root>/data/archify
export const DATA_DIR = path.resolve(__dirname, "..", "..", "data", "archify");

export function jsonPath(id: string): string {
  return path.join(DATA_DIR, `${id}.architecture.json`);
}
export function htmlPath(id: string): string {
  return path.join(DATA_DIR, `${id}-architecture.html`);
}
export function resolveProjectPath(raw: string): string {
  const expanded = raw.replace(/^~(?=$|\/|\\)/, os.homedir());
  return path.resolve(expanded);
}
export async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

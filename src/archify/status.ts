import fs from "node:fs/promises";
import path from "node:path";
import { jsonPath, htmlPath } from "./paths.js";
import type { ArchifyStatus, RenderState } from "./types.js";

export type { ArchifyStatus, RenderState };

export async function inspectArchify(
  id: string,
  projectPath: string,
): Promise<ArchifyStatus> {
  try {
    await fs.access(jsonPath(id));
  } catch {
    return { renderState: "missing" };
  }
  const htmlStat = await fs.stat(htmlPath(id)).catch(() => null);
  if (!htmlStat) return { renderState: "failed" };
  const stale = await anyCodeNewerThan(projectPath, htmlStat.mtimeMs);
  return {
    renderState: stale ? "stale" : "ok",
    htmlMtime: htmlStat.mtime.toISOString(),
  };
}

// ported verbatim from project-hub inspect.ts:anyCodeNewerThan
async function anyCodeNewerThan(dir: string, jsonMtimeMs: number): Promise<boolean> {
  const entries = await fs.readdir(dir).catch(() => [] as string[]);
  for (const e of entries) {
    if (e.startsWith(".")) continue;
    const st = await fs.stat(path.join(dir, e)).catch(() => null);
    if (st && st.mtimeMs > jsonMtimeMs && !st.isDirectory()) return true;
  }
  return false;
}

import fs from "node:fs/promises";
import path from "node:path";
import { htmlPath, jsonPath } from "./paths";
import type { ArchifyStatus, RenderState } from "./types";

export type { ArchifyStatus, RenderState };

export async function inspectArchify(id: string, projectPath: string): Promise<ArchifyStatus> {
  // 1. Homepage's own generation (data/archify/<id>.*).
  if (await exists(jsonPath(id))) {
    const htmlStat = await fs.stat(htmlPath(id)).catch(() => null);
    if (!htmlStat) return { renderState: "failed", source: "homepage" };
    const stale = await anyCodeNewerThan(projectPath, htmlStat.mtimeMs);
    return {
      renderState: stale ? "stale" : "ok",
      htmlMtime: htmlStat.mtime.toISOString(),
      source: "homepage",
    };
  }
  // 2. Reuse an archify-generated diagram already in the project dir (e.g.
  //    produced by project-hub or the archify skill directly). archify writes a
  //    `<name>.architecture.json` IR next to a `<name>-architecture.html`.
  const reused = await findProjectDiagram(projectPath);
  if (!reused) return { renderState: "missing" };
  const stale = await anyCodeNewerThan(projectPath, reused.mtimeMs);
  return {
    renderState: stale ? "stale" : "ok",
    htmlMtime: new Date(reused.mtimeMs).toISOString(),
    source: "project",
  };
}

/**
 * Resolve the diagram HTML to serve for `id`: prefer Homepage's own generation,
 * else fall back to a reused archify diagram in the project dir. Null if none.
 */
export async function resolveDiagramHtml(id: string, projectPath: string): Promise<string | null> {
  if (await exists(jsonPath(id))) return htmlPath(id);
  return (await findProjectDiagram(projectPath))?.htmlPath ?? null;
}

/** Find an archify-generated diagram in a project dir via its IR marker. */
async function findProjectDiagram(
  projectPath: string,
): Promise<{ htmlPath: string; mtimeMs: number } | null> {
  const entries = await fs.readdir(projectPath).catch(() => [] as string[]);
  const jsonName = entries.find((e) => e.endsWith(".architecture.json"));
  if (!jsonName) return null;
  const htmlName = jsonName.replace(/\.architecture\.json$/, "-architecture.html");
  const htmlStat = await fs.stat(path.join(projectPath, htmlName)).catch(() => null);
  if (!htmlStat) return null;
  return { htmlPath: path.join(projectPath, htmlName), mtimeMs: htmlStat.mtimeMs };
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// ported from project-hub inspect.ts:anyCodeNewerThan
async function anyCodeNewerThan(dir: string, mtimeMs: number): Promise<boolean> {
  const entries = await fs.readdir(dir).catch(() => [] as string[]);
  for (const e of entries) {
    if (e.startsWith(".")) continue;
    const st = await fs.stat(path.join(dir, e)).catch(() => null);
    if (st && st.mtimeMs > mtimeMs && !st.isDirectory()) return true;
  }
  return false;
}

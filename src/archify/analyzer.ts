import { query } from "@anthropic-ai/claude-agent-sdk";
import fs from "node:fs/promises";
import type { Analyzer, AnalyzerCtx } from "./regenerate";

/**
 * Pure prompt builder for the archify Step A analyzer.
 *
 * Unit-tested directly (no LLM, no network). The prompt:
 *  - points Claude at the archify skill (SKILL.md, schema, worked example),
 *  - names the concrete JSON target it must write,
 *  - constrains the diagram shape (architecture type, <=12 components, one
 *    clear main path),
 *  - forbids running any renderer/shell (the deterministic runner renders),
 *  - and, when `priorError` is provided, feeds back the validation error
 *    from a previous attempt so Claude can correct the JSON.
 */
export function buildPrompt(opts: { projectPath: string; jsonPath: string; priorError?: string }): string {
  const name = opts.projectPath.split("/").pop() ?? "project";
  const base = `You are operating the archify skill. Read its full guide at ~/.claude/skills/archify/SKILL.md and the architecture schema at ~/.claude/skills/archify/schemas/architecture.schema.json, and study the worked example at ~/.claude/skills/archify/examples/web-app.architecture.json.

Goal: inspect the REAL code in the current directory (${name}) and produce/update the architecture diagram JSON at ${opts.jsonPath}, reflecting this project's actual components, boundaries, and connections right now.

Rules:
- If ${opts.jsonPath} already exists, read it and treat it as your starting point; edit it in place rather than starting from scratch.
- Use diagram_type "architecture". Keep it to <=12 components with ONE clear left-to-right main path. Prefer summary cards over extra arrows.
- Write ONLY the JSON file. Do NOT run any renderer or shell command — another process renders it.
- Ensure the JSON is valid and matches the schema (schema_version, diagram_type, meta, components, boundaries, connections, cards).
- LAYOUT CORRECTNESS — the final render runs an artifact checker that REJECTS diagonal arrows, label/node overlaps, and off-canvas elements, so:
  - Place components on a clean grid. Components in the SAME ROW must share an identical y (pos[1]) AND height (size[1]) so horizontal connections are perfectly level. Components in the SAME COLUMN must share an identical x (pos[0]) AND width (size[0]) so vertical connections are perfectly plumb.
  - Every connection must be orthogonal (strictly horizontal or vertical). For any connection whose two endpoints are not perfectly axis-aligned, add "route": "orthogonal-h" (mostly horizontal) or "route": "orthogonal-v" (mostly vertical) to force right-angle routing. NEVER leave a connection as a diagonal.
  - Keep labels short; if a label would collide with a node or another label, shift it with labelDx/labelDy or drop it.`;
  if (opts.priorError) {
    return `${base}\n\nThe JSON you previously produced failed archify validation with this error:\n${opts.priorError}\nFix the JSON so it validates, then write it again.`;
  }
  return base;
}

/** Step A timeout: 5 minutes (plan self-review mandate). */
const ANALYZER_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Real Step A analyzer: drives headless Claude via the Agent SDK to
 * author/update `<id>.architecture.json` from the project's real code.
 *
 * Safety contract:
 *  - Claude's tool set is LIMITED to Read/Glob/Grep/Write with
 *    `permissionMode: "acceptEdits"`. It never gets Bash and never runs
 *    archify — the deterministic runner (Step B) does.
 *  - A 5-minute AbortController timeout bounds the LLM session.
 *  - This function NEVER throws: the caller (`runRegeneration` in Task 8)
 *    does not wrap the analyzer call in try/catch, so the outer try/catch
 *    here converts every failure (abort, spawn error, SDK error) into a
 *    `{ ok:false, error }` result.
 */
export const claudeAnalyzer: Analyzer = async (ctx: AnalyzerCtx) => {
  const prompt = buildPrompt({
    projectPath: ctx.projectPath,
    jsonPath: ctx.jsonPath,
    priorError: ctx.priorError,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANALYZER_TIMEOUT_MS);
  try {
    for await (const msg of query({
      prompt,
      options: {
        cwd: ctx.projectPath,
        allowedTools: ["Read", "Glob", "Grep", "Write"],
        permissionMode: "acceptEdits",
        settingSources: ["user"],
        maxTurns: 40,
        abortController: controller,
      },
    })) {
      if (msg.type === "assistant" && msg.message?.content) {
        for (const block of msg.message.content as unknown as Array<Record<string, unknown>>) {
          if ("text" in block && block.text) {
            ctx.onProgress(String(block.text).slice(0, 200));
          } else if ("name" in block) {
            ctx.onProgress(`tool: ${block.name}`);
          }
        }
      } else if (msg.type === "result") {
        ctx.onProgress(`result: ${(msg as { subtype?: string }).subtype}`);
      }
    }
    try {
      await fs.access(ctx.jsonPath);
    } catch {
      return { ok: false, error: "analyzer did not produce the JSON file" };
    }
    return { ok: true };
  } catch (e: unknown) {
    return {
      ok: false,
      error: String((e as { message?: unknown })?.message ?? e),
    };
  } finally {
    clearTimeout(timer);
  }
};

import { query } from "@anthropic-ai/claude-agent-sdk";
import fs from "node:fs/promises";
import type { Analyzer, AnalyzerCtx } from "./regenerate";

/**
 * Prompt builder for the archify Step A analyzer.
 *
 * The analyzer inspects real code and authors `<id>.architecture.json`, then —
 * crucially — VALIDATES it in-session with `archify validate` and fixes any
 * layout problems (overlaps / off-canvas / diagonals) until it passes. This
 * in-session validate→fix loop is what makes headless generation reliable:
 * archify's layout rules are strict and a one-shot JSON almost always violates
 * them, so Claude must iterate (just like an interactive archify run).
 */
export function buildPrompt(opts: {
  projectPath: string;
  jsonPath: string;
  archifyBin: string;
  priorError?: string;
}): string {
  const name = opts.projectPath.split("/").pop() ?? "project";
  const base = `You are operating the archify skill. Read its full guide at ~/.claude/skills/archify/SKILL.md and the architecture schema at ~/.claude/skills/archify/schemas/architecture.schema.json, and study the worked example at ~/.claude/skills/archify/examples/web-app.architecture.json.

Goal: inspect the REAL code in the current directory (${name}) and produce/update the architecture diagram JSON at ${opts.jsonPath}, reflecting this project's actual components, boundaries, and connections right now.

Rules:
- If ${opts.jsonPath} already exists, read it and treat it as your starting point; edit it in place rather than starting from scratch.
- Use diagram_type "architecture". Keep it to <=12 components with ONE clear left-to-right main path. Prefer summary cards over extra arrows.
- Write ONLY the JSON file. Do NOT run \`archify deliver\`/\`render\` — another process renders the final HTML. You MAY (and must) run \`archify validate\`.
- Ensure the JSON is valid and matches the schema (schema_version, diagram_type, meta, components, boundaries, connections, cards).
- LAYOUT CORRECTNESS — archify's validator REJECTS diagonal arrows, label/node overlaps, and off-canvas elements, so:
  - Place components on a clean grid. Components in the SAME ROW must share an identical y (pos[1]) AND height (size[1]); components in the SAME COLUMN must share an identical x (pos[0]) AND width (size[0]).
  - Every connection must be orthogonal. For any connection whose endpoints are not perfectly axis-aligned, add "route": "orthogonal-h" or "route": "orthogonal-v". NEVER leave a diagonal.
  - Keep labels short; shift colliding labels with labelDx/labelDy/labelAt or drop them.

MANDATORY — validate and fix until the JSON passes, BEFORE finishing:
1. Run:  node ${opts.archifyBin} validate architecture ${opts.jsonPath} --json
2. If it reports problems, fix them in the JSON and re-run the validate command:
   - "Label X overlaps component Y" / label-node overlap: move the label (labelDx/labelDy) or set labelAt, move the component (pos/size), or drop the label.
   - "off-canvas" / "out of canvas": move the element inside the canvas bounds.
   - non-orthogonal / diagonal connection: add "route": "orthogonal-h" (mostly horizontal) or "orthogonal-v" (mostly vertical).
3. Repeat until validate exits 0 (the JSON is valid). Do NOT finish while the JSON still fails validation.`;
  if (opts.priorError) {
    return `${base}\n\nNote: a previous attempt's JSON failed validation with:\n${opts.priorError}\nMake sure your final JSON validates.`;
  }
  return base;
}

/** Step A timeout. Analysis + the in-session validate/fix loop can take a while
 *  on non-trivial repos, so default generously and allow override via env. */
const ANALYZER_TIMEOUT_MS = Number(process.env.ARCHIFY_ANALYZER_TIMEOUT_MS) || 15 * 60 * 1000;

/**
 * Real Step A analyzer: drives headless Claude via the Agent SDK to author +
 * self-validate `<id>.architecture.json` from the project's real code.
 *
 * Tool set: Read/Glob/Grep/Write plus a SCOPED Bash(node:*) — the latter only
 * so Claude can run `archify validate` (a node command) to check its own JSON
 * and fix layout issues in-session. It cannot run arbitrary commands.
 * permissionMode "acceptEdits" auto-approves the file/command edits. A
 * generous AbortController timeout bounds the session. Never throws — every
 * failure becomes { ok:false, error }.
 */
export const claudeAnalyzer: Analyzer = async (ctx: AnalyzerCtx) => {
  const prompt = buildPrompt({
    projectPath: ctx.projectPath,
    jsonPath: ctx.jsonPath,
    archifyBin: ctx.archifyBin,
    priorError: ctx.priorError,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANALYZER_TIMEOUT_MS);
  try {
    for await (const msg of query({
      prompt,
      options: {
        cwd: ctx.projectPath,
        allowedTools: ["Read", "Glob", "Grep", "Write", "Bash(node:*)"],
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

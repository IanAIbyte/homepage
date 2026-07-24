import type { RenderResult } from "./archify-runner";
import { jobController } from "./jobs";
import type { Job } from "./types";

export interface AnalyzerCtx {
  projectPath: string;
  jsonPath: string;
  priorError?: string;
  onProgress: (line: string) => void;
}

export interface AnalyzerResult {
  ok: boolean;
  error?: string;
}

export type Analyzer = (ctx: AnalyzerCtx) => Promise<AnalyzerResult>;

export interface RegenerateProject {
  id: string;
  path: string;
  jsonPath: string;
  htmlPath: string;
}

export interface RegenerateDeps {
  analyzer: Analyzer;
  render: (input: {
    jsonPath: string;
    htmlPath: string;
    archifyBin: string;
    quality?: "standard" | "showcase";
  }) => Promise<RenderResult>;
  archifyBin: string;
  quality?: "standard" | "showcase";
}

/**
 * Orchestrate the two-step regeneration of an archify diagram:
 *   Step A — invoke the analyzer (Claude / Agent SDK in production, a mock
 *            in tests) to author or update `<project>.architecture.json`.
 *   Step B — validate + deterministically render the JSON to HTML via the
 *            injected `render` function (defaults to `renderArchify``.
 *
 * Retry policy: a non-layout Step B failure feeds the error back to the
 * analyzer and retries Step A (up to MAX_ATTEMPTS). archify *layout* failures
 * (overlaps / off-canvas / diagonals) are structural and seldom self-correct
 * on re-analysis, so they fail fast — see `isLayoutError`. The previous HTML
 * artifact is preserved by `renderArchify`'s atomic `deliver` contract; the
 * orchestrator never deletes it.
 *
 * The analyzer is injected so the full logic is unit-testable with a mock.
 */
export async function runRegeneration(job: Job, project: RegenerateProject, deps: RegenerateDeps): Promise<void> {
  const ctl = jobController(job);
  ctl.markRunning();

  const quality = deps.quality ?? "standard";
  const MAX_ATTEMPTS = 3; // 1 initial + up to 2 retries with feedback
  let priorError: string | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Step A — analyze
    ctl.setStage("analyzing");
    const a = await deps.analyzer({
      projectPath: project.path,
      jsonPath: project.jsonPath,
      priorError,
      onProgress: (l) => ctl.pushProgress(l),
    });
    if (!a.ok) {
      ctl.fail(`analysis failed (attempt ${attempt}/${MAX_ATTEMPTS}): ${a.error ?? "unknown"}`);
      return;
    }

    // Step B — validate + render
    ctl.setStage("rendering");
    const r = await deps.render({
      jsonPath: project.jsonPath,
      htmlPath: project.htmlPath,
      archifyBin: deps.archifyBin,
      quality,
    });
    if (r.ok) {
      ctl.succeed(r.receipt);
      return;
    }

    priorError = r.error;
    // Layout failures are structural — fail fast instead of burning two more
    // ~5-min analyses (which rarely fix overlaps and invite a hang).
    const layoutFail = isLayoutError(r.error);
    if (layoutFail || attempt >= MAX_ATTEMPTS) {
      ctl.fail(
        layoutFail
          ? `archify layout validation failed (not retried — overlaps/off-canvas rarely self-correct): ${r.error ?? "unknown"}`
          : `archify render failed after ${MAX_ATTEMPTS} attempts: ${r.error ?? "unknown"}`,
      );
      return;
    }
    ctl.pushProgress(
      `render/validate failed (attempt ${attempt}/${MAX_ATTEMPTS}): ${r.error}; retrying analysis with feedback`,
    );
  }
}

/**
 * archify renders reject diagrams whose layout is invalid — labels/nodes that
 * overlap, elements off-canvas, or non-orthogonal (diagonal) connections. These
 * are structural mistakes in the authored JSON that a fresh analysis pass seldom
 * corrects, so the orchestrator treats them as non-retryable.
 */
export function isLayoutError(error?: string): boolean {
  return /overlap|off-?canvas|out of canvas|diagonal/i.test(error ?? "");
}

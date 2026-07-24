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
 *            injected `render` function (defaults to `renderArchify`).
 *
 * On a Step B failure we feed the validate/render error back to the analyzer
 * and retry Step A exactly once. If the retry also fails (or the analyzer
 * itself errors), the job is marked `failed`; the previously delivered HTML
 * is preserved by `renderArchify`'s atomic `deliver` contract — the
 * orchestrator never deletes it.
 *
 * The analyzer is injected (rather than imported here) so the full logic is
 * unit-testable with a mock, decoupled from the real Agent SDK wiring (Task 9).
 */
export async function runRegeneration(job: Job, project: RegenerateProject, deps: RegenerateDeps): Promise<void> {
  const ctl = jobController(job);
  ctl.markRunning();

  const quality = deps.quality ?? "standard";

  // Up to MAX_ATTEMPTS passes of (Step A analyze -> Step B validate+render).
  // The first pass has no prior error; each failed render feeds its error back
  // to the analyzer so Claude can correct the JSON. The previous HTML artifact
  // is left untouched on every failure — `deliver` only replaces it on success.
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
    if (attempt < MAX_ATTEMPTS) {
      ctl.pushProgress(
        `render/validate failed (attempt ${attempt}/${MAX_ATTEMPTS}): ${r.error}; retrying analysis with feedback`,
      );
    }
  }

  ctl.fail(`archify render failed after ${MAX_ATTEMPTS} attempts: ${priorError ?? "unknown"}`);
  // No half-written JSON is promoted: the prior HTML is preserved by
  // `deliver`'s atomic contract, and we never delete it here.
}

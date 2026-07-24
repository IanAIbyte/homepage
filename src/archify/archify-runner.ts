import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export interface RenderInput {
  jsonPath: string;
  htmlPath: string;
  archifyBin: string;
  quality?: "standard" | "showcase";
}

export interface RenderResult {
  ok: boolean;
  receipt?: string;
  error?: string;
}

async function validate({ jsonPath, archifyBin, quality }: RenderInput): Promise<RenderResult> {
  try {
    const args = ["validate", "architecture", jsonPath, "--json"];
    if (quality) args.push("--quality", quality);
    await run("node", [archifyBin, ...args], { maxBuffer: 16 * 1024 * 1024 });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: (e.stdout || e.stderr || e.message || String(e)).toString().slice(0, 2000) };
  }
}

export async function renderArchify(input: RenderInput): Promise<RenderResult> {
  const v = await validate(input);
  if (!v.ok) return v;
  try {
    const args = ["deliver", "architecture", input.jsonPath, input.htmlPath, "--json"];
    if (input.quality) args.push("--quality", input.quality);
    const { stdout } = await run("node", [input.archifyBin, ...args], { maxBuffer: 32 * 1024 * 1024 });
    let receipt: string | undefined;
    // archify `deliver --json` reports the artifact hash at `artifact.sha256`
    // (with `artifact.bytes` alongside). Extraction is best-effort: the
    // caller only needs `ok`, and a non-JSON stdout is tolerated.
    try {
      const parsed = JSON.parse(stdout);
      receipt = parsed?.artifact?.sha256 ?? parsed?.receipt?.sha256 ?? parsed?.bytes;
    } catch {
      /* non-json ok */
    }
    return { ok: true, receipt };
  } catch (e: any) {
    return { ok: false, error: (e.stdout || e.stderr || e.message || String(e)).toString().slice(0, 2000) };
  }
}

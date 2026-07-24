import { expect, test, vi } from "vitest";
import { createJob } from "./jobs.js";
import { runRegeneration, isLayoutError } from "./regenerate.js";
import type { Analyzer, RegenerateDeps } from "./regenerate.js";

function makeDeps(analyzer: Analyzer, render: () => Promise<{ ok: boolean; error?: string; receipt?: string }>): RegenerateDeps {
  return { analyzer, render: async () => render(), archifyBin: "/fake/archify.mjs" };
}

const proj = { id: "proj", path: "/p", jsonPath: "/p.json", htmlPath: "/p.html" };

test("isLayoutError detects archify layout failures (overlap/off-canvas/diagonal)", () => {
  expect(isLayoutError("Label 'agent' overlaps component 'mcp'")).toBe(true);
  expect(isLayoutError("element off-canvas")).toBe(true);
  expect(isLayoutError("connection is a diagonal")).toBe(true);
  expect(isLayoutError("schema invalid: missing field")).toBe(false);
});

test("layout validation failure fails fast — analyzer called ONCE, no retry", async () => {
  const analyzer = vi.fn(async () => ({ ok: true })) as unknown as Analyzer;
  const render = vi.fn(async () => ({ ok: false, error: "Label 'x' overlaps component 'y'" }));
  const job = createJob("proj");
  await runRegeneration(job, proj, makeDeps(analyzer, render));
  expect(analyzer).toHaveBeenCalledTimes(1);
  expect(render).toHaveBeenCalledTimes(1);
  expect(job.status).toBe("failed");
  expect(job.error).toMatch(/layout validation failed/);
});

test("non-layout render error retries up to MAX_ATTEMPTS, then fails", async () => {
  const analyzer = vi.fn(async () => ({ ok: true })) as unknown as Analyzer;
  const render = vi.fn(async () => ({ ok: false, error: "schema invalid: missing field" }));
  const job = createJob("proj");
  await runRegeneration(job, proj, makeDeps(analyzer, render));
  expect(analyzer).toHaveBeenCalledTimes(3);
  expect(render).toHaveBeenCalledTimes(3);
  expect(job.status).toBe("failed");
});

test("success on first attempt marks the job done", async () => {
  const analyzer = vi.fn(async () => ({ ok: true })) as unknown as Analyzer;
  const render = vi.fn(async () => ({ ok: true, receipt: "sha-abc" }));
  const job = createJob("proj");
  await runRegeneration(job, proj, makeDeps(analyzer, render));
  expect(job.status).toBe("done");
});

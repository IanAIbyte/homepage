// New test: inspectArchify render-state classification (missing/failed/stale/ok).
//
// `inspectArchify` resolves artifact paths via `jsonPath(id)`/`htmlPath(id)`
// from ./paths.js, which point at the real (gitignored) data dir. To keep these
// tests hermetic and parallel-safe we mock ./paths.js so those paths land inside
// a fresh tmp dir per test. `vi.mock` is hoisted above every import, so the tmp
// dir is held in a `vi.hoisted` holder (initialized before the factory runs and
// re-pointed in beforeEach); the mocked path functions read it lazily at call
// time.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, expect, test, vi } from "vitest";

const holder = vi.hoisted(() => ({ tmp: "" }));

vi.mock("./paths.js", () => ({
  DATA_DIR: holder.tmp,
  ensureDataDir: async () => {},
  jsonPath: (id: string) => path.join(holder.tmp, `${id}.architecture.json`),
  htmlPath: (id: string) => path.join(holder.tmp, `${id}-architecture.html`),
  resolveProjectPath: (raw: string) => raw,
}));

// Imported after vi.mock so it sees the mocked paths.
// (Status is lazily exercised inside each test via inspectArchify.)
import { inspectArchify } from "./status.js";

let projectDir: string;

beforeEach(() => {
  holder.tmp = fs.mkdtempSync(path.join(os.tmpdir(), "archify-data-"));
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "archify-proj-"));
});

async function writeJson(id: string) {
  fs.writeFileSync(path.join(holder.tmp, `${id}.architecture.json`), "{}");
}
async function writeHtml(id: string, ageMs = 0) {
  const p = path.join(holder.tmp, `${id}-architecture.html`);
  fs.writeFileSync(p, "<svg></svg>");
  if (ageMs > 0) {
    const old = new Date(Date.now() - ageMs);
    fs.utimesSync(p, old, old);
  }
}

test("missing: no architecture.json -> renderState 'missing'", async () => {
  const s = await inspectArchify("nope", projectDir);
  expect(s.renderState).toBe("missing");
  expect(s.htmlMtime).toBeUndefined();
});

test("failed: json exists but html absent -> renderState 'failed'", async () => {
  await writeJson("proj-failed");
  const s = await inspectArchify("proj-failed", projectDir);
  expect(s.renderState).toBe("failed");
});

test("ok: json + html present and no project code newer than html", async () => {
  const id = "proj-ok";
  await writeJson(id);
  await writeHtml(id);
  // An older project file must NOT flip stale.
  const older = path.join(projectDir, "old.js");
  fs.writeFileSync(older, "x");
  const old = new Date(Date.now() - 60_000);
  fs.utimesSync(older, old, old);
  const s = await inspectArchify(id, projectDir);
  expect(s.renderState).toBe("ok");
  expect(typeof s.htmlMtime).toBe("string");
});

test("stale: a project source file newer than the html flips 'stale'", async () => {
  const id = "proj-stale";
  await writeJson(id);
  // html is 30s old; a project file written just now is newer.
  await writeHtml(id, 30_000);
  fs.writeFileSync(path.join(projectDir, "new.js"), "y");
  const s = await inspectArchify(id, projectDir);
  expect(s.renderState).toBe("stale");
  expect(typeof s.htmlMtime).toBe("string");
});

test("subdirectories in the project do not count as newer code", async () => {
  const id = "proj-dir";
  await writeJson(id);
  await writeHtml(id, 30_000);
  fs.mkdirSync(path.join(projectDir, "child"));
  fs.writeFileSync(path.join(projectDir, "child", "nested.js"), "z");
  const s = await inspectArchify(id, projectDir);
  expect(s.renderState).toBe("ok");
});

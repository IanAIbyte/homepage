// Ported from project-hub:tests/server/archify-runner.test.ts.
// Adaptations: vitest globals are NOT enabled here, so `test`/`expect`/
// `beforeEach` are imported explicitly; import path changed from
// `../../src/server/archify-runner.js` to `./archify-runner.js`; the
// `ARCHIFY_BIN` constant that used to come from `../../src/shared/config.js`
// (which does not exist in this repo) is inlined with the same default value.
import { beforeEach, expect, test } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { renderArchify } from "./archify-runner.js";

// Same default as project-hub:src/shared/config.ts — overridable via env.
const ARCHIFY_BIN =
  process.env.ARCHIFY_BIN ??
  path.join(os.homedir(), ".claude", "skills", "archify", "bin", "archify.mjs");

// A known-good architecture JSON matching the schema (minimal but valid).
const GOOD = {
  schema_version: 1,
  diagram_type: "architecture",
  meta: { title: "T", subtitle: "s", output: "out.html" },
  components: [
    { id: "a", type: "frontend", label: "A", pos: [40, 40] },
    { id: "b", type: "backend", label: "B", pos: [300, 40] },
  ],
  boundaries: [],
  connections: [{ id: "a-b", from: "a", to: "b" }],
  cards: [],
};

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "arch-"));
});

test("renderArchify produces HTML for valid JSON", async () => {
  const jsonPath = path.join(dir, "x.architecture.json");
  const htmlPath = path.join(dir, "x-architecture.html");
  fs.writeFileSync(jsonPath, JSON.stringify(GOOD));
  const res = await renderArchify({ jsonPath, htmlPath, archifyBin: ARCHIFY_BIN });
  expect(res.ok).toBe(true);
  expect(fs.existsSync(htmlPath)).toBe(true);
  expect(fs.readFileSync(htmlPath, "utf8")).toContain("<svg");
});

test("renderArchify fails on invalid JSON and preserves prior HTML", async () => {
  const jsonPath = path.join(dir, "bad.architecture.json");
  const htmlPath = path.join(dir, "bad-architecture.html");
  fs.writeFileSync(
    jsonPath,
    JSON.stringify({
      schema_version: 1,
      diagram_type: "architecture",
      components: "not-an-array",
    }),
  );
  fs.writeFileSync(htmlPath, "<html>OLD</html>"); // previous artifact
  const res = await renderArchify({ jsonPath, htmlPath, archifyBin: ARCHIFY_BIN });
  expect(res.ok).toBe(false);
  expect(res.error).toBeTruthy();
  // prior HTML untouched
  expect(fs.readFileSync(htmlPath, "utf8")).toContain("OLD");
});

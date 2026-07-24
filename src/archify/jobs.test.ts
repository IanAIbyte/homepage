// Ported from project-hub:tests/server/jobs.test.ts.
// Adaptations: vitest globals are NOT enabled in this repo's vitest config, so
// `test`/`expect`/`beforeEach` are imported explicitly; import path changed from
// `../../src/server/jobs.js` to the co-located `./jobs.js`.
import { beforeEach, expect, test } from "vitest";
import {
  __resetForTest,
  createJob,
  getJob,
  hasRunningFor,
  runningCount,
} from "./jobs.js";

beforeEach(() => {
  __resetForTest();
});

test("createJob stores a queued job retrievable by id", () => {
  const j = createJob("rig-craft");
  expect(j.projectId).toBe("rig-craft");
  expect(j.status).toBe("queued");
  expect(getJob(j.id)).toBe(j);
});

test("hasRunningFor reflects running state", () => {
  const j = createJob("bili-up-monitor");
  expect(hasRunningFor("bili-up-monitor")).toBe(true);
  j.status = "done";
  expect(hasRunningFor("bili-up-monitor")).toBe(false);
});

test("runningCount reflects queued+running jobs across projects", () => {
  const a = createJob("p1");
  const b = createJob("p2");
  expect(runningCount()).toBe(2);
  a.status = "done";
  b.status = "failed";
  expect(runningCount()).toBe(0);
});

// New test: resolveProjectPath `~` expansion + jsonPath/htmlPath shape.
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { DATA_DIR, htmlPath, jsonPath, resolveProjectPath } from "./paths.js";

test("resolveProjectPath expands a bare ~ to the user home dir", () => {
  expect(resolveProjectPath("~")).toBe(os.homedir());
});

test("resolveProjectPath expands ~/sub/path", () => {
  expect(resolveProjectPath("~/foo/bar")).toBe(path.join(os.homedir(), "foo", "bar"));
});

test("resolveProjectPath leaves an absolute path unchanged", () => {
  expect(resolveProjectPath("/var/lib/x")).toBe("/var/lib/x");
});

test("resolveProjectPath resolves a relative path against cwd", () => {
  expect(resolveProjectPath("rel/path")).toBe(path.resolve(process.cwd(), "rel/path"));
});

test("jsonPath/htmlPath land inside DATA_DIR with the expected file names", () => {
  const id = "abc-123";
  expect(jsonPath(id)).toBe(path.join(DATA_DIR, "abc-123.architecture.json"));
  expect(htmlPath(id)).toBe(path.join(DATA_DIR, "abc-123-architecture.html"));
  expect(DATA_DIR.endsWith(path.join("data", "archify"))).toBe(true);
  // Strict: DATA_DIR must resolve inside the homepage repo, not above it
  expect(DATA_DIR.replace(/\\/g, "/")).toMatch(/\/homepage\/data\/archify$/);
});

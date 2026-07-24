// Handler tests for POST /api/archify/[id]/regenerate.
//
// The route orchestrates real I/O (jobs registry, regeneration, data dir, the
// Claude analyzer + archify runner), so every collaborator is mocked and the
// handler is loaded via a fresh dynamic import per test (vi.resetModules) so
// the hoisted vi.mock factories take effect. Asserts the project-hub ported
// contract: 405 (method), 404 (unknown id), 409 (already running), 503 (cap),
// 202 (queued + fire-and-forget runRegeneration).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServiceArchifyPath: vi.fn(),
  createJob: vi.fn(),
  hasRunningFor: vi.fn(),
  runningCount: vi.fn(),
  runRegeneration: vi.fn(),
  ensureDataDir: vi.fn(),
}));

vi.mock("../../../../archify/service-config", () => ({
  getServiceArchifyPath: mocks.getServiceArchifyPath,
}));
vi.mock("../../../../archify/jobs", () => ({
  createJob: mocks.createJob,
  hasRunningFor: mocks.hasRunningFor,
  runningCount: mocks.runningCount,
  getJob: vi.fn(),
}));
vi.mock("../../../../archify/regenerate", () => ({
  runRegeneration: mocks.runRegeneration,
}));
vi.mock("../../../../archify/paths", () => ({
  ensureDataDir: mocks.ensureDataDir,
  resolveProjectPath: (raw) => `/resolved/${raw}`,
  jsonPath: (id) => `/data/${id}.architecture.json`,
  htmlPath: (id) => `/data/${id}-architecture.html`,
}));
vi.mock("../../../../archify/analyzer", () => ({ claudeAnalyzer: vi.fn() }));
vi.mock("../../../../archify/archify-runner", () => ({ renderArchify: vi.fn() }));

function mockResponse() {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader: vi.fn(function setHeader(key, value) {
      res.headers[key] = value;
      return res;
    }),
    status: vi.fn(function status(code) {
      res.statusCode = code;
      return res;
    }),
    send: vi.fn(function send(body) {
      res.body = body;
      return res;
    }),
  };
  return res;
}

async function loadHandler() {
  vi.resetModules();
  // eslint-disable-next-line no-import-assign
  return (await import("./regenerate")).default;
}

describe("pages/api/archify/[id]/regenerate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServiceArchifyPath.mockResolvedValue("/projects/proj");
    mocks.hasRunningFor.mockReturnValue(false);
    mocks.runningCount.mockReturnValue(0);
    mocks.ensureDataDir.mockResolvedValue(undefined);
    mocks.runRegeneration.mockResolvedValue(undefined);
    mocks.createJob.mockImplementation((id) => ({
      id: "job-123",
      projectId: id,
      status: "queued",
    }));
  });

  it("returns 405 for non-POST methods", async () => {
    const handler = await loadHandler();
    const res = mockResponse();
    await handler({ method: "GET", query: { id: "proj" } }, res);
    expect(res.status).toHaveBeenCalledWith(405);
    expect(mocks.createJob).not.toHaveBeenCalled();
  });

  it("returns 404 when the service id has no widget.path", async () => {
    mocks.getServiceArchifyPath.mockResolvedValue(null);
    const handler = await loadHandler();
    const res = mockResponse();
    await handler({ method: "POST", query: { id: "unknown" } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mocks.createJob).not.toHaveBeenCalled();
  });

  it("returns 409 when a job is already running for the id", async () => {
    mocks.hasRunningFor.mockReturnValue(true);
    const handler = await loadHandler();
    const res = mockResponse();
    await handler({ method: "POST", query: { id: "proj" } }, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(mocks.createJob).not.toHaveBeenCalled();
  });

  it("returns 503 when the global concurrency cap is reached", async () => {
    mocks.runningCount.mockReturnValue(2);
    const handler = await loadHandler();
    const res = mockResponse();
    await handler({ method: "POST", query: { id: "proj" } }, res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(mocks.createJob).not.toHaveBeenCalled();
  });

  it("returns 202 { jobId } and kicks off runRegeneration fire-and-forget", async () => {
    const handler = await loadHandler();
    const res = mockResponse();
    await handler({ method: "POST", query: { id: "proj" } }, res);

    expect(mocks.ensureDataDir).toHaveBeenCalledTimes(1);
    expect(mocks.createJob).toHaveBeenCalledWith("proj");
    expect(mocks.runRegeneration).toHaveBeenCalledTimes(1);

    const [job, project, deps] = mocks.runRegeneration.mock.calls[0];
    expect(job.id).toBe("job-123");
    expect(project).toMatchObject({
      id: "proj",
      path: "/resolved//projects/proj",
      jsonPath: "/data/proj.architecture.json",
      htmlPath: "/data/proj-architecture.html",
    });
    expect(typeof deps.analyzer).toBe("function");
    expect(typeof deps.render).toBe("function");
    expect(deps.archifyBin).toMatch(/archify\.mjs$/);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.send).toHaveBeenCalledWith({ jobId: "job-123" });
  });

  it("uses $ARCHIFY_BIN when set", async () => {
    process.env.ARCHIFY_BIN = "/custom/bin/archify.mjs";
    const handler = await loadHandler();
    const res = mockResponse();
    try {
      await handler({ method: "POST", query: { id: "proj" } }, res);
      const [, , deps] = mocks.runRegeneration.mock.calls[0];
      expect(deps.archifyBin).toBe("/custom/bin/archify.mjs");
    } finally {
      delete process.env.ARCHIFY_BIN;
    }
  });
});

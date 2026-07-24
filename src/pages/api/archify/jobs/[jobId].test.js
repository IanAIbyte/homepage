// Handler tests for GET /api/archify/jobs/[jobId].
// Asserts 200 (job found, body echoed) and 404 (unknown jobId).
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getJob } = vi.hoisted(() => ({ getJob: vi.fn() }));

vi.mock("../../../../archify/jobs", () => ({ getJob }));

function mockResponse() {
  const res = {
    statusCode: 200,
    body: undefined,
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
  return (await import("./[jobId].js")).default;
}

describe("pages/api/archify/jobs/[jobId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with the job body when the job exists", async () => {
    const job = { id: "abc", projectId: "proj", status: "done" };
    getJob.mockReturnValue(job);
    const handler = await loadHandler();
    const res = mockResponse();
    await handler({ query: { jobId: "abc" } }, res);
    expect(getJob).toHaveBeenCalledWith("abc");
    expect(res.status).not.toHaveBeenCalledWith(404);
    expect(res.send).toHaveBeenCalledWith(job);
  });

  it("returns 404 when the job is unknown", async () => {
    getJob.mockReturnValue(undefined);
    const handler = await loadHandler();
    const res = mockResponse();
    await handler({ query: { jobId: "nope" } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.send).toHaveBeenCalledWith({ error: "job not found" });
  });
});

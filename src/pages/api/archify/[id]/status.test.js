// Handler tests for GET /api/archify/[id]/status.
// Asserts 404 (unknown project / no widget.path) and 200 (renderState echoed).
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getServiceArchifyPath, inspectArchify, resolveProjectPath } = vi.hoisted(() => ({
  getServiceArchifyPath: vi.fn(),
  inspectArchify: vi.fn(),
  resolveProjectPath: vi.fn(),
}));

vi.mock("../../../../archify/service-config", () => ({ getServiceArchifyPath }));
vi.mock("../../../../archify/status", () => ({ inspectArchify }));
vi.mock("../../../../archify/paths", () => ({ resolveProjectPath }));

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
  return (await import("./status")).default;
}

describe("pages/api/archify/[id]/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when the service id is unknown", async () => {
    getServiceArchifyPath.mockResolvedValue(null);
    const handler = await loadHandler();
    const res = mockResponse();
    await handler({ query: { id: "unknown" } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(inspectArchify).not.toHaveBeenCalled();
  });

  it("returns 200 with the inspected status when the project is known", async () => {
    getServiceArchifyPath.mockResolvedValue("/projects/proj");
    resolveProjectPath.mockReturnValue("/projects/proj");
    const status = { renderState: "ok", htmlMtime: "2026-07-24T00:00:00.000Z" };
    inspectArchify.mockResolvedValue(status);
    const handler = await loadHandler();
    const res = mockResponse();
    await handler({ query: { id: "proj" } }, res);
    expect(inspectArchify).toHaveBeenCalledWith("proj", "/projects/proj");
    expect(res.status).not.toHaveBeenCalledWith(404);
    expect(res.send).toHaveBeenCalledWith(status);
  });

  it("expands ~ in the project path via resolveProjectPath before inspecting", async () => {
    getServiceArchifyPath.mockResolvedValue("~/x");
    resolveProjectPath.mockReturnValue("/expanded/x");
    const status = { renderState: "ok" };
    inspectArchify.mockResolvedValue(status);
    const handler = await loadHandler();
    const res = mockResponse();
    await handler({ query: { id: "proj" } }, res);
    expect(resolveProjectPath).toHaveBeenCalledWith("~/x");
    expect(inspectArchify).toHaveBeenCalledWith("proj", "/expanded/x");
    expect(res.send).toHaveBeenCalledWith(status);
  });
});

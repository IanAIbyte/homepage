// Handler tests for GET /api/archify/[id] (serve diagram HTML, with reuse fallback).
import { beforeEach, describe, expect, it, vi } from "vitest";

const { readFile } = vi.hoisted(() => ({ readFile: vi.fn() }));
const { resolveDiagramHtml } = vi.hoisted(() => ({ resolveDiagramHtml: vi.fn() }));
const { getServiceArchifyPath } = vi.hoisted(() => ({ getServiceArchifyPath: vi.fn() }));
const { resolveProjectPath } = vi.hoisted(() => ({ resolveProjectPath: vi.fn() }));

vi.mock("fs/promises", () => ({ default: { readFile } }));
vi.mock("../../../../archify/status", () => ({ resolveDiagramHtml }));
vi.mock("../../../../archify/paths", () => ({ resolveProjectPath }));
vi.mock("../../../../archify/service-config", () => ({ getServiceArchifyPath }));

function mockResponse() {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader: vi.fn(function setHeader(key, value) { res.headers[key] = value; return res; }),
    status: vi.fn(function status(code) { res.statusCode = code; return res; }),
    send: vi.fn(function send(body) { res.body = body; return res; }),
  };
  return res;
}
async function loadHandler() { vi.resetModules(); return (await import("./index")).default; }

describe("pages/api/archify/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServiceArchifyPath.mockResolvedValue("/configured/path");
    resolveProjectPath.mockReturnValue("/resolved/path");
  });

  it("returns 200 text/html with the file body when a diagram is resolved", async () => {
    resolveDiagramHtml.mockResolvedValue("/proj/rigcraft-architecture.html");
    readFile.mockResolvedValue("<svg>diagram</svg>");
    const handler = await loadHandler();
    const res = mockResponse();
    await handler({ query: { id: "rig-craft" } }, res);
    expect(resolveDiagramHtml).toHaveBeenCalledWith("rig-craft", "/resolved/path");
    expect(readFile).toHaveBeenCalledWith("/proj/rigcraft-architecture.html");
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/html");
    expect(res.send).toHaveBeenCalledWith("<svg>diagram</svg>");
  });

  it("returns 404 'no diagram' when resolveDiagramHtml is null (none in data or project dir)", async () => {
    resolveDiagramHtml.mockResolvedValue(null);
    const handler = await loadHandler();
    const res = mockResponse();
    await handler({ query: { id: "rig-craft" } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.send).toHaveBeenCalledWith({ error: "no diagram" });
    expect(readFile).not.toHaveBeenCalled();
  });

  it("returns 404 'unknown project' when the service has no archify path", async () => {
    getServiceArchifyPath.mockResolvedValue(null);
    const handler = await loadHandler();
    const res = mockResponse();
    await handler({ query: { id: "nope" } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.send).toHaveBeenCalledWith({ error: "unknown project" });
    expect(resolveDiagramHtml).not.toHaveBeenCalled();
  });
});

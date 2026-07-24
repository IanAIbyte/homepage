// Handler tests for GET /api/archify/[id] (serve generated HTML).
// Asserts 200 text/html (file present) and 404 (no diagram yet).
import { beforeEach, describe, expect, it, vi } from "vitest";

const { readFile } = vi.hoisted(() => ({ readFile: vi.fn() }));
const { htmlPath } = vi.hoisted(() => ({ htmlPath: vi.fn() }));
const { getServiceArchifyPath } = vi.hoisted(() => ({ getServiceArchifyPath: vi.fn() }));

vi.mock("fs/promises", () => ({ default: { readFile } }));
vi.mock("../../../../archify/paths", () => ({ htmlPath }));
vi.mock("../../../../archify/service-config", () => ({ getServiceArchifyPath }));

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
  return (await import("./index")).default;
}

describe("pages/api/archify/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    htmlPath.mockImplementation((id) => `/data/${id}-architecture.html`);
    getServiceArchifyPath.mockResolvedValue("/configured/path");
  });

  it("returns 200 text/html with the file body when the diagram exists", async () => {
    readFile.mockResolvedValue("<svg>diagram</svg>");
    const handler = await loadHandler();
    const res = mockResponse();
    await handler({ query: { id: "proj" } }, res);
    expect(htmlPath).toHaveBeenCalledWith("proj");
    expect(readFile).toHaveBeenCalledWith("/data/proj-architecture.html");
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/html");
    expect(res.send).toHaveBeenCalledWith("<svg>diagram</svg>");
  });

  it("returns 404 when the diagram file is missing", async () => {
    readFile.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    const handler = await loadHandler();
    const res = mockResponse();
    await handler({ query: { id: "missing" } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.send).toHaveBeenCalledWith({ error: "no diagram" });
  });

  it("returns 404 for unknown project ids and prevents path traversal", async () => {
    getServiceArchifyPath.mockResolvedValue(null);
    const handler = await loadHandler();
    const res = mockResponse();
    await handler({ query: { id: "../../etc/foo" } }, res);
    expect(getServiceArchifyPath).toHaveBeenCalledWith("../../etc/foo");
    expect(readFile).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.send).toHaveBeenCalledWith({ error: "unknown project" });
  });
});

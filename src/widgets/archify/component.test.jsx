// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "test-utils/render-with-providers";
import Component from "./component";

vi.stubGlobal("fetch", vi.fn(async (url) => ({
  json: async () => (url.includes("/status") ? { renderState: "stale" } : { jobId: "j1" }),
})));

describe("widgets/archify/component", () => {
  it("renders the status pill from /status", async () => {
    const { findByText } = renderWithProviders(<Component service={{ name: "rig-craft" }} />, { settings: { hideErrors: false } });
    expect(await findByText(/stale/)).toBeTruthy();
  });
});

import { afterEach, expect, it, vi } from "vitest";
vi.mock("@tarojs/taro", () => ({
  default: {
    nextTick: (callback: () => void) => callback(),
    getCurrentInstance: () => ({ page: { route: "creation/editor/index" } }),
  },
}));
import { canvasSurface } from "./canvas";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function queryWith(exec: (callback: (rows: unknown[]) => void) => void) {
  const query = { in: vi.fn(), select: vi.fn(), fields: vi.fn(), exec };
  query.in.mockReturnValue(query);
  query.select.mockReturnValue(query);
  query.fields.mockReturnValue(query);
  vi.stubGlobal("wx", { createSelectorQuery: () => query });
  return query;
}
it("waits for a delayed native surface and scopes every query to the initiating page", async () => {
  vi.useFakeTimers();
  let calls = 0;
  const node = { width: 300, height: 150 };
  const query = queryWith((callback) =>
    callback(++calls < 3 ? [null] : [{ node, width: 390, height: 561 }]),
  );
  const task = canvasSurface("editor-canvas");
  await vi.advanceTimersByTimeAsync(150);
  expect(await task).toEqual({ node, width: 390, height: 561 });
  expect(query.in).toHaveBeenCalledTimes(3);
  expect(query.in).toHaveBeenCalledWith({ route: "creation/editor/index" });
});
it("stops retrying a missing native surface", async () => {
  vi.useFakeTimers();
  const query = queryWith((callback) => callback([null]));
  const rejection = expect(canvasSurface("missing")).rejects.toThrow(
    "画布尚未准备好",
  );
  await vi.advanceTimersByTimeAsync(1100);
  await rejection;
  expect(query.in).toHaveBeenCalledTimes(20);
});

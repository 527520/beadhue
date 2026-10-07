import { afterEach, expect, it, vi } from "vitest";

const getImageInfo = vi.hoisted(() => vi.fn());
vi.mock("@tarojs/taro", () => ({ default: { getImageInfo } }));
import { readImage } from "./images";

afterEach(() => vi.unstubAllGlobals());
it("keeps bundled image paths rooted when getImageInfo returns a relative local path", async () => {
  getImageInfo.mockResolvedValue({
    path: "assets/rainbow.png",
    width: 800,
    height: 800,
    type: "png",
    orientation: "up",
  });
  const read = vi.fn(() => new Uint8Array([1, 2, 3]).buffer);
  vi.stubGlobal("wx", { getFileSystemManager: () => ({ readFileSync: read }) });
  const image = await readImage("/assets/rainbow.png");
  expect(image.path).toBe("/assets/rainbow.png");
  expect(read).toHaveBeenCalledWith("/assets/rainbow.png");
});
it("preserves native temporary file paths", async () => {
  const local = "http://tmp/chosen.png";
  getImageInfo.mockResolvedValue({
    path: local,
    width: 30,
    height: 30,
    type: "png",
    orientation: "up",
  });
  vi.stubGlobal("wx", {
    getFileSystemManager: () => ({
      readFileSync: () => new Uint8Array([1]).buffer,
    }),
  });
  expect((await readImage(local)).path).toBe(local);
});

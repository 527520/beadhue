import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT_GENERATION_PARAMS } from "@beadhue/core/types";
import type { WorkerTask } from "./tasks";

afterEach(() => vi.unstubAllGlobals());
it("sends generated colors through a native transport that rejects repeated object references", async () => {
  let receive!: (value: { id: number; task: WorkerTask }) => Promise<void>;
  const messages: Array<{ id: number; result?: unknown; error?: string }> = [];
  vi.stubGlobal("worker", {
    onMessage: (callback: typeof receive) => {
      receive = callback;
    },
    postMessage: (message: (typeof messages)[number]) => {
      const seen = new Set<object>();
      function visit(value: unknown) {
        if (!value || typeof value !== "object") return;
        if (seen.has(value))
          throw new Error("worker postMessage object occur circular reference");
        seen.add(value);
        Object.values(value).forEach(visit);
      }
      visit(message);
      messages.push(message);
    },
  });
  await import("./index");
  await receive({
    id: 7,
    task: {
      kind: "generate",
      width: 2,
      height: 2,
      rgba: "ff0000ff".repeat(4),
      params: {
        ...DEFAULT_GENERATION_PARAMS,
        targetWidth: 20,
        targetColorCount: 2,
      },
      selection: { palette: { kind: "builtin", brand: "MARD" }, kitTier: 0 },
    },
  });
  expect(messages).toHaveLength(1);
  expect(messages[0]).toMatchObject({
    id: 7,
    result: { pattern: { width: 20, height: 20 } },
  });
});

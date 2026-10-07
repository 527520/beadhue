import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";

afterEach(() => {
  vi.unstubAllGlobals();
  z.config({ jitless: false });
});
it("validates project-like objects when native Function cannot run generated code", async () => {
  vi.stubGlobal("Function", function () {
    return {};
  });
  await import("./validation");
  const cell = z.object({ hex: z.string(), code: z.string() });
  const schema = z.object({ name: z.string(), cells: z.array(cell) });
  const value = { name: "验收设计", cells: [{ hex: "#FF0000", code: "A1" }] };
  expect(schema.safeParse(value)).toMatchObject({ success: true, data: value });
  expect(schema.safeParse({ ...value, name: 4 }).success).toBe(false);
});

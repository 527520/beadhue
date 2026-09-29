import { z } from "zod";
import { parseProjectFileValue } from "@/lib/schemas";
import { ApiError } from "./clientAdapter";

const cloudDesignMetaSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  width: z.number().int().min(0),
  height: z.number().int().min(0),
  updatedAt: z.string().datetime(),
  deleted: z.boolean(),
  revision: z.number().int().positive(),
});
export const cloudDesignPageSchema = z.object({
  items: z.array(cloudDesignMetaSchema),
  nextCursor: z.string().min(1).nullable(),
});
const compatibleProjectFileSchema = z.unknown().transform((value, ctx) => {
  const parsed = parseProjectFileValue(value);
  if (parsed.ok) return parsed.value;
  ctx.addIssue({ code: "custom", message: parsed.errors.join("; ") });
  return z.NEVER;
});
export const cloudDesignFullSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  project: compatibleProjectFileSchema,
  updatedAt: z.string().datetime(),
  revision: z.number().int().positive(),
  deleted: z.boolean().optional(),
});
export const revisionResponseSchema = z.object({
  updatedAt: z.string().datetime(),
  revision: z.number().int().positive(),
});

export function parseCloudResponse<T>(
  schema: z.ZodType<T>,
  payload: unknown,
): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success)
    throw new ApiError(502, "INVALID_RESPONSE", "云端返回了不兼容的数据");
  return parsed.data;
}

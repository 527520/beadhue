import { LIMITS } from "@/lib/appInfo";
import { AppError } from "@/lib/errors";

/** Call only after authentication, resource eligibility and the upload limiter. */
export async function readOriginalBody(request: Request): Promise<Uint8Array> {
  const tooLarge = () =>
    new AppError("PAYLOAD_TOO_LARGE", "原图超过 20 MB 上限");
  if (Number(request.headers.get("content-length")) > LIMITS.maxFileBytes)
    throw tooLarge();
  if (!request.body) throw new AppError("VALIDATION", "原图为空", "original");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > LIMITS.maxFileBytes) {
        await reader.cancel();
        throw tooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!length) throw new AppError("VALIDATION", "原图为空", "original");
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

import { incrementRateLimit, type AnyDatabase } from "@/../db/client";
import { clientIp } from "@/lib/auth/rateLimit";
import { config } from "@/lib/config";
import { AppError } from "@/lib/errors";

/** Shared by every original-image binary endpoint, including official uploads. */
export async function enforceOriginalUploadLimit(
  db: AnyDatabase,
  input: {
    userId: string;
    request: Request;
    now?: Date;
  },
): Promise<void> {
  const now = input.now ?? new Date();
  const ip = clientIp(input.request);
  const limits = config.security;
  const windows = [
    {
      key: `original:user:minute:${input.userId}`,
      duration: 60_000,
      limit: limits.originalUserMinute,
    },
    {
      key: `original:user:hour:${input.userId}`,
      duration: 3_600_000,
      limit: limits.originalUserHour,
    },
    {
      key: `original:ip:minute:${ip}`,
      duration: 60_000,
      limit: limits.originalIpMinute,
    },
    {
      key: `original:ip:hour:${ip}`,
      duration: 3_600_000,
      limit: limits.originalIpHour,
    },
  ];
  // Commit counters even for rejected requests. Never throw inside this transaction:
  // otherwise an error would roll back failed attempts and permit unlimited retries.
  const retryAfter = await db.transaction(async (tx) => {
    let wait = 0;
    for (const window of windows) {
      const start =
        Math.floor(now.getTime() / window.duration) * window.duration;
      const count = await incrementRateLimit(tx, window.key, new Date(start));
      if (count > window.limit)
        wait = Math.max(
          wait,
          Math.ceil((start + window.duration - now.getTime()) / 1000),
        );
    }
    return wait;
  });
  if (retryAfter > 0)
    throw new AppError(
      "RATE_LIMITED",
      "原图上传较频繁，请等待后重试",
      "original",
      retryAfter,
    );
}

import { AsyncLocalStorage } from "node:async_hooks";
import type { ResolvedSession } from "@/lib/auth/session";

/** Only the API boundary can establish this server-owned, request-local context. */
export const miniRequestContext = new AsyncLocalStorage<{
  request: Request;
  session: ResolvedSession | null;
}>();

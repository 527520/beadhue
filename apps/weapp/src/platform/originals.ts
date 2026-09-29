import { parseStoredProject } from "@beadhue/core/storage";
import { storageFor } from "./designs";
import { wxFiles } from "./files";
import { request, session } from "./network";
export async function synchronizeOriginals(): Promise<string[]> {
  const s = session();
  if (!s?.emailVerified) return [];
  const store = storageFor(`user-${s.userId}`),
    files = wxFiles(`user-${s.userId}`);
  const errors: string[] = [];
  for (const record of await store.getAll()) {
    const project = parseStoredProject(record.projectJson);
    if (
      !project?.original ||
      project.original.assetId ||
      !record.revision ||
      record.syncState !== "synced"
    )
      continue;
    let bytes: ArrayBuffer;
    try {
      bytes = files.bytes(`original-${project.original.sha256}.bin`);
    } catch {
      continue;
    }
    try {
      const asset = await request<{ assetId: string; sha256: string }>(
        `/api/designs/${record.id}/original`,
        {
          method: "PUT",
          binary: true,
          data: bytes,
          token: s.token,
          headers: { "If-Match": String(record.revision) },
        },
      );
      const current = (await store.getAll()).find((r) => r.id === record.id);
      if (!current || current.projectJson !== record.projectJson) continue;
      const next = {
        ...project,
        original: { ...project.original, assetId: asset.assetId },
      };
      const response = await request<{ revision: number; updatedAt: string }>(
        `/api/designs/${record.id}`,
        {
          method: "PUT",
          data: {
            name: record.name,
            project: next,
            baseRevision: record.revision,
          },
          token: s.token,
        },
      );
      const latest = (await store.getAll()).find((r) => r.id === record.id);
      if (!latest || latest.projectJson !== record.projectJson) continue;
      await store.put({
        ...record,
        projectJson: JSON.stringify(next),
        revision: response.revision,
        updatedAt: response.updatedAt,
        syncState: "synced",
      });
    } catch (error) {
      errors.push(
        `${record.name}：${error instanceof Error ? error.message : "上传失败"}`,
      );
    }
  }
  return errors;
}

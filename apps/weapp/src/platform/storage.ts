import {
  isValidLocalGenerationSource,
  parseStoredProject,
  StorageError,
  type DesignRecord,
  type StorageAdapter,
  type LocalGenerationSourceV1,
  type GenerationSourceWrite,
} from "@beadhue/core/storage";
import { parseStitchProgress, type StitchProgress } from "@beadhue/core/stitch";
import type { FilePort } from "./files";

interface Entry {
  record: string;
  source?: { path: string; width: number; height: number };
}
interface Index {
  version: 1;
  sequence: number;
  designs: Record<string, Entry>;
  meta: Record<string, string>;
  progress: Record<string, string>;
}
const fresh = (): Index => ({
  version: 1,
  sequence: 0,
  designs: {},
  meta: {},
  progress: {},
});

/** Immutable data files + immutable commit records: a rename publishes one complete generation.
 * Keep the two most recent valid generations for crash recovery. Never evict unsynced designs. */
export function openFileStorage(files: FilePort): StorageAdapter {
  let index = fresh();
  const commits = files
    .list()
    .filter((n) => /^commit-\d+\.json$/.test(n))
    .sort((a, b) => Number(b.slice(7, -5)) - Number(a.slice(7, -5)));
  function readValidCommit(name: string): Index | null {
    try {
      const value: Index = JSON.parse(files.read(name));
      if (
        value.version !== 1 ||
        !Number.isSafeInteger(value.sequence) ||
        value.sequence !== Number(name.slice(7, -5)) ||
        !value.designs ||
        !value.meta ||
        !value.progress
      )
        return null;
      for (const entry of Object.values(value.designs)) {
        const record: DesignRecord = JSON.parse(files.read(entry.record));
        if (!parseStoredProject(record.projectJson)) return null;
        if (
          entry.source &&
          !isValidLocalGenerationSource({
            version: 1,
            width: entry.source.width,
            height: entry.source.height,
            rgba: files.bytes(entry.source.path),
          })
        )
          return null;
      }
      for (const path of Object.values(value.progress)) {
        const raw = JSON.parse(files.read(path));
        if (!parseStitchProgress({ ...raw, done: new Uint8Array(raw.done) }))
          return null;
      }
      return value;
    } catch {
      return null;
    }
  }
  for (const name of commits) {
    const value = readValidCommit(name);
    if (value) {
      index = value;
      break;
    }
  }
  if (commits.length && !index.sequence)
    throw new StorageError(
      "UNKNOWN",
      "设计存储需要恢复，请保留本地文件并联系支持",
    );
  let queue: Promise<void> = Promise.resolve();
  let counter = 0;
  const unique = (suffix: string) =>
    `${Date.now()}-${++counter}-${Math.random().toString(36).slice(2)}.${suffix}`;
  const write = (value: string | ArrayBuffer, suffix: string): string => {
    const name = unique(suffix);
    files.write(`${name}.tmp`, value);
    files.rename(`${name}.tmp`, name);
    return name;
  };
  const transact = (mutate: (next: Index) => void): Promise<void> => {
    const run = queue.then(() => {
      const next: Index = JSON.parse(JSON.stringify(index));
      // Start beyond damaged commits too, so recovery never overwrites an existing file.
      next.sequence =
        Math.max(
          index.sequence,
          ...commits.map((n) => Number(n.slice(7, -5))),
          0,
        ) + 1;
      try {
        mutate(next);
        const name = `commit-${next.sequence}.json`;
        files.write(`${name}.tmp`, JSON.stringify(next));
        files.rename(`${name}.tmp`, name);
        index = next;
        // Only garbage collect files proven unreachable from BOTH last successful commits.
        const retained = files
          .list()
          .filter((n) => /^commit-\d+\.json$/.test(n))
          .sort((a, b) => Number(b.slice(7, -5)) - Number(a.slice(7, -5)))
          .filter((n) => {
            const value = readValidCommit(n);
            return value !== null && value.sequence <= index.sequence;
          })
          .slice(0, 2);
        const live = new Set(retained);
        for (const commit of retained) {
          const value: Index = JSON.parse(files.read(commit));
          for (const e of Object.values(value.designs)) {
            live.add(e.record);
            if (e.source) live.add(e.source.path);
          }
          Object.values(value.progress).forEach((n) => live.add(n));
        }
        for (const name of files.list())
          if (!live.has(name) && /^(commit-|\d+-)/.test(name)) {
            try {
              files.remove(name);
            } catch {
              /* Cleanup is best effort after commit. */
            }
          }
      } catch (error) {
        if (error instanceof StorageError) throw error;
        throw new StorageError(
          "UNKNOWN",
          "保存失败，原有设计仍保留。请释放空间后重试或导出当前项目",
        );
      }
    });
    queue = run.catch(() => undefined);
    return run;
  };
  return {
    async getAll() {
      await queue;
      return Object.values(index.designs)
        .map((e) => JSON.parse(files.read(e.record)) as DesignRecord)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async getGenerationSource(id) {
      await queue;
      const s = index.designs[id]?.source;
      return s
        ? {
            version: 1,
            width: s.width,
            height: s.height,
            rgba: files.bytes(s.path),
          }
        : null;
    },
    put(
      record: DesignRecord,
      sourceWrite: GenerationSourceWrite = { mode: "preserve" },
    ) {
      if (
        !/^[a-f0-9-]{36}$/.test(record.id) ||
        !parseStoredProject(record.projectJson)
      )
        return Promise.reject(new StorageError("UNKNOWN", "项目格式无效"));
      return transact((next) => {
        let source = next.designs[record.id]?.source;
        if (sourceWrite.mode === "clear") source = undefined;
        if (sourceWrite.mode === "replace") {
          const s: LocalGenerationSourceV1 = sourceWrite.source;
          if (!isValidLocalGenerationSource(s))
            throw new StorageError("UNKNOWN", "生成源格式无效");
          source = {
            path: write(s.rgba, "rgba"),
            width: s.width,
            height: s.height,
          };
        }
        next.designs[record.id] = {
          record: write(JSON.stringify(record), "json"),
          ...(source ? { source } : {}),
        };
      });
    },
    delete: (id) =>
      transact((next) => {
        delete next.designs[id];
        delete next.progress[id];
      }),
    async getMeta(key) {
      await queue;
      return index.meta[key] ?? null;
    },
    setMeta: (key, value) =>
      transact((next) => {
        next.meta[key] = value;
      }),
    async getStitchProgress(id) {
      await queue;
      const path = index.progress[id];
      if (!path) return null;
      const raw = JSON.parse(files.read(path));
      return parseStitchProgress({ ...raw, done: new Uint8Array(raw.done) });
    },
    putStitchProgress: (id, progress: StitchProgress) =>
      transact((next) => {
        next.progress[id] = write(
          JSON.stringify({ ...progress, done: Array.from(progress.done) }),
          "json",
        );
      }),
    deleteStitchProgress: (id) =>
      transact((next) => {
        delete next.progress[id];
      }),
  };
}

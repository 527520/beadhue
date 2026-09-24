'use client';

/**
 * 设计库的数据与同步（沿用旧 DesignsView 的逻辑，界面在 designs-panel 重写）：
 * 本机 IndexedDB + 云端合并、登录后自动同步（CAS）、冲突副本、打开前确认本机图纸与跟拼进度、
 * 重命名 / 删除（先删云端再删本机，本机墓碑防复活），并补上复制、导出项目文件、跟拼进度与「已公开」。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { track } from '@/lib/analytics/client';
import { LIMITS } from '@/lib/appInfo';
import { isProgressCompatible, summarizeProgress } from '@/lib/progress/stitchProgress';
import { conflictName } from '@/lib/project/parse';
import { projectFileName, serializeProject } from '@/lib/project/serialize';
import {
  CLEAR_GENERATION_SOURCE,
  createDesignRecord,
  newDesignId,
  openIndexedDb,
  parseStoredProject,
  replaceGenerationSource,
  type DesignRecord,
  type StorageAdapter,
} from '@/lib/storage';
import { createBeadhueApi, type BeadhueApi, type MeInfo } from '@/lib/sync/api';
import { ApiError, createSyncClient, type CloudDesignMeta, type SyncClient } from '@/lib/sync/clientAdapter';
import { enqueueDesignSync, withDesignStorageLock } from '@/lib/sync/queue';
import type { ProjectFile } from '@/lib/types';
import { zhCN } from '@/messages/zh-CN';
import { countColors, type LibraryDesign, type SyncStatus } from './design-model';

const t = zhCN.me.designs;

export type ActionResult = { ok: true; name?: string } | { ok: false; message: string };

export interface DesignLibraryOptions {
  storageOverride?: StorageAdapter | null;
  apiOverride?: BeadhueApi;
  /** 当前正在公开的豆社作品的来源设计（登录后读 /api/community/works/mine）；测试可注入。 */
  loadPublishedIds?: () => Promise<ReadonlySet<string>>;
}

interface OwnWorkShape {
  lifecycleStatus?: string;
  currentPublishedRevisionId?: string | null;
  revisions?: Array<{ id: string; sourceDesignId?: string | null }>;
}

export async function fetchPublishedDesignIds(): Promise<ReadonlySet<string>> {
  const response = await fetch('/api/community/works/mine', { cache: 'no-store' });
  if (!response.ok) return new Set();
  const body = (await response.json().catch(() => null)) as { items?: OwnWorkShape[] } | null;
  const ids = new Set<string>();
  for (const work of body?.items ?? []) {
    if (work.lifecycleStatus !== 'active' || !work.currentPublishedRevisionId) continue;
    const source = work.revisions?.find((revision) => revision.id === work.currentPublishedRevisionId)?.sourceDesignId;
    if (source) ids.add(source);
  }
  return ids;
}

type ProjectMap = ReadonlyMap<string, ProjectFile | null>;

function parseAll(records: DesignRecord[]): ProjectMap {
  return new Map(records.map((record) => [record.id, parseStoredProject(record.projectJson)]));
}

function buildLibrary(
  local: DesignRecord[],
  projects: ProjectMap,
  cloud: CloudDesignMeta[],
  meInfo: MeInfo,
  conflicts: readonly string[],
  progress: ReadonlyMap<string, number>,
  published: ReadonlySet<string>,
): LibraryDesign[] {
  const map = new Map<string, LibraryDesign>();
  for (const meta of cloud) {
    // 云端墓碑只参与同步 LWW，不显示在列表里
    if (meta.deleted) continue;
    map.set(meta.id, {
      id: meta.id, name: meta.name, width: meta.width, height: meta.height, updatedAt: meta.updatedAt, revision: meta.revision,
      localPresent: false, cloudPresent: true, status: 'synced', pattern: null, colorCount: null, progress: null, published: published.has(meta.id),
    });
  }
  for (const record of local) {
    const project = projects.get(record.id) ?? null;
    const cloudEntry = map.get(record.id);
    let status: SyncStatus;
    if (conflicts.includes(record.id) || record.syncState === 'conflict') status = 'conflict';
    else if (!cloudEntry) status = meInfo.state === 'verified' ? 'unsynced' : 'localOnly';
    else if (record.syncState === 'dirty') status = 'unsynced';
    else status = 'synced';
    map.set(record.id, {
      id: record.id,
      name: record.name,
      width: project?.pattern.width ?? 0,
      height: project?.pattern.height ?? 0,
      updatedAt: record.updatedAt,
      revision: Math.max(record.revision ?? 0, cloudEntry?.revision ?? 0),
      localPresent: true,
      cloudPresent: Boolean(cloudEntry),
      status,
      pattern: project?.pattern ?? null,
      colorCount: project ? countColors(project.pattern) : null,
      progress: progress.get(record.id) ?? null,
      published: published.has(record.id),
    });
  }
  return [...map.values()].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

async function readProgress(storage: StorageAdapter, records: DesignRecord[], projects: ProjectMap): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  await Promise.all(records.map(async (record) => {
    const project = projects.get(record.id);
    if (!project) return;
    const progress = await storage.getStitchProgress(record.id).catch(() => null);
    if (!isProgressCompatible(progress, project.pattern)) return;
    const summary = summarizeProgress(progress, project.pattern.cells);
    if (summary.doneCount > 0) result.set(record.id, wholePercent(summary.percent));
  }));
  return result;
}

/** 卡片与列表只显示整数百分比：向下取整（没拼完不显示 100%），拼了几颗但不足 1% 时显示 1%。 */
function wholePercent(percent: number): number {
  return percent > 0 && percent < 1 ? 1 : Math.floor(percent);
}

function downloadText(text: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_500);
  }
}

export function useDesignLibrary({ storageOverride, apiOverride, loadPublishedIds = fetchPublishedDesignIds }: DesignLibraryOptions = {}) {
  const router = useRouter();
  const [api] = useState<BeadhueApi>(() => apiOverride ?? createBeadhueApi());
  const [storage, setStorage] = useState<StorageAdapter | null | undefined>(undefined);
  const [syncClient, setSyncClient] = useState<SyncClient | null>(null);
  const [me, setMe] = useState<MeInfo | 'loading'>('loading');
  const [designs, setDesigns] = useState<LibraryDesign[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(0);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cloudFailed, setCloudFailed] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const openingRef = useRef(false);
  const [mutating, setMutating] = useState(false);
  const mutationRef = useRef(false);
  const loadCancelRef = useRef<{ value: boolean } | null>(null);
  const publishedRef = useRef(loadPublishedIds);
  useEffect(() => {
    publishedRef.current = loadPublishedIds;
  });

  const load = useCallback(async () => {
    // StrictMode 安全：dev 双调用 effect 时第一次被 cleanup 取消，避免两个 load 并发交错同步。
    const cancelled = { value: false };
    loadCancelRef.current = cancelled;
    setError(null);
    setCloudFailed(false);
    setSyncing(true);
    try {
      const st = storageOverride !== undefined ? storageOverride : await openIndexedDb().catch(() => null);
      if (cancelled.value) return;
      setStorage(st);
      const client = st ? createSyncClient(st, api) : null;
      setSyncClient(client);

      const [meInfo, localRecords] = await Promise.all([
        api.me().catch((): MeInfo => ({ state: 'guest' })),
        st ? st.getAll() : Promise.reject(new Error('local storage unavailable')),
      ]);
      if (cancelled.value) return;
      setMe(meInfo);

      const publishedPromise: Promise<ReadonlySet<string>> = meInfo.state === 'verified'
        ? publishedRef.current().catch(() => new Set<string>())
        : Promise.resolve(new Set<string>());
      let cloud: CloudDesignMeta[] = [];
      let conflictIds: string[] = [];
      let refreshedLocal = localRecords;
      if (meInfo.state === 'verified' && st && client) {
        try {
          // 与工作台共用同一条同步单线，SPA 跳转时不会重复 PUT 同一个 baseRevision。
          const outcome = await enqueueDesignSync(st, api);
          if (!outcome) throw new Error('sync did not start for a verified account');
          conflictIds = outcome.conflictCopies.map((conflict) => conflict.conflictId);
          cloud = outcome.cloud;
          // 同步可能改写本地存储（拉取覆盖 / 采纳服务端时间戳），重新读取后再构建列表
          refreshedLocal = await st.getAll().catch(() => localRecords);
        } catch {
          setCloudFailed(true);
          cloud = await api.listDesigns().catch(() => []);
        }
      }
      const projects = parseAll(refreshedLocal);
      const [published, progress] = await Promise.all([publishedPromise, st ? readProgress(st, refreshedLocal, projects) : new Map<string, number>()]);
      if (cancelled.value) return;
      setConflicts(conflictIds);
      setDesigns(buildLibrary(refreshedLocal, projects, cloud, meInfo, conflictIds, progress, published));
      setNow(Date.now());
      setLoaded(true);
    } catch {
      if (!cancelled.value) setError(t.loadFailed);
    } finally {
      if (!cancelled.value) setSyncing(false);
    }
  }, [api, storageOverride]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => {
      window.clearTimeout(timer);
      if (loadCancelRef.current) loadCancelRef.current.value = true;
    };
  }, [load]);

  /** 本机没有时先从云端拉取；读不出严格 v3 图纸就失败，不拿空白图纸替代。 */
  const ensureLocal = useCallback(async (id: string): Promise<{ project: ProjectFile; record: DesignRecord } | null> => {
    try {
      if (!storage || !syncClient) throw new Error('local storage unavailable');
      return await withDesignStorageLock(async () => {
        let record = (await storage.getAll()).find((item) => item.id === id);
        if (!record) {
          await syncClient.pullDesign(id);
          record = (await storage.getAll()).find((item) => item.id === id);
        }
        const project = record && parseStoredProject(record.projectJson);
        if (!record || !project) throw new Error('design missing or unreadable');
        return { project, record };
      });
    } catch {
      return null;
    }
  }, [storage, syncClient]);

  const open = useCallback(async (design: LibraryDesign): Promise<void> => {
    if (openingRef.current || mutationRef.current) return;
    openingRef.current = true;
    setOpening(design.id);
    setError(null);
    try {
      const local = await ensureLocal(design.id);
      if (!local || !storage) throw new Error('design unavailable');
      const progress = await storage.getStitchProgress(design.id);
      const continued = isProgressCompatible(progress, local.project.pattern)
        && summarizeProgress(progress, local.project.pattern.cells).doneCount > 0;
      router.push(`/app?id=${encodeURIComponent(design.id)}&mode=${continued ? 'stitch' : 'edit'}`);
      // 导航完成前保持打开中：重复点击不能再下载或再次跳转。
    } catch {
      openingRef.current = false;
      setOpening(null);
      setError(t.openFailed);
    }
  }, [ensureLocal, router, storage]);

  const mutate = useCallback(async (run: () => Promise<ActionResult>): Promise<ActionResult> => {
    if (mutationRef.current || openingRef.current) return { ok: false, message: zhCN.me.actionFailed };
    mutationRef.current = true;
    setMutating(true);
    try {
      return await run();
    } catch {
      return { ok: false, message: zhCN.me.actionFailed };
    } finally {
      mutationRef.current = false;
      setMutating(false);
    }
  }, []);

  const rename = useCallback((design: LibraryDesign, value: string) => mutate(async () => {
    const name = value.trim();
    if (!name || name.length > LIMITS.designNameLength) return { ok: false, message: t.renameRequired };
    const local = await ensureLocal(design.id);
    if (!local || !syncClient) return { ok: false, message: t.openFailed };
    await withDesignStorageLock(() => syncClient.renameLocal(design.id, name, new Date().toISOString()));
    await load();
    return { ok: true, name };
  }), [ensureLocal, load, mutate, syncClient]);

  const verified = me !== 'loading' && me.state === 'verified';
  const duplicate = useCallback((design: LibraryDesign) => mutate(async () => {
    // 云端每个账号最多 100 份设计；本机不设上限（游客照常复制）。
    if (verified && designs.length >= LIMITS.designsPerUser) return { ok: false, message: t.limit };
    const local = await ensureLocal(design.id);
    if (!local || !storage) return { ok: false, message: t.openFailed };
    const name = await withDesignStorageLock(async () => {
      const names = (await storage.getAll()).map((record) => record.name);
      const copyName = conflictName(t.copyName(design.name), names);
      const now = new Date().toISOString();
      const source = await storage.getGenerationSource(design.id).catch(() => null);
      // 副本是一张独立的新设计：新 ID、未同步、不带跟拼进度；本机原图随之复制，云端原图沿用同一份。
      await storage.put(
        createDesignRecord(newDesignId(), { ...local.project, name: copyName, createdAt: now, updatedAt: now }, local.record.thumbnail),
        source ? replaceGenerationSource(source) : CLEAR_GENERATION_SOURCE,
      );
      return copyName;
    });
    await load();
    return { ok: true, name };
  }), [designs.length, ensureLocal, load, mutate, storage, verified]);

  const exportFile = useCallback(async (design: LibraryDesign): Promise<ActionResult> => {
    const local = await ensureLocal(design.id);
    if (!local) return { ok: false, message: t.openFailed };
    try {
      downloadText(serializeProject(local.project), projectFileName(local.project.name));
      track({ name: 'design_exported', properties: { format: 'project', source: 'other' } });
      return { ok: true };
    } catch {
      track({ name: 'export_failed', properties: { format: 'project', errorCode: 'PROJECT_EXPORT_FAILED' } });
      return { ok: false, message: t.exportFailed };
    }
  }, [ensureLocal]);

  const remove = useCallback((design: LibraryDesign) => mutate(async () => {
    const st = storage;
    const client = syncClient ?? (st ? createSyncClient(st, api) : null);
    const nowIso = new Date().toISOString();
    if (st) {
      const local = (await st.getAll()).find((record) => record.id === design.id);
      const identity = await api.me().catch((): MeInfo => ({ state: 'guest' }));
      const verified = identity.state === 'verified';
      // 列表的修订号是加载时的快照，之后落地的自动保存会把云端推到下一版，所以已登录时再看一眼本机记录。
      let cloudRevision = Math.max(design.cloudPresent ? design.revision : 0, verified ? local?.revision ?? 0 : 0);
      if (cloudRevision <= 0 && verified) {
        let current = await api.getDesign(design.id);
        if (!current) {
          // 上一页发起的保存可能还在路上：先跑完一轮完整同步，再确认它真的只在本机。
          await enqueueDesignSync(st, api);
          current = await api.getDesign(design.id);
        }
        cloudRevision = current?.revision ?? 0;
      }
      if (cloudRevision > 0) {
        // 用户确认的在线删除是条件写：先提交云端 CAS 删除，再删本机，避免迟到的同步把它复活。
        try {
          await api.deleteDesign(design.id, cloudRevision);
        } catch (error) {
          if (!(error instanceof ApiError) || error.code !== 'REVISION_CONFLICT') throw error;
          await load();
          return { ok: false, message: t.deleteConflict };
        }
        await withDesignStorageLock(() => st.delete(design.id));
      } else if (client) {
        // 只在本机的设计同样写持久墓碑，下次同步发现旧云端修订也不会悄悄复活。
        await withDesignStorageLock(() => client.deleteLocal(design.id, nowIso, local?.revision ?? design.revision));
      }
    } else {
      await api.deleteDesign(design.id, design.revision);
    }
    await load();
    return { ok: true, name: design.name };
  }), [api, load, mutate, storage, syncClient]);

  const retrySync = useCallback(async (): Promise<void> => {
    setSyncing(true);
    try {
      if (storage) await enqueueDesignSync(storage, api);
    } catch {
      setCloudFailed(true);
    }
    setSyncing(false);
    await load();
  }, [api, load, storage]);

  return {
    me,
    verified,
    designs,
    loaded,
    now,
    conflicts,
    error,
    cloudFailed,
    syncing,
    opening,
    mutating,
    load,
    open,
    rename,
    duplicate,
    exportFile,
    remove,
    retrySync,
    clearError: () => setError(null),
  };
}

export type DesignLibrary = ReturnType<typeof useDesignLibrary>;

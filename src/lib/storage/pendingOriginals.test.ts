// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  discardPendingOriginal, lookupOriginalSource, putPendingOriginal, rememberOriginalSource, takePendingOriginal,
} from './pendingOriginals';

function record(designId: string, overrides: Partial<{ createdAt: number; sourceRevisionId: string }> = {}) {
  return {
    designId, bytes: new ArrayBuffer(3), type: 'png' as const, name: 'photo.png',
    createdAt: overrides.createdAt ?? Date.now(), ...(overrides.sourceRevisionId ? { sourceRevisionId: overrides.sourceRevisionId } : {}),
  };
}

/** 直接用 IndexedDB 写入一条带旧时间戳的记录（putPendingOriginal 总会盖上当前时间）。 */
async function seedExpired(designId: string): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('beadhue-pending-originals', 2);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('originals', 'readwrite');
      tx.objectStore('originals').put({ designId, bytes: new ArrayBuffer(3), type: 'png', name: 'old.png', createdAt: Date.now() - 25 * 60 * 60 * 1000 });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pendingOriginals 一次性交接库', () => {
  it('放入 → 取走（取走即删），再取为空', async () => {
    await putPendingOriginal(record('d1'));
    const taken = await takePendingOriginal('d1');
    expect(taken).toMatchObject({ designId: 'd1', name: 'photo.png' });
    expect(Object.prototype.toString.call(taken!.bytes)).toBe('[object ArrayBuffer]');
    await expect(takePendingOriginal('d1')).resolves.toBeNull();
  });

  it('超过 24 小时的记录取走时同样删除并返回 null', async () => {
    await seedExpired('d2');
    await expect(takePendingOriginal('d2')).resolves.toBeNull();
    await expect(takePendingOriginal('d2')).resolves.toBeNull();
  });

  it('discard 清掉记录', async () => {
    await putPendingOriginal(record('d3'));
    await discardPendingOriginal('d3');
    await expect(takePendingOriginal('d3')).resolves.toBeNull();
  });

  it('带来源修订的交接同时写入来源映射，可查询与覆盖', async () => {
    await putPendingOriginal(record('d4', { sourceRevisionId: 'rev-1' }));
    await expect(lookupOriginalSource('d4')).resolves.toBe('rev-1');
    await rememberOriginalSource('d4', 'rev-2');
    await expect(lookupOriginalSource('d4')).resolves.toBe('rev-2');
    await expect(lookupOriginalSource('missing')).resolves.toBeNull();
  });

  it('IndexedDB 不可用：取/弃/查返回 null 或静默，放回抛出', async () => {
    vi.stubGlobal('indexedDB', undefined);
    await expect(takePendingOriginal('d1')).resolves.toBeNull();
    await expect(discardPendingOriginal('d1')).resolves.toBeUndefined();
    await expect(rememberOriginalSource('d1', 'rev')).resolves.toBeUndefined();
    await expect(lookupOriginalSource('d1')).resolves.toBeNull();
    await expect(putPendingOriginal(record('d1'))).rejects.toThrow('IndexedDB unavailable');
  });
});

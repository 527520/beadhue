import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestClient, type TestDatabase } from './testClient';
import { adminAuditLogs, communityOriginals, communityRevisions, communityWorks, officialBatches, users } from './schema';
import type { Actor } from '@/lib/auth/authorization';
import { DEFAULT_GENERATION_PARAMS } from '@/lib/types';
import { createOfficialBatch, listOfficialBatches, publishOfficialBatch, reviseOfficialDraft, saveOfficialDraft, transitionOfficialBatch } from '@/lib/community/officialBatch';
import { attachTestOriginal } from './testOriginals';

const MARD_221_PALETTE_ID = 'pcd:mard-221-alfonse-doudou@178dafbc9e77d3de556550dbd058270200129186';
const MARD_291_PALETTE_ID = 'pcd:mard-291-github@178dafbc9e77d3de556550dbd058270200129186';
const snapshot = {
  version: 1 as const, engineVersion: '2.0.0', boardProfile: '5mm-29' as const,
  paletteSelection: { palette: { kind: 'custom' as const, colors: [{ hex: '#FF0000', code: 'R' }] }, kitTier: 0 },
  params: { ...DEFAULT_GENERATION_PARAMS, targetWidth: 20, backgroundPrototype: null },
  pattern: { width: 1, height: 1, cells: [{ hex: '#FF0000', code: 'R', transparent: false }] },
};

describe('official browser-local batch persistence', () => {
  let db: TestDatabase; let admin: Actor;
  beforeEach(async () => {
    db = await createTestClient();
    const [user] = await db.insert(users).values({ email: 'admin@example.com', passwordHash: 'hash', role: 'admin', emailVerifiedAt: new Date() }).returning();
    admin = { userId: user.id, role: 'admin', accountStatus: 'active', emailVerified: true };
  });

  it('saves only generated snapshots as official drafts and publishes the explicit selection', async () => {
    const batch = await createOfficialBatch(db, { actor: admin, itemCount: 2, defaultParams: DEFAULT_GENERATION_PARAMS,
      engineVersion: '2.0.0', reason: '开始官方内容批次', requestId: 'start' });
    const first = await saveOfficialDraft(db, { actor: admin, batchId: batch.id, title: '官方作品 01', snapshot,
      reason: '保存成功生成结果', requestId: 'save-1' });
    const second = await saveOfficialDraft(db, { actor: admin, batchId: batch.id, title: '官方作品 02', snapshot,
      reason: '保存成功生成结果', requestId: 'save-2' });
    const finished = await transitionOfficialBatch(db, { actor: admin, batchId: batch.id, action: 'finish', expectedVersion: batch.version, reason: '完成全部图纸生成', requestId: 'finish' });
    // D49：官方草稿也必须先上传原图才能发布
    await expect(publishOfficialBatch(db, { actor: admin, batchId: batch.id, revisionIds: [second.revisionId],
      expectedVersion: finished.version, reason: '缺原图不应发布', requestId: 'publish-missing-original' })).rejects.toMatchObject({ code: 'ORIGINAL_REQUIRED' });
    await attachTestOriginal(db, admin, first.revisionId);
    const beforeSecond = (await listOfficialBatches(db, admin.userId)).items[0].drafts;
    expect(beforeSecond.find((draft) => draft.id === first.revisionId)?.hasOriginal).toBe(true);
    expect(beforeSecond.find((draft) => draft.id === second.revisionId)?.hasOriginal).toBe(false);
    await attachTestOriginal(db, admin, second.revisionId);
    expect((await listOfficialBatches(db, admin.userId)).items[0].drafts.every((draft) => draft.hasOriginal)).toBe(true);
    const result = await publishOfficialBatch(db, { actor: admin, batchId: batch.id, revisionIds: [second.revisionId],
      expectedVersion: finished.version, reason: '复核勾选作品后发布', requestId: 'publish' });
    expect((await listOfficialBatches(db, admin.userId)).items[0].drafts.every((draft) => draft.hasOriginal)).toBe(true);
    expect(result.batch).toMatchObject({ status: 'completed', successCount: 2, failureCount: 0 });
    const revisions = await db.select().from(communityRevisions);
    expect(revisions.find((item) => item.id === first.revisionId)?.status).toBe('draft');
    expect(revisions.find((item) => item.id === second.revisionId)).toMatchObject({ status: 'published', authorType: 'official', publicAuthorId: 'doupu-official', sourceDesignId: null });
    expect((await db.select().from(communityWorks)).find((work) => work.id === second.workId)?.currentPublishedRevisionId).toBe(second.revisionId);
    expect(await db.select().from(adminAuditLogs)).toHaveLength(5);
    const remaining = await publishOfficialBatch(db, { actor: admin, batchId: batch.id, revisionIds: [first.revisionId],
      expectedVersion: result.batch.version, reason: '再次复核剩余草稿后发布', requestId: 'publish-remaining' });
    expect(remaining.publishedRevisionIds).toEqual([first.revisionId]);
    expect((await db.select().from(communityRevisions)).every((revision) => revision.status === 'published')).toBe(true);
  });

  it('pauses without cancelling work and cancellation records unfinished items', async () => {
    const batch = await createOfficialBatch(db, { actor: admin, itemCount: 3, defaultParams: DEFAULT_GENERATION_PARAMS, engineVersion: '2.0.0', reason: '启动暂停测试批次', requestId: 'start' });
    const paused = await transitionOfficialBatch(db, { actor: admin, batchId: batch.id, action: 'pause', expectedVersion: 1, reason: '暂停派发新任务', requestId: 'pause' });
    expect(paused.status).toBe('paused');
    const cancelled = await transitionOfficialBatch(db, { actor: admin, batchId: batch.id, action: 'cancel', expectedVersion: paused.version, reason: '取消剩余任务', requestId: 'cancel' });
    expect(cancelled).toMatchObject({ status: 'cancelled', failureCount: 3 });
    expect((await db.select().from(officialBatches))[0].completedAt).not.toBeNull();
  });

  it('finishes generation independently of publishing and reopens incomplete items for retry', async () => {
    const batch = await createOfficialBatch(db, { actor: admin, itemCount: 2, defaultParams: DEFAULT_GENERATION_PARAMS,
      engineVersion: '2.0.0', reason: '独立验证生成完成', requestId: 'start' });
    await saveOfficialDraft(db, { actor: admin, batchId: batch.id, title: '成功项', snapshot, reason: '保存生成结果', requestId: 'save' });
    const finished = await transitionOfficialBatch(db, { actor: admin, batchId: batch.id, action: 'finish', expectedVersion: 1, reason: '所有本地任务结束', requestId: 'finish' });
    expect(finished).toMatchObject({ status: 'completed', successCount: 1, failureCount: 1 });
    expect(finished.completedAt).not.toBeNull();
    expect((await db.select().from(communityRevisions))[0].status).toBe('draft');
    const retrying = await transitionOfficialBatch(db, { actor: admin, batchId: batch.id, action: 'resume', expectedVersion: finished.version, reason: '重试本地失败项目', requestId: 'retry' });
    expect(retrying).toMatchObject({ status: 'running', completedAt: null, failureCount: 0 });
    await saveOfficialDraft(db, { actor: admin, batchId: batch.id, title: '重试成功项', snapshot, reason: '保存重试结果', requestId: 'save-again' });
    const done = await transitionOfficialBatch(db, { actor: admin, batchId: batch.id, action: 'finish', expectedVersion: retrying.version, reason: '全部任务已经完成', requestId: 'finish-again' });
    expect(done).toMatchObject({ status: 'completed', successCount: 2, failureCount: 0 });
    await expect(transitionOfficialBatch(db, { actor: admin, batchId: batch.id, action: 'resume', expectedVersion: done.version, reason: '没有剩余任务重试', requestId: 'invalid' })).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
  });

  it('continues saving after a partial publish and can publish saved drafts after cancellation', async () => {
    const batch = await createOfficialBatch(db, { actor: admin, itemCount: 3, defaultParams: DEFAULT_GENERATION_PARAMS,
      engineVersion: '2.0.0', reason: '验证生成与发布独立', requestId: 'start' });
    const first = await saveOfficialDraft(db, { actor: admin, batchId: batch.id, title: '先完成作品', snapshot, reason: '保存生成结果', requestId: 'first' });
    await attachTestOriginal(db, admin, first.revisionId);
    const result = await publishOfficialBatch(db, { actor: admin, batchId: batch.id, revisionIds: [first.revisionId], expectedVersion: 1, reason: '只发布先完成作品', requestId: 'publish-first' });
    expect(result.batch).toMatchObject({ status: 'running', failureCount: 0, completedAt: null });
    const second = await saveOfficialDraft(db, { actor: admin, batchId: batch.id, title: '后完成作品', snapshot, reason: '保存后续结果', requestId: 'second' });
    await attachTestOriginal(db, admin, second.revisionId);
    const cancelled = await transitionOfficialBatch(db, { actor: admin, batchId: batch.id, action: 'cancel', expectedVersion: result.batch.version, reason: '取消未完成生成', requestId: 'cancel' });
    const remaining = await publishOfficialBatch(db, { actor: admin, batchId: batch.id, revisionIds: [second.revisionId], expectedVersion: cancelled.version, reason: '复核保留草稿并发布', requestId: 'publish-second' });
    expect(remaining.batch).toMatchObject({ status: 'cancelled', failureCount: 1, completedAt: cancelled.completedAt });
  });

  it('rejects arbitrary batch metadata before it can reach persistence', async () => {
    await expect(createOfficialBatch(db, {
      actor: admin,
      itemCount: 1,
      defaultParams: { ...DEFAULT_GENERATION_PARAMS, fileName: 'private-photo.png', cropSource: 'private-bytes' },
      engineVersion: '2.0.0',
      reason: '验证批次参数隐私边界',
      requestId: 'private-params',
    })).rejects.toMatchObject({ code: 'VALIDATION', field: 'defaultParams' });
    expect(await db.select().from(officialBatches)).toHaveLength(0);
  });

  // 原地修订用例共用起点：一个 running 批次 + 一个已上传原图的官方草稿。
  async function startBatchWithDraft(itemCount = 2) {
    const batch = await createOfficialBatch(db, { actor: admin, itemCount, defaultParams: DEFAULT_GENERATION_PARAMS,
      engineVersion: '2.0.0', reason: '开始原地修订测试批次', requestId: 'start' });
    const draft = await saveOfficialDraft(db, { actor: admin, batchId: batch.id, title: '待修订草稿', snapshot,
      reason: '保存生成结果', requestId: 'save' });
    await attachTestOriginal(db, admin, draft.revisionId);
    return { batch, draft };
  }

  it('revises an unpublished draft in place without consuming quota or rebinding the original', async () => {
    const { batch, draft } = await startBatchWithDraft();
    const revised = await reviseOfficialDraft(db, { actor: admin, batchId: batch.id, revisionId: draft.revisionId,
      expectedVersion: draft.version, title: '复核后的标题', reason: '复核生成结果后修正标题', requestId: 'revise-title' });
    expect(revised).toMatchObject({ revisionId: draft.revisionId, workId: draft.workId, title: '复核后的标题', status: 'draft', version: draft.version + 1 });
    const [revision] = await db.select().from(communityRevisions).where(eq(communityRevisions.id, draft.revisionId));
    expect(revision).toMatchObject({ title: '复核后的标题', status: 'draft', revisionNumber: 1, version: draft.version + 1 });
    // 原地修订不新增作品行、不占用批次成功名额，原图行仍绑定同一修订。
    expect(await db.select().from(communityWorks)).toHaveLength(1);
    expect((await db.select().from(officialBatches))[0].successCount).toBe(1);
    expect((await db.select().from(communityOriginals)).map((row) => row.revisionId)).toEqual([draft.revisionId]);
    expect((await db.select().from(adminAuditLogs)).map((row) => row.action))
      .toEqual(['official.batch_started', 'official.draft_saved', 'official.draft_revised']);
  });

  it('recomputes pattern and palette columns from a revised snapshot', async () => {
    const { batch, draft } = await startBatchWithDraft();
    expect((await db.select({ width: communityRevisions.width }).from(communityRevisions))[0].width).toBe(1);
    const revised = { ...snapshot, engineVersion: '2.1.0', boardProfile: '2.6mm-50' as const,
      paletteSelection: { palette: { kind: 'builtin' as const, brand: MARD_221_PALETTE_ID }, kitTier: 0 },
      pattern: { width: 2, height: 1, cells: [
        { hex: '#FF0000', code: 'R', transparent: false },
        { hex: '#00FF00', code: 'G', transparent: false },
      ] } };
    const result = await reviseOfficialDraft(db, { actor: admin, batchId: batch.id, revisionId: draft.revisionId,
      expectedVersion: draft.version, snapshot: revised, reason: '复核后替换图纸', requestId: 'revise-snapshot' });
    const [revision] = await db.select().from(communityRevisions).where(eq(communityRevisions.id, draft.revisionId));
    expect(revision).toMatchObject({
      title: '待修订草稿', width: 2, height: 1, colorCount: 2, engineVersion: '2.1.0',
      boardProfile: '2.6mm-50', paletteKind: 'builtin', paletteId: MARD_221_PALETTE_ID,
      preview: { version: 1, width: 2, height: 1, originalWidth: 2, originalHeight: 1 },
    });
    expect(revision.snapshot).toMatchObject({ boardProfile: '2.6mm-50', pattern: { width: 2, height: 1 } });
    expect(result.version).toBe(draft.version + 1);
  });

  it('refuses in-place revision once the work points at a published revision', async () => {
    const { batch, draft } = await startBatchWithDraft();
    // 直接构造「草稿仍是 draft、但作品已指向公开修订」的防御场景：发布流程之外不应出现，服务端必须拒绝。
    await db.update(communityWorks).set({ currentPublishedRevisionId: draft.revisionId }).where(eq(communityWorks.id, draft.workId));
    await expect(reviseOfficialDraft(db, { actor: admin, batchId: batch.id, revisionId: draft.revisionId,
      expectedVersion: draft.version, title: '不应写入的标题', reason: '验证已发布作品拒绝改写', requestId: 'revise-published' }))
      .rejects.toMatchObject({ code: 'STATE_CONFLICT' });
    expect((await db.select().from(communityRevisions))[0]).toMatchObject({ title: '待修订草稿', version: 1, status: 'draft' });
  });

  it('hides another administrator batch when revising its draft', async () => {
    const [otherAdmin] = await db.insert(users).values({ email: 'other-admin@example.com', passwordHash: 'hash', role: 'admin', emailVerifiedAt: new Date() }).returning();
    const other: Actor = { userId: otherAdmin.id, role: 'admin', accountStatus: 'active', emailVerified: true };
    const { batch, draft } = await startBatchWithDraft();
    await expect(reviseOfficialDraft(db, { actor: other, batchId: batch.id, revisionId: draft.revisionId,
      expectedVersion: draft.version, title: '越权标题', reason: '验证批次归属隔离', requestId: 'revise-other' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await db.select().from(communityRevisions))[0].title).toBe('待修订草稿');
  });

  it('rejects a stale expected version', async () => {
    const { batch, draft } = await startBatchWithDraft();
    await expect(reviseOfficialDraft(db, { actor: admin, batchId: batch.id, revisionId: draft.revisionId,
      expectedVersion: draft.version + 1, title: '过期修订', reason: '验证版本冲突提示', requestId: 'revise-stale' }))
      .rejects.toMatchObject({ code: 'STATE_CONFLICT' });
    expect((await db.select().from(communityRevisions))[0].version).toBe(1);
  });

  it('rejects a snapshot whose board profile is incompatible with its palette', async () => {
    const { batch, draft } = await startBatchWithDraft();
    const incompatible = { ...snapshot, boardProfile: '2.6mm-50' as const,
      paletteSelection: { palette: { kind: 'builtin' as const, brand: MARD_291_PALETTE_ID }, kitTier: 0 } };
    await expect(reviseOfficialDraft(db, { actor: admin, batchId: batch.id, revisionId: draft.revisionId,
      expectedVersion: draft.version, snapshot: incompatible, reason: '验证规格与色板兼容性', requestId: 'revise-incompatible' }))
      .rejects.toMatchObject({ code: 'VALIDATION', field: 'snapshot' });
    expect((await db.select().from(communityRevisions))[0].version).toBe(1);
  });

  it('exposes the draft revision version through the batch listing', async () => {
    const { batch, draft } = await startBatchWithDraft();
    expect((await listOfficialBatches(db, admin.userId)).items[0].drafts[0]).toMatchObject({ id: draft.revisionId, version: draft.version });
    await reviseOfficialDraft(db, { actor: admin, batchId: batch.id, revisionId: draft.revisionId,
      expectedVersion: draft.version, title: '列表可见的新标题', reason: '验证列表暴露修订版本', requestId: 'revise-list' });
    expect((await listOfficialBatches(db, admin.userId)).items[0].drafts[0])
      .toMatchObject({ id: draft.revisionId, title: '列表可见的新标题', version: draft.version + 1, status: 'draft' });
  });
});


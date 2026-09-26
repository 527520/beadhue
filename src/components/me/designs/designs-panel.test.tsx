// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError, type CloudDesignFull } from '@/lib/sync/clientAdapter';
import { enqueueDesignSync } from '@/lib/sync/queue';
import { createStitchProgress, type StitchProgress } from '@/lib/progress/stitchProgress';
import type { BeadhueApi, MeInfo } from '@/lib/sync/api';
import type { DesignRecord, StorageAdapter } from '@/lib/storage';
import type { ProjectFile } from '@/lib/types';
import { ToastProvider } from '@/components/ui/toast';
import { DesignsPanel } from './designs-panel';
import { DEFAULT_DESIGNS_QUERY, designsQueryString, filterDesigns, readDesignsQuery, statusCounts, type LibraryDesign } from './design-model';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation, usePathname: () => '/me' }));

const NOW = Date.now();
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

function makeProject(name: string, updatedAt: string, width = 30): ProjectFile {
  return {
    format: 'beadhue-project', version: 3, engineVersion: '2.0.0', boardProfile: '5mm-29', name, createdAt: updatedAt, updatedAt,
    paletteSelection: { palette: { kind: 'builtin', brand: 'MARD' }, kitTier: 0 },
    params: { targetWidth: 20, targetColorCount: 40, dithering: false, mode: 'dominant', brightness: 0, contrast: 0, backgroundRemoval: false, bgTolerance: 8 },
    pattern: { width, height: 20, cells: Array.from({ length: width * 20 }, () => ({ hex: '#FC3D46', code: 'F02', transparent: false })) },
  };
}

class FakeStorage implements StorageAdapter {
  records = new Map<string, DesignRecord>();
  meta = new Map<string, string>();
  progress = new Map<string, StitchProgress>();
  constructor(entries: DesignRecord[] = []) { for (const entry of entries) this.records.set(entry.id, entry); }
  async getAll() { return [...this.records.values()]; }
  async getGenerationSource() { return null; }
  async put(record: DesignRecord) { this.records.set(record.id, { ...record }); }
  async delete(id: string) { this.records.delete(id); }
  async getMeta(key: string) { return this.meta.get(key) ?? null; }
  async setMeta(key: string, value: string) { this.meta.set(key, value); }
  async getStitchProgress(id: string) { return this.progress.get(id) ?? null; }
  async putStitchProgress(id: string, value: StitchProgress) { this.progress.set(id, value); }
  async deleteStitchProgress(id: string) { this.progress.delete(id); }
}

class FakeApi implements BeadhueApi {
  meState: MeInfo = { state: 'guest' };
  cloud = new Map<string, CloudDesignFull>();
  deleted: string[] = [];
  failCloud = false;
  constructor(entries: Array<Omit<CloudDesignFull, 'revision'> & { revision?: number }> = []) {
    for (const entry of entries) this.cloud.set(entry.id, { ...entry, revision: entry.revision ?? 1 });
  }
  async me() { return this.meState; }
  async listDesigns() {
    if (this.failCloud) throw new ApiError(500, 'INTERNAL', '网络错误');
    return [...this.cloud.values()].map((d) => ({ id: d.id, name: d.name, width: d.project.pattern.width, height: d.project.pattern.height, updatedAt: d.updatedAt, deleted: d.deleted ?? false, revision: d.revision ?? 1 }));
  }
  async listDesignsPage() { return { items: await this.listDesigns(), nextCursor: null }; }
  async getDesign(id: string) { return this.cloud.get(id) ?? null; }
  async putDesign(id: string, name: string, project: ProjectFile, baseRevision: number) {
    const current = this.cloud.get(id);
    if ((current?.revision ?? 0) !== baseRevision) throw new ApiError(409, 'REVISION_CONFLICT', 'conflict');
    const updatedAt = new Date(Date.parse(project.updatedAt) + 1000).toISOString();
    this.cloud.set(id, { id, name, project: { ...project, updatedAt }, updatedAt, revision: baseRevision + 1 });
    return { updatedAt, revision: baseRevision + 1 };
  }
  async deleteDesign(id: string, baseRevision: number) {
    const current = this.cloud.get(id);
    if (!current || (current.revision ?? 1) !== baseRevision) throw new ApiError(409, 'REVISION_CONFLICT', 'conflict');
    this.deleted.push(id);
    this.cloud.delete(id);
    return { updatedAt: iso(0), revision: baseRevision + 1 };
  }
  async resendVerification() {}
  async changePassword() {}
  async updateProfile() {}
  async deleteAccount() {}
  async logout() {}
}

const verified: MeInfo = { state: 'verified', email: 'a@b.com', username: null, createdAt: iso(-86_400_000) };
const localRecord = (id: string, project: ProjectFile, revision = 0, syncState: DesignRecord['syncState'] = 'dirty'): DesignRecord => ({ id, name: project.name, projectJson: JSON.stringify(project), thumbnail: null, updatedAt: project.updatedAt, revision, syncState });
const noPublished = async () => new Set<string>();
const renderPanel = (storage: StorageAdapter | null, api: BeadhueApi, extra: Partial<Parameters<typeof DesignsPanel>[0]> = {}) =>
  render(<DesignsPanel initialQuery={DEFAULT_DESIGNS_QUERY} storageOverride={storage} apiOverride={api} loadPublishedIds={noPublished} {...extra} />);
const openLink = (name: string) => screen.findByRole('link', { name: new RegExp(`^打开「${name}」`) });
const more = (name: string) => screen.findByRole('button', { name: `「${name}」的更多操作` });

describe('设计列表规则', () => {
  const item = (id: string, patch: Partial<LibraryDesign>): LibraryDesign => ({ id, name: id, width: 29, height: 29, updatedAt: iso(0), revision: 1, localPresent: true, cloudPresent: true, status: 'synced', pattern: null, colorCount: 3, progress: null, published: false, ...patch });
  it('地址参数只写非默认值，非法值回退默认', () => {
    expect(readDesignsQuery(new URLSearchParams('status=stitching&sort=bad&view=list&q=猫'))).toEqual({ q: '猫', status: 'stitching', sort: 'recent', view: 'list' });
    expect(designsQueryString(DEFAULT_DESIGNS_QUERY)).toBe('');
    expect(designsQueryString({ q: '', status: 'published', sort: 'name', view: 'grid' })).toBe('?status=published&sort=name');
  });
  it('芯片计数基于搜索结果；草稿 = 既不在跟拼也未公开；尺寸从小到大', () => {
    const list = [item('大猫', { width: 58, height: 58 }), item('小猫', { progress: 20, width: 24, height: 24 }), item('兔子', { published: true })];
    const { matched, shown } = filterDesigns(list, { q: '猫', status: 'all', sort: 'size' });
    expect(shown.map((design) => design.name)).toEqual(['小猫', '大猫']);
    expect(statusCounts(matched)).toEqual({ all: 2, draft: 1, stitching: 1, published: 0 });
  });
});

describe('我的 · 设计', () => {
  beforeEach(() => { navigation.push.mockClear(); window.history.replaceState(null, '', '/me'); });

  it.each(['edit', 'stitch'] as const)('整卡一次点击，在本地确认图纸和进度后进入 %s', async (mode) => {
    const storage = new FakeStorage([localRecord('resume-1', makeProject('继续这张', iso(-1000)))]);
    if (mode === 'stitch') { const progress = createStitchProgress(30, 20); progress.done[0] = 1; storage.progress.set('resume-1', progress); }
    renderPanel(storage, new FakeApi());
    const link = await openLink('继续这张');
    expect(link).toHaveAttribute('href', '/app?id=resume-1');
    fireEvent.click(link);
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith(`/app?id=resume-1&mode=${mode}`));
  });

  it('跟拼中的设计显示进度角标，读屏说明包含进度', async () => {
    const storage = new FakeStorage([localRecord('p', makeProject('跟拼图', iso(-1000)))]);
    const progress = createStitchProgress(30, 20); progress.done.fill(1, 0, 300); storage.progress.set('p', progress);
    renderPanel(storage, new FakeApi());
    expect(await openLink('跟拼图')).toHaveAccessibleName('打开「跟拼图」（跟拼中，已完成 50%）');
    expect(screen.getByText('50%')).toBeVisible();
  });

  it('打开时本地读取失败不下载覆盖、不跳转', async () => {
    const storage = new FakeStorage([localRecord('keep', makeProject('保留原件', iso(-1000)))]);
    const api = new FakeApi();
    renderPanel(storage, api);
    const link = await openLink('保留原件');
    const pull = vi.spyOn(api, 'getDesign');
    vi.spyOn(storage, 'getAll').mockRejectedValue(new Error('storage unavailable'));
    fireEvent.click(link);
    expect(await screen.findByText('暂时无法打开这张设计，原有数据未改动。请重试。')).toBeVisible();
    expect(navigation.push).not.toHaveBeenCalled();
    expect(pull).not.toHaveBeenCalled();
  });

  it('读取跟拼进度失败时不误跳编辑，重试后进入跟拼', async () => {
    const storage = new FakeStorage([localRecord('progress', makeProject('已有进度', iso(-1000)))]);
    const progress = createStitchProgress(30, 20); progress.done[10] = 1; storage.progress.set('progress', progress);
    renderPanel(storage, new FakeApi());
    const link = await openLink('已有进度');
    vi.spyOn(storage, 'getStitchProgress').mockRejectedValueOnce(new Error('read progress failed'));
    fireEvent.click(link);
    expect(await screen.findByText('暂时无法打开这张设计，原有数据未改动。请重试。')).toBeVisible();
    expect(navigation.push).not.toHaveBeenCalled();
    fireEvent.click(link);
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/app?id=progress&mode=stitch'));
  });

  it('首次加载时有读屏状态，且不提前显示空状态；空库只有一个主按钮', async () => {
    renderPanel(new FakeStorage(), new FakeApi());
    expect(screen.getByRole('status')).toHaveTextContent('正在加载设计…');
    expect(screen.queryByText('还没有设计')).toBeNull();
    expect(await screen.findByText('还没有设计')).toBeVisible();
    expect(screen.getByRole('link', { name: '上传图片' })).toHaveAttribute('href', '/app');
    expect(screen.getByRole('link', { name: '从空白开始' })).toHaveAttribute('href', '/app?blank=1');
    expect(screen.queryByRole('group', { name: '按状态筛选' })).toBeNull();
  });

  it('列表读取失败不显示空状态，可重试恢复', async () => {
    const storage = new FakeStorage([localRecord('retry', makeProject('真实记录', iso(-1000)))]);
    vi.spyOn(storage, 'getAll').mockRejectedValueOnce(new Error('read failed'));
    renderPanel(storage, new FakeApi());
    expect(await screen.findByRole('alert')).toHaveTextContent('设计加载失败，请重试。');
    expect(screen.queryByText('还没有设计')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByText('真实记录')).toBeVisible();
  });

  it('游客：登录提示横幅，没有「已公开」芯片也没有本机角标', async () => {
    renderPanel(new FakeStorage([localRecord('l1', makeProject('本机设计', iso(-7200_000)))]), new FakeApi());
    await screen.findByText('本机设计');
    expect(screen.getByText('登录后同步到云端，换设备也能继续')).toBeVisible();
    const chips = within(screen.getByRole('group', { name: '按状态筛选' }));
    expect(chips.queryByRole('button', { name: /已公开/ })).toBeNull();
    expect(screen.queryByText('仅本机')).toBeNull();
  });

  it('已登录：同步后本地与云端合并，已同步的用服务端缩略图，未能同步的显示仅本机', async () => {
    const cloudProject = makeProject('云端设计', iso(-3600_000));
    const api = new FakeApi([{ id: 'c1', name: '云端设计', project: cloudProject, updatedAt: cloudProject.updatedAt }]);
    api.meState = verified;
    const storage = new FakeStorage([localRecord('l1', makeProject('本地新改', iso(-600_000)))]);
    const { container } = renderPanel(storage, api, { loadPublishedIds: async () => new Set(['c1']) });
    await screen.findByText('本地新改');
    expect(api.cloud.has('l1')).toBe(true);
    const images = [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    expect(images).toContain('/api/designs/c1/thumbnail?rev=1&v=2');
    expect(images).toContain('/api/designs/l1/thumbnail?rev=1&v=2');
    expect(screen.getByText('已公开', { selector: '[data-slot=badge]' })).toBeVisible();
    expect(within(screen.getByRole('group', { name: '按状态筛选' })).getByRole('button', { name: /已公开/ })).toHaveTextContent('1');
  });

  it('云端失败：保留本地列表，本机设计用浏览器渲染预览，并可重试同步', async () => {
    const api = new FakeApi();
    api.meState = verified;
    api.failCloud = true;
    const { container } = renderPanel(new FakeStorage([localRecord('l1', makeProject('本地设计', iso(-7200_000)))]), api);
    await screen.findByText('本地设计');
    expect(screen.getByText('同步失败，这台设备上的设计都还在。')).toBeVisible();
    expect(screen.getByText('仅本机')).toBeVisible();
    expect(container.querySelector('canvas[data-slot=bead-image]')).not.toBeNull();
    expect(screen.getByRole('button', { name: '重试同步' })).toBeVisible();
  });

  it('冲突：显示冲突提示与冲突副本角标', async () => {
    const api = new FakeApi([{ id: 'k1', name: '云端新版', project: makeProject('云端新版', iso(-1000)), updatedAt: iso(-1000), revision: 2 }]);
    api.meState = verified;
    renderPanel(new FakeStorage([localRecord('k1', makeProject('本地旧版', iso(-2000)), 1, 'dirty')]), api);
    expect(await screen.findByText(/有 1 个设计在其他设备上改过/)).toBeVisible();
    expect(screen.getByText('本地旧版 (冲突副本)')).toBeVisible();
    expect(screen.getAllByText('冲突副本', { selector: '[data-slot=badge]' }).length).toBeGreaterThanOrEqual(1);
  });

  it('实时搜索与状态芯片写进地址；无结果可一键清除', async () => {
    const user = userEvent.setup();
    renderPanel(new FakeStorage([localRecord('a', makeProject('橘猫', iso(-1000))), localRecord('b', makeProject('熊猫', iso(-2000)))]), new FakeApi());
    await screen.findByText('橘猫');
    await user.type(screen.getByRole('searchbox', { name: '搜索设计名称' }), '兔子');
    expect(await screen.findByText('没有名为「兔子」的设计')).toBeVisible();
    expect(window.location.search).toBe(`?q=${encodeURIComponent('兔子')}`);
    await user.click(screen.getByRole('button', { name: '清除搜索' }));
    expect(screen.getByText('熊猫')).toBeVisible();
    await user.click(screen.getByRole('button', { name: /跟拼中/ }));
    expect(await screen.findByText('没有跟拼中的设计')).toBeVisible();
    expect(window.location.search).toBe('?status=stitching');
  });

  it('重命名：菜单打开弹窗，保存后更新本地并推送云端，取消后焦点回到「…」', async () => {
    const user = userEvent.setup();
    const api = new FakeApi();
    api.meState = verified;
    renderPanel(new FakeStorage([localRecord('r1', makeProject('旧名', iso(-3600_000)))]), api);
    const trigger = await more('旧名');
    await user.click(trigger);
    await user.click(await screen.findByRole('menuitem', { name: '重命名' }));
    const dialog = await screen.findByRole('dialog', { name: '重命名设计' });
    expect(within(dialog).getByRole('button', { name: '保存' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: '取消' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
    await user.click(trigger);
    await user.click(await screen.findByRole('menuitem', { name: '重命名' }));
    const input = await screen.findByLabelText('名称');
    await user.clear(input);
    await user.type(input, '新名');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText('新名')).toBeVisible();
    await waitFor(() => expect(api.cloud.get('r1')?.name).toBe('新名'));
  });

  it('复制：生成独立的新设计「副本」，不带跟拼进度', async () => {
    const user = userEvent.setup();
    const storage = new FakeStorage([localRecord('src', makeProject('原件', iso(-3600_000)))]);
    const progress = createStitchProgress(30, 20); progress.done[0] = 1; storage.progress.set('src', progress);
    renderPanel(storage, new FakeApi());
    await user.click(await more('原件'));
    await user.click(await screen.findByRole('menuitem', { name: '复制' }));
    expect(await screen.findByText('原件 副本')).toBeVisible();
    const copy = [...storage.records.values()].find((record) => record.name === '原件 副本')!;
    expect(copy.id).not.toBe('src');
    expect(copy.syncState).toBe('dirty');
    expect(storage.progress.has(copy.id)).toBe(false);
  });

  it('删除：危险确认，失败留在弹窗可重试，连续点击只发一次', async () => {
    const user = userEvent.setup();
    const project = makeProject('删除保护', iso(-1000));
    const api = new FakeApi([{ id: 'safe-delete', name: project.name, project, updatedAt: project.updatedAt }]);
    api.meState = verified;
    const storage = new FakeStorage();
    renderPanel(storage, api);
    await user.click(await more('删除保护'));
    await user.click(await screen.findByRole('menuitem', { name: '删除' }));
    const dialog = await screen.findByRole('dialog', { name: '删除这个设计？' });
    expect(dialog).toHaveTextContent('云端副本会一起删除');
    const remove = vi.spyOn(api, 'deleteDesign').mockRejectedValueOnce(new Error('offline'));
    const confirm = within(dialog).getByRole('button', { name: '删除' });
    fireEvent.click(confirm); fireEvent.click(confirm);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('操作失败，请重试');
    expect(remove).toHaveBeenCalledTimes(1);
    expect(api.cloud.has('safe-delete')).toBe(true);
    fireEvent.click(within(dialog).getByRole('button', { name: '删除' }));
    await waitFor(() => expect(api.cloud.has('safe-delete')).toBe(false));
    await waitFor(() => expect(screen.queryByText('删除保护')).toBeNull());
  });

  it('列表状态暂时仅本地但云端已存在时，删除前探测 revision 并删除云端原件', async () => {
    const user = userEvent.setup();
    const project = makeProject('竞态设计', iso(-3600_000));
    const api = new FakeApi([{ id: 'race-delete', name: project.name, project, updatedAt: project.updatedAt, revision: 1 }]);
    api.meState = verified;
    api.listDesignsPage = async () => ({ items: [], nextCursor: null });
    api.putDesign = async () => { throw new TypeError('previous page is still syncing'); };
    const storage = new FakeStorage([localRecord('race-delete', project)]);
    renderPanel(storage, api);
    await user.click(await more('竞态设计'));
    await user.click(await screen.findByRole('menuitem', { name: '删除' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '删除' }));
    await waitFor(() => expect(api.deleted).toContain('race-delete'));
    expect(await storage.getAll()).toEqual([]);
  });

  it('列表加载后自动保存才落地：删除按本机已同步的最新修订提交', async () => {
    const user = userEvent.setup();
    const project = makeProject('刚改过名', iso(-1000));
    const api = new FakeApi([{ id: 'late-save', name: project.name, project, updatedAt: project.updatedAt, revision: 2 }]);
    api.meState = verified;
    const storage = new FakeStorage([localRecord('late-save', project, 2, 'synced')]);
    renderPanel(storage, api);
    await user.click(await more('刚改过名'));
    storage.records.set('late-save', { ...storage.records.get('late-save')!, revision: 3 });
    api.cloud.set('late-save', { ...api.cloud.get('late-save')!, revision: 3 });
    await user.click(await screen.findByRole('menuitem', { name: '删除' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '删除' }));
    await waitFor(() => expect(api.deleted).toContain('late-save'));
    expect(await storage.getAll()).toEqual([]);
  });

  it('删除等待已提交但尚未回写本机修订号的后台保存', async () => {
    const user = userEvent.setup();
    const project = makeProject('保存后删除', iso(-1000));
    const api = new FakeApi([{ id: 'inflight-delete', name: project.name, project, updatedAt: project.updatedAt, revision: 1 }]);
    api.meState = verified;
    const storage = new FakeStorage([localRecord('inflight-delete', project, 1, 'synced')]);
    renderPanel(storage, api);
    await more('保存后删除');

    let committed!: () => void;
    let release!: () => void;
    const cloudCommitted = new Promise<void>((resolve) => { committed = resolve; });
    const responseGate = new Promise<void>((resolve) => { release = resolve; });
    const put = api.putDesign.bind(api);
    api.putDesign = async (...args) => {
      const response = await put(...args);
      committed();
      await responseGate;
      return response;
    };
    storage.records.set('inflight-delete', { ...storage.records.get('inflight-delete')!, syncState: 'dirty' });
    const pending = enqueueDesignSync(storage, api);
    await cloudCommitted;
    expect(api.cloud.get('inflight-delete')?.revision).toBe(2);
    expect(storage.records.get('inflight-delete')?.revision).toBe(1);

    try {
      await user.click(await more('保存后删除'));
      await user.click(await screen.findByRole('menuitem', { name: '删除' }));
      fireEvent.click(within(await screen.findByRole('dialog', { name: '删除这个设计？' })).getByRole('button', { name: '删除' }));
      expect(api.deleted).toEqual([]);
    } finally {
      release();
    }
    await pending;
    await waitFor(() => expect(api.deleted).toContain('inflight-delete'));
    expect(storage.records.has('inflight-delete')).toBe(false);
  });

  it('删除时云端已被其他设备改过：说明原因并刷新列表，本机与云端都不动', async () => {
    const user = userEvent.setup();
    const project = makeProject('别处改过', iso(-1000));
    const api = new FakeApi([{ id: 'elsewhere', name: project.name, project, updatedAt: project.updatedAt, revision: 2 }]);
    api.meState = verified;
    const storage = new FakeStorage([localRecord('elsewhere', project, 2, 'synced')]);
    renderPanel(storage, api);
    await user.click(await more('别处改过'));
    api.cloud.set('elsewhere', { ...api.cloud.get('elsewhere')!, revision: 3 });
    await user.click(await screen.findByRole('menuitem', { name: '删除' }));
    const dialog = await screen.findByRole('dialog', { name: '删除这个设计？' });
    await user.click(within(dialog).getByRole('button', { name: '删除' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('这个设计刚在其他设备上改过');
    expect(api.deleted).toEqual([]);
    expect(storage.records.has('elsewhere')).toBe(true);
  });

  it('卡片「同步到云端」失败时如实提示，不报成功', async () => {
    const user = userEvent.setup();
    const project = makeProject('待同步', iso(-1000));
    const api = new FakeApi();
    api.meState = verified;
    api.putDesign = async () => { throw new ApiError(500, 'INTERNAL', '网络错误'); };
    render(<ToastProvider><DesignsPanel initialQuery={DEFAULT_DESIGNS_QUERY} storageOverride={new FakeStorage([localRecord('sync-fail', project)])} apiOverride={api} loadPublishedIds={noPublished} /></ToastProvider>);
    await user.click(await more('待同步'));
    const before = screen.queryAllByText('同步失败，这台设备上的设计都还在。').length;
    await user.click(await screen.findByRole('menuitem', { name: '同步到云端' }));
    await waitFor(() => expect(screen.queryAllByText('同步失败，这台设备上的设计都还在。').length).toBeGreaterThan(before));
    expect(screen.queryByText('已同步到云端')).toBeNull();
  });

  it('列表视图：表格列与点行打开', async () => {
    render(<DesignsPanel initialQuery={{ ...DEFAULT_DESIGNS_QUERY, view: 'list' }} storageOverride={new FakeStorage([localRecord('t1', makeProject('表格设计', iso(-1000)))])} apiOverride={new FakeApi()} loadPublishedIds={noPublished} />);
    const cell = await screen.findByText('表格设计');
    expect(screen.getByRole('columnheader', { name: '更新时间' })).toBeVisible();
    expect(screen.getByText('30×20')).toBeVisible();
    fireEvent.click(cell.closest('tr')!.querySelectorAll('td')[1]);
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/app?id=t1&mode=edit'));
  });
});

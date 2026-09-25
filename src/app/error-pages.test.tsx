// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { resetAuthStatusCache } from '@/components/account/useAuthStatus';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }), usePathname: () => '/missing' }));

import NotFound from './not-found';
import PageError from './error';
import AdminError from './admin/error';
import ShareGone from './s/[token]/not-found';
import WorkMissing from './community/[id]/not-found';
import AdminNotFound from './admin/not-found';

const fetchMock = vi.fn();
beforeEach(() => {
  resetAuthStatusCache();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response('{}', { status: 401 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const reports = () => fetchMock.mock.calls.filter(([url]) => url === '/api/internal/client-error');

describe('404 页', () => {
  it('豆粒插画 + 页面标题，主按钮回首页、次按钮去创作', () => {
    render(<NotFound />);
    expect(screen.getByRole('heading', { level: 1, name: '页面不存在' })).toBeTruthy();
    const home = screen.getByRole('link', { name: '返回首页' });
    expect(home.getAttribute('href')).toBe('/');
    expect(home.className).toContain('bg-accent');
    expect(screen.getByRole('link', { name: '去创作' }).getAttribute('href')).toBe('/app');
    expect(document.querySelector('[data-slot="empty-state"] canvas')).toBeTruthy();
  });
});

describe('后台 404', () => {
  it('留在后台外壳里，主按钮回后台总览', () => {
    render(<AdminNotFound />);
    expect(screen.getByRole('heading', { level: 1, name: '这个后台页面不存在' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '返回后台总览' }).getAttribute('href')).toBe('/admin');
  });
});

describe('作品不存在', () => {
  it('说明已下架或不存在，主按钮回发现', () => {
    render(<WorkMissing />);
    expect(screen.getByRole('heading', { level: 1, name: '这张图纸不存在或已下架' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '回到发现' }).getAttribute('href')).toBe('/');
  });
});

describe('页面错误边界', () => {
  it('点击重试调用 retry，并上报运行日志（带错误编号）', () => {
    const retry = vi.fn();
    const error = Object.assign(new Error('boom'), { digest: 'd-123' });
    render(<PageError error={error} retry={retry} />);
    expect(screen.getByRole('heading', { level: 1, name: '页面出错了' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.getByText('错误编号 d-123')).toBeTruthy();
    expect(screen.getByRole('link', { name: '返回首页' }).getAttribute('href')).toBe('/');
    expect(reports()).toHaveLength(1);
    expect(JSON.parse(String(reports()[0][1].body))).toMatchObject({ message: 'boom', digest: 'd-123' });
  });
});

describe('后台错误边界', () => {
  it('与站点错误页同一形态：重试为唯一主按钮，返回审核入口', () => {
    const retry = vi.fn();
    render(<AdminError error={new Error('')} retry={retry} />);
    expect(screen.getByRole('heading', { level: 1, name: '管理页面暂时无法读取' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '重新读取页面' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.getByText('返回审核入口').closest('a')?.getAttribute('href')).toBe('/admin');
    expect(JSON.parse(String(reports()[0][1].body)).message).toBe('页面渲染失败（浏览器没有提供错误信息）');
  });
});

describe('失效的分享链接', () => {
  it('说明原因并引导去发现', () => {
    render(<ShareGone />);
    expect(screen.getByRole('heading', { level: 1, name: '这个分享链接已失效' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '发现更多图纸' }).getAttribute('href')).toBe('/');
  });
});

// @vitest-environment jsdom
/**
 * 每页条数记忆（admin-round-3 06）：只认白名单里的四档，坏值一律回退默认。
 * 这条契约原先想在 e2e 里断言，但三大浏览器对「点隐藏 radio」的受控 onChange 表现不一致，
 * 放在这里既确定又能覆盖边界。
 */
import { beforeEach, expect, it } from 'vitest';
import { readStoredPageSize, storePageSize } from './pageSizeStore';

beforeEach(() => window.localStorage.clear());

it('读不到时用默认 10，写入后按模块分别记住', () => {
  expect(readStoredPageSize('tags')).toBe(10);
  storePageSize('tags', 50);
  storePageSize('works', 20);
  expect(readStoredPageSize('tags')).toBe(50);
  expect(readStoredPageSize('works')).toBe(20);
  expect(readStoredPageSize('audit')).toBe(10);
});

it('坏值（非白名单、非数字、空）一律回退默认，不抛错', () => {
  for (const bad of ['7', '0', '-10', 'abc', '', '1000']) {
    window.localStorage.setItem('beadhue.admin.pageSize.tags', bad);
    expect(readStoredPageSize('tags'), bad).toBe(10);
  }
  for (const good of [10, 20, 50, 100]) {
    window.localStorage.setItem('beadhue.admin.pageSize.tags', String(good));
    expect(readStoredPageSize('tags')).toBe(good);
  }
});

it('存储不可用时静默回退，不影响列表渲染', () => {
  const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
  Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('denied'); } });
  try {
    expect(readStoredPageSize('tags')).toBe(10);
    expect(() => storePageSize('tags', 50)).not.toThrow();
  } finally {
    if (original) Object.defineProperty(window, 'localStorage', original);
  }
});

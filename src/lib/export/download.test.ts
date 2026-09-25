// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { triggerDownload } from './download';

describe('triggerDownload', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('创建临时下载链接并点击，超时后回收对象 URL', () => {
    vi.useFakeTimers();
    const revoke = vi.fn();
    const create = vi.fn(() => 'blob:test-url');
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    triggerDownload(new Uint8Array([1, 2, 3]), '清单.pdf');

    expect(create).toHaveBeenCalledTimes(1);
    const blob = (create.mock.calls[0] as unknown[])[0] as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/pdf');
    expect(click).toHaveBeenCalledTimes(1);
    expect(revoke).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1_500);
    expect(revoke).toHaveBeenCalledWith('blob:test-url');
    expect(document.querySelector('a')).toBeNull();
  });
});

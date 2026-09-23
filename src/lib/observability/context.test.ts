/**
 * 请求上下文单测（用户第 15 条）：
 * 掩码规则、脱敏规则、ALS 在嵌套异步调用中的传播，以及调用链的合并与上限。
 */
import { describe, expect, it } from 'vitest';
import { REDACTED, currentLogContext, currentSpans, maskIp, pushSpan, redact, setLogActor, withLogContext } from './context';

describe('maskIp（网络地址入库前掩码）', () => {
  it('IPv4 只保留前三段，末段清零', () => {
    expect(maskIp('203.0.113.42')).toBe('203.0.113.0');
    expect(maskIp('10.0.0.1')).toBe('10.0.0.0');
    expect(maskIp(' 198.51.100.7 ')).toBe('198.51.100.0');
  });

  it('IPv6 只保留前 48 位，其余清零', () => {
    expect(maskIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe('2001:db8:85a3::');
    expect(maskIp('2001:db8:85a3::8a2e:370:7334')).toBe('2001:db8:85a3::');
    expect(maskIp('2001:db8::1')).toBe('2001:db8:0::');
    expect(maskIp('::1')).toBe('::');
    expect(maskIp('[2001:db8:85a3::1]')).toBe('2001:db8:85a3::');
    // IPv4 映射写法要保留 ::ffff: 前缀，否则认不出这是同一批地址
    expect(maskIp('::ffff:192.0.2.7')).toBe('::ffff:192.0.2.0');
  });

  it('local 原样保留：它本身不是地址', () => {
    expect(maskIp('local')).toBe('local');
  });

  it('无法识别的输入返回 unknown，绝不原样存下来', () => {
    expect(maskIp('')).toBe('unknown');
    expect(maskIp(null)).toBe('unknown');
    expect(maskIp(undefined)).toBe('unknown');
    expect(maskIp('not-an-ip')).toBe('unknown');
    expect(maskIp('999.0.113.1')).toBe('unknown');
    expect(maskIp('1.2.3')).toBe('unknown');
    expect(maskIp('2001:db8:85a3:0:0:0:0:0:1')).toBe('unknown');
    expect(maskIp('fe80::1%eth0')).toBe('fe80:0:0::');
  });
});

describe('redact（持久化前脱敏）', () => {
  it('剥掉请求体、评论正文、邮箱、令牌与图纸/快照字段', () => {
    const output = redact({
      email: 'someone@example.test',
      userEmail: 'someone@example.test',
      token: 'raw-token',
      password: 'hunter2',
      body: '{"a":1}',
      commentText: '评论正文',
      text: '正文',
      snapshot: [[1, 2]],
      pattern: { cells: 1 },
      authorizationHeader: 'Bearer x',
      nested: { ok: 1, refreshToken: 'x' },
    }) as Record<string, unknown>;
    for (const key of ['email', 'userEmail', 'token', 'password', 'body', 'commentText', 'text', 'snapshot', 'pattern', 'authorizationHeader']) {
      expect(output[key], key).toBe(REDACTED);
    }
    expect((output.nested as Record<string, unknown>).ok).toBe(1);
    expect((output.nested as Record<string, unknown>).refreshToken).toBe(REDACTED);
  });

  it('保留诊断需要的标量，并给数组 / 深度 / 长度设上限', () => {
    expect(redact({ route: '/api/x', status: 500, ok: false, nothing: null })).toEqual({ route: '/api/x', status: 500, ok: false, nothing: null });
    expect(redact('x'.repeat(600))).toHaveLength(513);
    expect(redact(Array.from({ length: 60 }, (_, index) => index))).toHaveLength(51);
    let deep: unknown = 'leaf';
    for (let index = 0; index < 8; index += 1) deep = { next: deep };
    let cursor = redact(deep) as Record<string, unknown>;
    for (let index = 0; index < 5; index += 1) cursor = cursor.next as Record<string, unknown>;
    expect(cursor.next).toBe(REDACTED);
    expect(redact(new Date('2026-01-01T00:00:00.000Z'))).toBe('2026-01-01T00:00:00.000Z');
    expect(redact(new Error('boom'))).toMatchObject({ name: 'Error', message: 'boom' });
  });
});

describe('withLogContext（ALS 传播）', () => {
  it('上下文穿过嵌套 await 与回调，出了作用域即消失', async () => {
    expect(currentLogContext()).toBeUndefined();
    const seen: string[] = [];
    await withLogContext({ requestId: 'req-1', ipMasked: '203.0.113.0', method: 'GET', path: '/api/admin/logs', route: '/api/admin/logs' }, async () => {
      pushSpan({ kind: 'route', name: 'GET /api/admin/logs' });
      await new Promise((resolve) => setTimeout(resolve, 1));
      await (async () => {
        await Promise.resolve();
        seen.push(currentLogContext()?.requestId ?? 'missing');
        pushSpan({ kind: 'service', name: 'admin.listSystemLogs', detail: 'pGlite' });
      })();
      setLogActor({ userId: 'user-1', role: 'admin' });
      seen.push(currentLogContext()?.actorUserId ?? 'missing');
    });
    expect(seen).toEqual(['req-1', 'user-1']);
    expect(currentLogContext()).toBeUndefined();
    expect(currentSpans()).toEqual([]);
  });

  it('相邻重复的 span 只保留一条，超过上限后静默停止追加', async () => {
    await withLogContext({ requestId: 'req-2' }, () => {
      pushSpan({ kind: 'service', name: 'svc' });
      pushSpan({ kind: 'service', name: 'svc', detail: '第二次带细节' });
      expect(currentSpans()).toEqual([{ kind: 'service', name: 'svc', detail: '第二次带细节' }]);
      for (let index = 0; index < 40; index += 1) pushSpan({ kind: 'db', name: `stmt-${index}` });
      expect(currentSpans().length).toBeLessThanOrEqual(24);
      // 没有上下文时 pushSpan / setLogActor 是空操作，不抛错（后台任务会走到这里）
      expect(() => { pushSpan({ kind: 'db', name: 'x' }); setLogActor(null); }).not.toThrow();
    });
  });
});

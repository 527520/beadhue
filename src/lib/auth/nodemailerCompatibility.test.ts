import { describe, expect, it } from 'vitest';
import nodemailer from 'nodemailer';

describe('Nodemailer 升级兼容性', () => {
  it('使用真实邮件编译器生成中文主题与 HTML/纯文本双版本，不连接 SMTP', async () => {
    const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
    const info = await transport.sendMail({
      from: '豆色绘 <noreply@example.com>',
      to: 'recipient@example.com',
      subject: '验证您的邮箱',
      text: '请验证邮箱：https://example.com/verify-email?token=test-token',
      html: '<p>请验证邮箱：<a href="https://example.com/verify-email?token=test-token">验证</a></p>',
    });

    expect(info.envelope).toEqual({
      from: 'noreply@example.com',
      to: ['recipient@example.com'],
    });
    expect(Buffer.isBuffer(info.message)).toBe(true);
    const mime = info.message.toString();
    expect(mime).toMatch(/Subject: =\?UTF-8\?B\?/i);
    expect(mime).toContain('Content-Type: multipart/alternative;');
    expect(mime).toContain('Content-Type: text/plain; charset=utf-8');
    expect(mime).toContain('Content-Type: text/html; charset=utf-8');
    expect(mime).toContain('test-token');
  });
});

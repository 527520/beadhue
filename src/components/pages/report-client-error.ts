/**
 * 错误边界上报运行日志（D63）：只发四个字段（message / digest / path / stack），掩码 IP 与 requestId 由服务端补齐；
 * 上报本身失败不影响页面，也不重试——错误边界再抛错只会让用户看到白屏。
 */
export function reportClientError(error: Error & { digest?: string }, fallbackMessage: string): void {
  void fetch('/api/internal/client-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: (error.message || fallbackMessage).slice(0, 1000),
      digest: error.digest?.slice(0, 120),
      path: window.location.pathname.slice(0, 300),
      stack: error.stack?.slice(0, 16_000),
    }),
  }).catch(() => {});
}

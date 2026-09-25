'use client';

/**
 * 根布局错误边界（连布局都渲染失败时的兜底，必须自带 html/body）。
 * 这里拿不到全站样式表，只能用内联样式；颜色与尺寸取自 theme.css 的令牌（白底、深墨字、豆蓝胶囊主按钮）。
 */
import { useEffect } from 'react';
import { zhCN } from '@/messages/zh-CN';

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error('[global-error]', error);
  }, [error]);

  const t = zhCN.errorPages;
  return (
    <html lang="zh-CN">
      <head><title>{t.errorTitle}</title></head>
      <body style={{ margin: 0, background: '#FFFFFF', color: '#1C1C1E', fontFamily: '"BeadHue Text", "PingFang SC", system-ui, sans-serif' }}>
        <main id="main" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, boxSizing: 'border-box', textAlign: 'center' }}>
          <section style={{ maxWidth: 360 }}>
            <div aria-hidden="true" style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
              {['#F28B2C', '#FFD447', '#3F7FD9'].map((color) => (
                <span key={color} style={{ width: 20, height: 20, borderRadius: 999, background: color }} />
              ))}
            </div>
            <h1 style={{ margin: 0, fontSize: 20, lineHeight: '28px', fontWeight: 600 }}>{t.errorTitle}</h1>
            <p style={{ margin: '8px 0 24px', color: '#6B6B75', fontSize: 14, lineHeight: '22px' }}>{t.errorBody}</p>
            <button
              type="button"
              onClick={() => retry()}
              style={{ height: 40, border: 0, borderRadius: 999, background: '#3160E6', padding: '0 18px', color: '#FFFFFF', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >
              {t.retry}
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}

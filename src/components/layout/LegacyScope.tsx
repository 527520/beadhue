import type { ReactNode } from 'react';

/**
 * 过渡期（R15 票 03–12）：尚未重做的旧页面内容套在旧样式作用域里（beadhue.css 全部以 .beadhue-ui 开头）。
 * 新外壳（src/components/shell）在它外面，不受旧规则影响；页面重做后去掉这一层，票 13 删除本文件。
 */
export default function LegacyScope({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={className ? `beadhue-ui ${className}` : 'beadhue-ui'} data-theme="candy">
      {children}
    </div>
  );
}

import type { ReactNode } from 'react';

/** 过渡期：旧 SiteHeader 附带的页面标题行（h1 + 说明 + 操作），旧页面内容照旧使用，票 13 删除。 */
export default function LegacyPageHeading({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="beadhue-page-heading">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions ? <div className="row wrap">{actions}</div> : null}
    </div>
  );
}

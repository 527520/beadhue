/** 客户端可见配置的类型与默认值：浏览器端只引这里，不能连带服务端配置（config.ts 读环境变量与全部限额）。 */

/** 客户端可见配置（经 /api/config 下发）。 */
export interface PublicConfig {
  generation: {
    /** 生成默认目标宽度（格） */
    defaultWidth: number;
    /** 生成默认颜色数 */
    defaultColorCount: number;
  };
  exportPng: {
    /** PNG 每格像素 */
    cellPx: number;
    /** 是否裁剪至内容 */
    cropToContent: boolean;
    /** 是否包含图例 */
    includeLegend: boolean;
  };
  exportPdf: {
    /** 每格毫米 */
    cellMm: number;
    /** 页边距毫米 */
    marginMm: number;
    /** 页眉高度毫米 */
    headerMm: number;
    /** 每页列数 */
    pageCols: number;
    /** 每页行数 */
    pageRows: number;
  };
}

export const PUBLIC_CONFIG_DEFAULTS: PublicConfig = {
  generation: { defaultWidth: 58, defaultColorCount: 24 },
  exportPng: { cellPx: 20, cropToContent: true, includeLegend: true },
  // 5mm 底板按 5mm 一格 1:1 打印（可垫在透明底板下直接对照拼）；2.6mm 规格另按 2.6mm。
  exportPdf: { cellMm: 5, marginMm: 8, headerMm: 10, pageCols: 31, pageRows: 45 },
};

/** /api/config 拉取前或失败时的回退。 */
export const publicConfigFallback: PublicConfig = {
  generation: { ...PUBLIC_CONFIG_DEFAULTS.generation },
  exportPng: { ...PUBLIC_CONFIG_DEFAULTS.exportPng },
  exportPdf: { ...PUBLIC_CONFIG_DEFAULTS.exportPdf },
};

'use client';

import { createContext, useContext, type ReactNode } from 'react';

/** 「我的」当前登录者（服务端布局读取后传入）；游客为 null。 */
export interface MeViewer {
  name: string;
  email: string;
  username: string | null;
  /** 头像取色用的稳定 ID（公开作者 ID，旧账号缺省时用邮箱）。 */
  avatarId: string;
  publicAuthorId: string | null;
  verified: boolean;
}

/** GET /api/me/stats。 */
export interface MeStats {
  designs: number;
  publicWorks: number;
  likes: number;
}

export interface MeContextValue {
  viewer: MeViewer | null;
  stats: MeStats | null;
  /** 设计页加载完后的实际数量（本机与云端合并）；null 表示还没加载。 */
  designCount: number | null;
  setDesignCount: (count: number | null) => void;
  /** 删除、复制、撤回公开等操作之后重新读取页头统计。 */
  refreshStats: () => void;
}

const noop = () => undefined;
const FALLBACK: MeContextValue = { viewer: null, stats: null, designCount: null, setDesignCount: noop, refreshStats: noop };
const MeContext = createContext<MeContextValue>(FALLBACK);

export function MeProvider({ value, children }: { value: MeContextValue; children: ReactNode }) {
  return <MeContext value={value}>{children}</MeContext>;
}

/** 没有 MeShell（单独渲染的组件测试、公开色板页）时返回游客默认值。 */
export function useMe(): MeContextValue {
  return useContext(MeContext);
}

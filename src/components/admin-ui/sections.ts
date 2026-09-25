import { Activity, ChartColumn, Flag, Grid3x3, Inbox, Layers, LayoutDashboard, MessagesSquare, ScrollText, Server, Tags, Users, type LucideIcon } from 'lucide-react';
import type { UserRole } from '@/lib/auth/authorization';
import type { AdminOverview } from '@/lib/admin/overview';
import { zhCN } from '@/messages/zh-CN';

export type AdminSectionId = keyof typeof zhCN.adminUi.sections;
type Group = keyof typeof zhCN.adminUi.shell.groups;

export interface AdminSection {
  id: AdminSectionId;
  href: string;
  icon: LucideIcon;
  group: Group;
  /** 审核员可见的模块；其余只给管理员（服务端页面与接口各自再校验一次）。 */
  moderator: boolean;
  /** 侧栏待办计数（取自 /api/admin/overview）。 */
  count?: Exclude<keyof AdminOverview, 'moderationDegraded'>;
}

/** 侧栏分组与顺序：工作台 → 内容 → 用户 → 系统。 */
export const ADMIN_SECTIONS: readonly AdminSection[] = [
  { id: 'overview', href: '/admin', icon: LayoutDashboard, group: 'workbench', moderator: true },
  { id: 'reviews', href: '/admin/reviews', icon: Inbox, group: 'content', moderator: true, count: 'pendingRevisions' },
  { id: 'comments', href: '/admin/comments', icon: MessagesSquare, group: 'content', moderator: true, count: 'pendingComments' },
  { id: 'reports', href: '/admin/reports', icon: Flag, group: 'content', moderator: true, count: 'openReports' },
  { id: 'works', href: '/admin/works', icon: Grid3x3, group: 'content', moderator: true },
  { id: 'tags', href: '/admin/tags', icon: Tags, group: 'content', moderator: true },
  { id: 'batches', href: '/admin/batches', icon: Layers, group: 'content', moderator: false },
  { id: 'users', href: '/admin/users', icon: Users, group: 'people', moderator: false },
  { id: 'analytics', href: '/admin/analytics', icon: ChartColumn, group: 'system', moderator: false },
  { id: 'audit', href: '/admin/audit', icon: ScrollText, group: 'system', moderator: false },
  { id: 'logs', href: '/admin/logs', icon: Activity, group: 'system', moderator: false },
  { id: 'system', href: '/admin/system', icon: Server, group: 'system', moderator: false },
];

export function visibleSections(role: UserRole): AdminSection[] {
  return ADMIN_SECTIONS.filter((section) => role === 'admin' || section.moderator);
}

export function sectionOf(pathname: string): AdminSection {
  return ADMIN_SECTIONS.find((section) => section.id !== 'overview' && (pathname === section.href || pathname.startsWith(`${section.href}/`))) ?? ADMIN_SECTIONS[0];
}

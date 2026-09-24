'use client';

import { Ban, Eye, Info, RefreshCw, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { USER_ROLES, type AccountStatus, type UserRole } from '@/lib/auth/authorization';
import { cn } from '@/lib/cn';
import { zhCN } from '@/messages/zh-CN';
import { useAdminCommand } from '@/components/admin/useAdminCommand';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { DataTable, TitleCell, type Column, type RowMenuEntry } from './data-table';
import { fmtDay } from './format';
import { AdminDrawer, ReasonDialog, Spacer } from './overlays';
import { Dl, DrawerSection, Mono, Note } from './parts';
import { exportCsv, useAdminTable } from './use-admin-table';

const t = zhCN.adminUi.users;
const states = zhCN.communityAdmin.states;
const icon = (Icon: typeof Eye) => <Icon aria-hidden="true" strokeWidth={1.75} />;
const ENDPOINT = '/api/admin/users';

interface UserRow { userId: string; maskedEmail: string | null; username: string | null; role: UserRole; accountStatus: AccountStatus; governanceVersion: number; emailVerified: boolean; createdAt: string }
type Change = { kind: 'role'; role: UserRole } | { kind: 'suspend' } | { kind: 'resume' };

const nameOf = (user: UserRow) => user.username || user.maskedEmail || t.anonymized;
const roleTone = { admin: 'official', moderator: 'info', user: 'neutral' } as const;
const RoleBadge = ({ role }: { role: UserRole }) => <Badge tone={roleTone[role]}>{states.role[role]}</Badge>;
const StatusBadge = ({ user }: { user: UserRow }) => user.accountStatus === 'active' && !user.emailVerified
  ? <Badge tone="warning" dot>{t.unverified}</Badge>
  : <Badge tone={user.accountStatus === 'active' ? 'success' : user.accountStatus === 'suspended' ? 'danger' : 'neutral'} dot>{states.account[user.accountStatus]}</Badge>;

export function UsersConsole({ currentUserId, initialQ }: { currentUserId: string; initialQ?: string }) {
  const toast = useToast();
  const table = useAdminTable<UserRow>(ENDPOINT, 'users', { initialQ });
  const command = useAdminCommand();
  const [openId, setOpenId] = useState<string | null>(null);
  const [draftRole, setDraftRole] = useState<UserRole>('user');
  const [change, setChange] = useState<{ user: UserRow; change: Change } | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const open = table.items.find((user) => user.userId === openId) ?? null;
  const locked = (user: UserRow) => user.userId === currentUserId || user.accountStatus === 'anonymized';
  const view = (user: UserRow) => { setDraftRole(user.role); setOpenId(user.userId); };
  const ask = (user: UserRow, next: Change) => { command.resetNotice(); setConfirmation(''); setChange({ user, change: next }); };
  const submit = async (reason: string) => {
    if (!change) return;
    const { user, change: next } = change;
    const body = { targetConfirmation: confirmation.trim(), expectedVersion: user.governanceVersion, reason,
      ...(next.kind === 'role' ? { role: next.role } : { accountStatus: next.kind === 'suspend' ? 'suspended' : 'active' }) };
    await command.run({ url: `${ENDPOINT}/${user.userId}`, method: 'PATCH', body }, async () => {
      setChange(null);
      toast(next.kind === 'role' ? t.done.role(nameOf(user), states.role[next.role]) : next.kind === 'suspend' ? t.done.suspended(nameOf(user)) : t.done.resumed(nameOf(user)), { icon: icon(next.kind === 'suspend' ? Ban : ShieldCheck) });
      await table.reload();
    });
  };
  const columns: Column<UserRow>[] = [
    { key: 'name', label: t.columns.name, main: true, cell: (user) => <TitleCell lead={<Avatar id={user.userId} name={nameOf(user)} />} title={nameOf(user)} sub={<Mono>{user.userId.slice(0, 8)}</Mono>} onOpen={() => view(user)}
      extra={user.userId === currentUserId ? <span className="text-body-sm text-ink-3">{zhCN.adminUi.common.you}</span> : null} /> },
    { key: 'email', label: t.columns.email, cell: (user) => user.maskedEmail ?? '—' },
    { key: 'role', label: t.columns.role, cell: (user) => <RoleBadge role={user.role} /> },
    { key: 'status', label: t.columns.status, cell: (user) => <StatusBadge user={user} /> },
    { key: 'joined', label: t.columns.joined, sort: (a, b) => a.createdAt.localeCompare(b.createdAt), cell: (user) => <span className="tabular-nums">{fmtDay(user.createdAt)}</span> },
  ];
  const menu = (user: UserRow): RowMenuEntry[] => [
    { id: 'view', label: t.menu.view, icon: icon(Eye), onSelect: () => view(user) },
    { id: 'role', label: t.menu.role, icon: icon(ShieldCheck), disabled: locked(user), onSelect: () => view(user) },
    'separator',
    user.accountStatus === 'suspended'
      ? { id: 'resume', label: t.menu.resume, icon: icon(RefreshCw), disabled: locked(user), onSelect: () => ask(user, { kind: 'resume' }) }
      : { id: 'suspend', label: t.menu.suspend, icon: icon(Ban), danger: true, disabled: locked(user), onSelect: () => ask(user, { kind: 'suspend' }) },
  ];
  const dialogCopy = change ? (change.change.kind === 'role'
    ? { ...t.roleDialog, title: t.roleDialog.title(nameOf(change.user), states.role[change.change.role]), tone: 'primary' as const }
    : change.change.kind === 'suspend' ? { ...t.suspendDialog, title: t.suspendDialog.title(nameOf(change.user)), tone: 'danger' as const }
      : { ...t.resumeDialog, title: t.resumeDialog.title(nameOf(change.user)), tone: 'primary' as const }) : null;
  return (
    <>
      <DataTable<UserRow>
        label={t.label} rows={table.items} rowId={(user) => user.userId} rowName={nameOf} columns={columns} minWidth={920}
        card={(user) => ({ lead: <Avatar id={user.userId} name={nameOf(user)} size="lg" />, title: nameOf(user), meta: <>{user.maskedEmail ?? '—'} · <span className="tabular-nums">{fmtDay(user.createdAt)}</span></>, tail: <><RoleBadge role={user.role} /><StatusBadge user={user} /></> })}
        loading={table.loading} error={table.error} onRetry={() => void table.reload()}
        search={{ value: table.input, onChange: table.setInput, placeholder: t.search }}
        filters={[
          { key: 'role', label: t.filters.role, options: USER_ROLES.map((role) => ({ value: role, label: states.role[role] })) },
          { key: 'accountStatus', label: t.filters.status, options: (['active', 'suspended', 'anonymized'] as const).map((value) => ({ value, label: states.account[value] })) },
        ]}
        filterValues={table.filters} onFilterChange={table.setFilter}
        onExport={() => exportCsv<UserRow>(ENDPOINT, table.query, [
          ['编号', (user) => user.userId], ['用户名', nameOf], ['邮箱（已脱敏）', (user) => user.maskedEmail ?? ''], ['角色', (user) => states.role[user.role]], ['状态', (user) => states.account[user.accountStatus]], ['注册时间', (user) => fmtDay(user.createdAt)],
        ], t.exportFile)}
        menu={menu} onOpen={view} openId={openId}
        page={table.page} pageCount={table.totalPages} total={table.total} size={table.size} onPage={table.setPage} onSize={table.setSize}
        filtered={table.filtered} onReset={table.reset} emptyTitle={t.emptyTitle}
      />
      <AdminDrawer open={Boolean(open)} onOpenChange={(next) => { if (!next) setOpenId(null); }} title={t.drawerTitle}
        footer={open && !locked(open) ? <>
          {open.accountStatus === 'suspended'
            ? <Button variant="outline" onClick={() => ask(open, { kind: 'resume' })}>{icon(RefreshCw)}{t.resume}</Button>
            : <Button data-danger="" variant="danger-outline" onClick={() => ask(open, { kind: 'suspend' })}>{icon(Ban)}{t.suspend}</Button>}
          <Spacer />
          <Button variant="primary" disabled={draftRole === open.role} onClick={() => ask(open, { kind: 'role', role: draftRole })}>{t.saveRole}</Button>
        </> : undefined}>
        {open ? <>
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4">
            <Avatar id={open.userId} name={nameOf(open)} size="xl" />
            <div className="grid gap-0.5">
              <b className="text-title-3 text-ink">{nameOf(open)}</b>
              <span className="text-body-sm text-ink-3">{open.maskedEmail ?? t.anonymized}</span>
              <span className="mt-1.5 flex gap-1.5"><RoleBadge role={open.role} /><StatusBadge user={open} /></span>
            </div>
          </div>
          {open.accountStatus === 'suspended' ? <Note tone="danger" icon={icon(Ban)}>{t.suspended}</Note> : null}
          <DrawerSection title={t.info}>
            <Dl items={[
              [t.id, <Mono key="id">{open.userId}</Mono>, true],
              [t.joined, <span key="j" className="tabular-nums">{fmtDay(open.createdAt)}</span>],
              [t.verified, open.emailVerified ? t.verifiedYes : t.verifiedNo],
            ]} />
          </DrawerSection>
          <DrawerSection title={t.role}>
            <div role="radiogroup" aria-label={t.role} className="grid gap-2">
              {USER_ROLES.map((role) => (
                <label key={role} className={cn('flex cursor-pointer items-start gap-3 rounded-md px-3.5 py-3 inset-ring-1 inset-ring-line-strong transition-shadow duration-state has-checked:inset-ring-2 has-checked:inset-ring-ink has-focus-visible:focus-ring',
                  locked(open) && 'cursor-not-allowed bg-bg-subtle')}>
                  <input type="radio" name="admin-role" value={role} checked={draftRole === role} disabled={locked(open)} onChange={() => setDraftRole(role)} className="mt-1 accent-ink" />
                  <span><b className="block text-body-sm font-semibold text-ink">{states.role[role]}</b><small className="text-caption font-normal text-ink-3">{t.roleHelp[role]}</small></span>
                </label>
              ))}
            </div>
            <p className="mt-1 text-body-sm text-ink-3">{open.userId === currentUserId ? t.selfNote : open.accountStatus === 'anonymized' ? t.anonymizedNote : t.roleNote}</p>
          </DrawerSection>
        </> : null}
      </AdminDrawer>
      {change && dialogCopy ? (
        <ReasonDialog open onOpenChange={(next) => { if (!next) setChange(null); }} title={dialogCopy.title} subject={dialogCopy.subject} label={dialogCopy.label}
          quick={[...dialogCopy.quick]} confirmLabel={dialogCopy.confirm} tone={dialogCopy.tone} command={command} onConfirm={submit}
          extraValid={confirmation.trim() === change.user.userId}
          extra={<>
            {change.change.kind === 'role' && change.change.role === 'admin' ? <Note tone="warning" icon={icon(Info)}>{t.adminWarning}</Note> : null}
            <Field label={t.confirmId} hint={t.confirmIdHint(change.user.userId)}>
              <Input value={confirmation} autoComplete="off" spellCheck={false} className="font-mono text-body-sm" onChange={(event) => setConfirmation(event.target.value)} />
            </Field>
          </>} />
      ) : null}
    </>
  );
}

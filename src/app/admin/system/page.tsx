import Link from 'next/link';
import { forbidden } from 'next/navigation';
import { getDb } from '@/lib/auth/db';
import { authorize } from '@/lib/auth/authorization';
import { getSessionActor } from '@/lib/auth/session';
import { countRecentServerErrors, getSystemInfo } from '@/lib/admin/queries';
import { getServiceStatus } from '@/lib/admin/serviceStatus';
import { summarizeModerationToday } from '@/lib/moderation/commentModeration';
import { cn } from '@/lib/cn';
import { zhCN } from '@/messages/zh-CN';
import { AdminPageHead } from '@/components/admin-ui/page-head';
import { AdminCard, CardHead, Collapsible, Dl } from '@/components/admin-ui/parts';
import { QuotaBar, ServiceList } from '@/components/admin-ui/overview';
import { fmtDate } from '@/components/admin-ui/format';

const RUN_TONE = { succeeded: 'bg-success-soft text-success', failed: 'bg-danger-soft text-danger', running: 'bg-info-soft text-accent' } as const;
const RunBadge = ({ status, label }: { status: keyof typeof RUN_TONE; label: string }) => (
  <span className={cn('inline-flex h-5.5 items-center gap-1 rounded-full px-2 text-caption leading-none font-semibold whitespace-nowrap before:size-1.5 before:rounded-full before:bg-current', RUN_TONE[status])}>{label}</span>
);

/** 系统信息（原型 admin/ops.js systemSection）：版本与迁移事实、依赖服务、内容安全、定时任务与运行历史；没接入的写明「未接入」。 */
export default async function AdminSystemPage() {
  const actor = await getSessionActor();
  if (!authorize(actor, 'system:read')) forbidden();
  const canReadLogs = authorize(actor, 'audit:read');
  const db = getDb();
  const [info, moderation, serverErrors, services] = await Promise.all([
    getSystemInfo(db), summarizeModerationToday(db), canReadLogs ? countRecentServerErrors(db) : Promise.resolve(null), getServiceStatus(db),
  ]);
  const t = zhCN.communityAdmin.system;
  const m = zhCN.communityAdmin.moderationHealth;
  const s = zhCN.adminUi.system;
  const taskLabel = (task: string) => t.tasks[task as keyof typeof t.tasks] ?? task;
  const moderationState = !moderation.enabled ? m.disabled : moderation.health.consecutiveFailures > 0 ? m.failing : moderation.calls >= moderation.budget ? m.budgetExhausted : m.healthy;
  const fact = (label: string, value: string, note: string) => (
    <div className="grid min-w-0 content-start gap-1 px-5 py-4 max-md:px-4 max-md:py-3.5 [&+&]:border-l [&+&]:border-line max-lg:[&:nth-child(3)]:border-l-0 max-lg:[&:nth-child(n+3)]:border-t">
      <span className="text-body-sm font-medium text-ink-2">{label}</span>
      <b className="text-title-1 text-ink tabular-nums">{value}</b>
      <span className="text-caption font-normal [overflow-wrap:anywhere] text-ink-3">{note}</span>
    </div>
  );
  const migrationTag = info.databaseMigration.tag;
  const migrationNumber = migrationTag?.match(/^\d+/u)?.[0] ?? (info.databaseMigration.id === null ? t.empty : String(info.databaseMigration.id));
  const pendingMigration = migrationTag && info.migrationJournalLatest && migrationTag !== info.migrationJournalLatest ? s.migrationPending(info.migrationJournalLatest) : null;
  const date = (value: string | null) => (value ? fmtDate(value) : t.notRecorded);
  return (
    <>
      <AdminPageHead section="system" />
      <div className="grid grid-cols-12 gap-5 max-lg:gap-4 max-md:gap-3">
        <AdminCard className="col-span-full grid grid-cols-4 max-lg:grid-cols-2">
          {fact(s.facts.version, info.applicationVersion, t.app)}
          {fact(s.facts.migration, migrationNumber, pendingMigration ?? migrationTag?.replace(/^\d+_/u, '') ?? info.migrationJournalLatest ?? t.notRecorded)}
          {fact(s.facts.errors, serverErrors === null ? t.empty : String(serverErrors), canReadLogs ? t.logsServerErrors : t.logsDenied)}
          {fact(s.facts.backup, t.backup, t.backupDetail)}
        </AdminCard>
        <AdminCard className="col-span-full flex flex-col xl:col-span-5">
          <CardHead title={s.services} aside={t.timezone} />
          <ServiceList services={services} />
          <div className="mt-auto px-5 pt-3 pb-4 max-md:px-4"><QuotaBar calls={moderation.calls} budget={moderation.budget} /></div>
        </AdminCard>
        <AdminCard className="col-span-full flex flex-col xl:col-span-7">
          <CardHead title={s.moderation} aside={moderationState} />
          <div className="grid gap-3 p-5 max-md:p-4">
            <p className="text-body-sm text-ink-3">{m.help}</p>
            <Dl items={[
              [m.calls, `${moderation.calls} / ${moderation.budget}`], [m.cached, moderation.cached], [m.local, moderation.local], [m.unavailable, moderation.unavailable],
              [m.outcomes, m.outcomeLine(moderation.published, moderation.pendingReview, moderation.rejected, moderation.rateLimited), true],
              [m.lastError, moderation.health.lastErrorAt ? `${date(moderation.health.lastErrorAt.toISOString())} · ${moderation.health.lastErrorCode ?? ''}` : t.empty, true],
            ]} />
          </div>
        </AdminCard>
        <AdminCard className="col-span-full">
          <CardHead title={s.jobs} aside={t.timezone} />
          <div className="grid gap-3 p-5 max-md:p-4">
            <p className="text-body-sm text-ink-3">{t.maintenanceHelp}</p>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-140 border-collapse text-body-sm">
                <caption className="sr-only">{s.jobs}</caption>
                <thead><tr>{[s.columns.task, s.columns.latest, s.columns.success, s.columns.failure].map((label) => <th key={label} scope="col" className="h-10 border-b border-line px-3 text-left font-medium whitespace-nowrap text-ink-3 first:pl-0">{label}</th>)}</tr></thead>
                <tbody>
                  {info.maintenanceTasks.map((task) => (
                    <tr key={task.task}>
                      <td className="h-14 border-b border-line py-2 pr-3 align-middle"><b className="block font-semibold text-ink">{taskLabel(task.task)}</b><span className="font-mono text-caption font-normal text-ink-3">{task.task}</span></td>
                      <td className="border-b border-line px-3 align-middle">{task.latest ? <span className="inline-flex items-center gap-2"><RunBadge status={task.latest.status} label={t.statuses[task.latest.status]} /><span className="tabular-nums">{date(task.latest.startedAt)}</span></span> : t.notRun}</td>
                      <td className="border-b border-line px-3 align-middle tabular-nums">{date(task.lastSuccess?.completedAt ?? null)}</td>
                      <td className="border-b border-line px-3 align-middle tabular-nums">{date(task.lastFailure?.completedAt ?? null)}{task.lastFailure?.errorCode ? <span className="ml-2 font-mono text-caption text-ink-3">{task.lastFailure.errorCode}</span> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Dl items={[[t.journalTime, date(info.databaseMigration.journalTimestamp)], [t.appliedTime, date(info.databaseMigration.appliedAt)], [t.migrationRecorded, info.databaseMigration.status === 'recorded' ? t.migrationRecorded : t.notRecorded, true]]} />
            <p className="text-caption font-normal text-ink-3">{t.migrationTimeHelp}</p>
            <Collapsible summary={`${s.history} · ${t.historyLimit}`}>
              {info.maintenance.length === 0 ? <p className="text-body-sm text-ink-3">{t.notRun}</p> : (
                <div className="relative overflow-x-auto">
                  <table className="w-full min-w-140 border-collapse text-body-sm">
                    <caption className="sr-only">{s.history}</caption>
                    <thead><tr>{[s.columns.task, s.columns.status, s.columns.started, s.columns.completed, s.columns.error].map((label) => <th key={label} scope="col" className="h-10 border-b border-line px-3 text-left font-medium text-ink-3 first:pl-0">{label}</th>)}</tr></thead>
                    <tbody>{info.maintenance.map((run, index) => (
                      <tr key={`${run.task}:${run.startedAt}:${index}`}>
                        <td className="h-11 border-b border-line pr-3">{taskLabel(run.task)}</td>
                        <td className="border-b border-line px-3"><RunBadge status={run.status} label={t.statuses[run.status]} /></td>
                        <td className="border-b border-line px-3 tabular-nums">{date(run.startedAt)}</td>
                        <td className="border-b border-line px-3 tabular-nums">{date(run.completedAt)}</td>
                        <td className="border-b border-line px-3 font-mono text-caption">{run.errorCode ?? t.empty}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </Collapsible>
            {canReadLogs ? <Link href="/admin/logs" className="justify-self-start text-body-sm font-medium text-accent hover:underline hover:underline-offset-3 focus-visible:focus-ring">{s.openLogs}</Link> : null}
          </div>
        </AdminCard>
      </div>
    </>
  );
}

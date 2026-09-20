import { tr, locale } from '../i18n/index'
import type { Storage } from '../api/client'
import type { Job } from './operations'
export type ActiveTask = {
  id: string
  title: string
  target: string
  stage: string
  paused: boolean
  percent?: number
  href?: string
}
const raidActions: Record<string, string> = {
  recover: tr('member_synchronization_c0051cf1'),
  resync: tr('raid_synchronization_9db5d558'),
  reshape: tr('raid_reshape_6bd48796'),
  check: tr('raid_check_d182d58f'),
  repair: tr('raid_repair_77a3429a'),
}
export function raidTasks(arrays: Storage['arrays'] = []): ActiveTask[] {
  return arrays.flatMap((array) => {
    const paused = array.sync === 'frozen' || (!!array.reshapePending && ['idle', ''].includes(array.sync))
    if (!raidActions[array.sync] && !array.reshapePending && !paused) return []
    const title = array.reshapePending
      ? tr('raid_reshape_6bd48796')
      : (raidActions[array.sync] ?? tr('raid_synchronization_9db5d558'))
    const percent =
      array.syncPercent == null || !Number.isFinite(array.syncPercent)
        ? undefined
        : Math.max(0, Math.min(100, array.syncPercent))
    return [
      {
        id: `raid:${array.uuid || array.device}`,
        title,
        target: `${array.name || array.device} · ${array.level.toUpperCase()}`,
        stage: paused
          ? tr('paused_resume_in_storage_b86cbaad')
          : array.syncRemaining != null
            ? tr('about_min_remaining_79ca551d', { v0: Math.ceil(array.syncRemaining / 60) })
            : tr('managed_by_the_system_827e96de'),
        paused,
        percent,
        href: '/storage',
      },
    ]
  })
}
export function longJobs(
  jobs: Job[],
  now: number,
  labels: Record<
    string,
    {
      label: string
    }
  >,
): ActiveTask[] {
  return jobs
    .filter((job) => job.status === 'running' && now - Date.parse(job.created) >= 10000)
    .map((job) => ({
      id: `job:${job.id}`,
      title: labels[job.action]?.label ?? job.action,
      target: job.target,
      stage: job.stage,
      paused: false,
    }))
}
export function taskPercent(task: ActiveTask) {
  return task.percent == null ? '' : `${task.percent.toLocaleString(locale(), { maximumFractionDigits: 1 })}%`
}

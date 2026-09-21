import { tr } from '../i18n/index'
type Completion = {
  status: string
  stage: string
  result?: {
    error?: unknown
  }
}
export async function waitForJob(
  read: () => Promise<Completion | undefined>,
  pause = () => new Promise<void>((resolve) => setTimeout(resolve, 500)),
  attempts = 120,
  timeoutMs = 65000,
) {
  let expired = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const uncertain = () => new Error(tr('the_operation_has_not_been_confirmed_yet_check_its_2e47d73a'))
  const poll = async () => {
    for (let attempt = 0; attempt < attempts && !expired; attempt++) {
      const job = await read().catch(() => {
        throw uncertain()
      })
      if (expired) return
      if (job?.status === 'succeeded') return
      if (job && ['failed', 'interrupted', 'cancelled'].includes(job.status))
        throw new Error(
          typeof job.result?.error === 'string'
            ? job.result.error
            : job.stage || tr('operation_failed_2abb4a75'),
        )
      await pause()
    }
    throw uncertain()
  }
  try {
    await Promise.race([
      poll(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          expired = true
          reject(uncertain())
        }, timeoutMs)
      }),
    ])
  } finally {
    expired = true
    clearTimeout(timer)
  }
}

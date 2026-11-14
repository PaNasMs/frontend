import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { initializeLanguage } from '../src/i18n'
import '../src/style.css'
import '../src/design-system.css'
import '../src/home/components.css'

type PlanRequest = { action: string; params: Record<string, unknown> }
type RunRequest = {
  id: string
  action: string
  params: Record<string, unknown>
  fingerprint?: string
  confirmation?: string
}
type FixtureState = {
  holdPlans: boolean
  plans: PlanRequest[]
  runs: RunRequest[]
  pendingPlanReleases: (() => void)[]
}
declare global {
  interface Window {
    operationConfirmationFixture: FixtureState
  }
}

const params = new URLSearchParams(location.search)
await initializeLanguage(params.get('lang') ?? 'en')
document.documentElement.dataset.theme = params.get('theme') ?? 'light'
document.documentElement.dataset.surface = params.get('material') ?? 'solid'

const state: FixtureState = {
  holdPlans: params.get('hold') === '1',
  plans: [],
  runs: [],
  pendingPlanReleases: [],
}
window.operationConfirmationFixture = state
window.fetch = async (input, init) => {
  const url = new URL(
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    location.href,
  )
  if (!url.pathname.startsWith('/api/v1/'))
    return Response.json({ error: 'Unexpected fixture request' }, { status: 404 })
  const view = url.searchParams.get('view')
  const body = init?.body ? JSON.parse(String(init.body)) : undefined
  if (view === 'plan') {
    state.plans.push(body as PlanRequest)
    if (state.holdPlans) await new Promise<void>((resolve) => state.pendingPlanReleases.push(resolve))
    const plan = body as PlanRequest
    const target = String(plan.params.target ?? 'fixture-object')
    return Response.json({
      target,
      details: [`Reviewed ${plan.action} for ${target}.`],
      fingerprint: `fixture-fingerprint:${plan.action}`,
      confirmation: `fixture-confirmation:${plan.action}`,
    })
  }
  if (view === 'run') {
    state.runs.push(body as RunRequest)
    return Response.json({ id: 'fixture-job' })
  }
  if (view === 'storage-options' || view === 'raid-candidates')
    return Response.json({ devices: [], formats: ['ext4', 'btrfs'] })
  if (view === 'jobs') return Response.json([])
  return Response.json({})
}

const { OperationButton } = await import('../src/app/operations')
const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const target = 'Fixture volume · /dev/mapper/' + 'panasms-bay-01-long-target-'.repeat(3) + 'data'
const targetContext = [{ key: 'target', label: 'Target', value: target }]

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={query}>
    <RouterProvider
      router={createMemoryRouter([
        {
          path: '*',
          element: (
            <>
              <main className="settings-content">
                <div className="page-heading">
                  <div>
                    <h1>Operation confirmation fixture</h1>
                    <p className="muted">A simulated target and server-side plan.</p>
                  </div>
                </div>
                <div className="actions">
                  <OperationButton
                    label="Format fixture volume"
                    actions={['filesystem.format']}
                    initial={{ target, format: 'ext4' }}
                    context={targetContext}
                  />
                  <OperationButton
                    label="Rename fixture file"
                    actions={['file.rename']}
                    initial={{ target: '/srv/fixture/original-name.txt', name: 'renamed-fixture.txt' }}
                    context={[
                      {
                        key: 'target',
                        label: 'Source',
                        value: '/srv/fixture/original-name.txt',
                      },
                    ]}
                  />
                  <OperationButton
                    label="Delete fixture snapshot"
                    actions={['filesystem.snapshot-delete']}
                    initial={{ target: '/mnt/fixture', snapshot: 'snapshot-2026-11-14' }}
                    context={[{ key: 'target', label: 'Target', value: '/mnt/fixture' }]}
                    choices={{
                      snapshot: [{ id: 'snapshot-2026-11-14', label: 'snapshot-2026-11-14' }],
                    }}
                  />
                  <OperationButton
                    label="Restore fixture snapshot"
                    actions={['filesystem.snapshot-restore']}
                    initial={{
                      target: '/mnt/fixture',
                      snapshot: 'snapshot-2026-11-14',
                      name: 'restored-fixture',
                    }}
                    context={[{ key: 'target', label: 'Target', value: '/mnt/fixture' }]}
                    choices={{
                      snapshot: [{ id: 'snapshot-2026-11-14', label: 'snapshot-2026-11-14' }],
                    }}
                  />
                  <OperationButton
                    label="Remove fixture file"
                    actions={['file.trash']}
                    autoReview
                    initial={{ target: '/srv/fixture/long-fixture-name.txt' }}
                    context={[
                      {
                        key: 'target',
                        label: 'Source',
                        value: '/srv/fixture/long-fixture-name.txt',
                      },
                    ]}
                  />
                  <OperationButton
                    label="Delete fixture file"
                    actions={['file.delete']}
                    autoReview
                    initial={{ target: '/srv/fixture/long-fixture-name.txt' }}
                    context={[
                      {
                        key: 'target',
                        label: 'Path',
                        value: '/srv/fixture/long-fixture-name.txt',
                      },
                    ]}
                  />
                </div>
              </main>
            </>
          ),
        },
      ])}
    />
  </QueryClientProvider>,
)

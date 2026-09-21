import { useRouteError, useNavigate } from 'react-router-dom'
import { tr } from '../i18n'

export function PageError() {
  const error = useRouteError()
  const navigate = useNavigate()
  return (
    <section className="surface empty-state" role="alert">
      <h1>{tr('ui.pageError')}</h1>
      <p className="muted">{tr('ui.pageErrorHelp')}</p>
      <div className="actions">
        <button className="button primary" onClick={() => void navigate(0)}>
          {tr('retry_9e506acb')}
        </button>
        <button className="button" onClick={() => void navigate('/')}>
          {tr('go_to_desktop_487f0618')}
        </button>
      </div>
      <details>
        <summary>{tr('ui.details')}</summary>
        <pre>{error instanceof Error ? error.message : String(error)}</pre>
      </details>
    </section>
  )
}

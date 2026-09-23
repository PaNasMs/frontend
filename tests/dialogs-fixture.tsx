import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import * as Dialog from '@radix-ui/react-dialog'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { DialogContent } from '../src/shared/waiting'
import { NotificationToasts, notify } from '../src/app/notifications'
import { initializeLanguage } from '../src/i18n'
import '../src/style.css'
import '../src/design-system.css'
function Fixture() {
  const [open, setOpen] = useState(false)
  const [nested, setNested] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState('')
  const [theme, setTheme] = useState('light')
  return (
    <div data-theme={theme} style={{ minHeight: '160vh', padding: 24 }}>
      <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>Theme</button>
      <button
        onClick={() =>
          notify('Settings saved. This notification can be dismissed without changing its history.')
        }
      >
        Notify
      </button>
      <button onClick={() => setOpen(true)}>Open manually</button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger asChild>
          <button>Open form</button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <DialogContent
            className="settings-dialog"
            busy={busy}
            header={
              <>
                <Dialog.Title>Example settings</Dialog.Title>
                <Dialog.Description>Shared modal checks</Dialog.Description>
              </>
            }
            footer={
              <div className="actions">
                <Dialog.Close asChild>
                  <button data-dialog-cancel className="button">
                    Cancel
                  </button>
                </Dialog.Close>
                <button form="example" className="button primary">
                  Save
                </button>
              </div>
            }
          >
            <form
              id="example"
              onSubmit={(event) => {
                event.preventDefault()
                setBusy(true)
                setTimeout(() => {
                  setBusy(false)
                  setResult('Expected error: changes retained')
                }, 600)
              }}
            >
              <label>
                Name
                <input defaultValue="Original" />
              </label>
              <Dialog.Root open={nested} onOpenChange={setNested}>
                <Dialog.Trigger asChild>
                  <button type="button">Choose folder</button>
                </Dialog.Trigger>
                <Dialog.Portal>
                  <Dialog.Overlay className="dialog-overlay" />
                  <DialogContent
                    className="settings-dialog"
                    intent="inspect"
                    dirty={false}
                    header={
                      <>
                        <Dialog.Title>Choose folder</Dialog.Title>
                        <Dialog.Description>Select a destination</Dialog.Description>
                      </>
                    }
                  >
                    <button type="button" onClick={() => setNested(false)}>
                      Use Home
                    </button>
                  </DialogContent>
                </Dialog.Portal>
              </Dialog.Root>
              {Array.from({ length: 30 }, (_, i) => (
                <p key={i}>Details row {i}</p>
              ))}
              {result && <p role="alert">{result}</p>}
            </form>
          </DialogContent>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={confirm} onOpenChange={setConfirm}>
        <Dialog.Trigger asChild>
          <button>Delete example</button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <DialogContent
            className="dialog"
            variant="compact"
            intent="confirm"
            dirty={false}
            header={
              <>
                <Dialog.Title>Delete file?</Dialog.Title>
                <Dialog.Description>
                  Delete <strong>example.txt</strong>?
                </Dialog.Description>
              </>
            }
            footer={
              <div className="actions">
                <Dialog.Close asChild>
                  <button data-dialog-cancel className="button">
                    Cancel
                  </button>
                </Dialog.Close>
                <button className="button danger">Delete</button>
              </div>
            }
          />
        </Dialog.Portal>
      </Dialog.Root>
      <NotificationToasts />
    </div>
  )
}
await initializeLanguage()
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter>
      <Fixture />
    </MemoryRouter>
  </QueryClientProvider>,
)

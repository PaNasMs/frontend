import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import * as Dialog from '@radix-ui/react-dialog'
import { DialogContent } from '../src/shared/waiting'
import { initializeLanguage } from '../src/i18n'
import '../src/style.css'
function Fixture() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState('')
  return (
    <Dialog.Root defaultOpen>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <DialogContent
          className="settings-dialog"
          busy={busy}
          message="Checking the overlay"
          hint="Input and closing must remain blocked until completion."
        >
          <Dialog.Title>Waiting overlay checks</Dialog.Title>
          <Dialog.Description>
            Scroll down, start the operation, then try Escape and keyboard navigation.
          </Dialog.Description>
          <label>
            Editable value
            <input defaultValue="Unchanged" />
          </label>
          <div style={{ height: 1500 }}>Long form to verify coverage after scrolling.</div>
          <button
            className="button"
            onClick={async () => {
              setBusy(true)
              setResult('')
              try {
                await new Promise((resolve) => setTimeout(resolve, 10000))
                throw Error('Expected test error: you can retry.')
              } catch (error) {
                setResult((error as Error).message)
              } finally {
                setBusy(false)
              }
            }}
          >
            Start ten-second check
          </button>
          <Dialog.Close className="button">Close</Dialog.Close>
          <p role="alert">{result}</p>
        </DialogContent>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
await initializeLanguage()
const root = createRoot(document.getElementById('root')!)
root.render(<Fixture />)
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount())

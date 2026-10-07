import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AccessForm, type Access } from '../src/app/network-access'
import { initializeLanguage } from '../src/i18n'
import '../src/style.css'
import '../src/home/components.css'
const query = new QueryClient()
function Fixture() {
  const [hardware, setHardware] = useState('both')
  const incoming: Access = {
    config: {
      enabled: false,
      adapter: '',
      ssid: 'Test NAS',
      password: '12345678',
      band: 'auto',
      delay: 90,
      onLoss: true,
      usb: false,
    },
    devices:
      hardware === 'wifi' || hardware === 'both'
        ? [
            {
              name: 'wlan0',
              mac: '02:00:00:00:00:01',
              ap: true,
              kind: 'wifi',
              reserved: false,
              bands: ['bg'],
              addresses: [],
            },
          ]
        : [],
    state: { phase: 'disabled', clients: 0, usbState: 'disabled' },
    usb: {
      available: hardware === 'usb' || hardware === 'both',
      port: 'USB-C',
      reason: 'unsupported',
      reboot: false,
    },
  }
  return (
    <main className="settings-content">
      <nav aria-label="Test hardware">
        {['none', 'wifi', 'usb', 'both'].map((value) => (
          <button key={value} onClick={() => setHardware(value)}>
            {value}
          </button>
        ))}
      </nav>
      <AccessForm incoming={incoming} />
    </main>
  )
}
const options = new URLSearchParams(location.search)
document.documentElement.dataset.theme = options.get('theme') ?? 'dark'
await initializeLanguage(options.get('lang') ?? 'en')
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={query}>
    <RouterProvider router={createMemoryRouter([{ path: '*', element: <Fixture /> }])} />
  </QueryClientProvider>,
)

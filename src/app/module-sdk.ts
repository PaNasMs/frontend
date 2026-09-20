import * as navigation from './navigation'
import * as translation from '../i18n'
import { registerServerMessages, serverText } from '../i18n/server'
const i18n = { ...translation, registerServerMessages, serverText }
import * as react from 'react'
import * as jsx from 'react/jsx-runtime'
import * as query from '@tanstack/react-query'
import * as dialog from '@radix-ui/react-dialog'
import * as router from 'react-router-dom'
import * as ui from '../shared/ui'
import * as operations from './operations'
import * as removable from './removable'
import * as runtime from './module-registry'
import * as completion from '../shared/job-completion'
import * as layout from './desktop-layout'
import * as client from '../api/client'
export const SDK = {
  navigation,
  i18n,
  react,
  jsx,
  query,
  dialog,
  router,
  ui,
  operations,
  removable,
  runtime,
  completion,
  layout,
  client,
}
Object.assign(globalThis, { PaNasMsSDK: SDK })

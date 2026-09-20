import { tr } from '../i18n/index'
import { serverText, localizeResponse } from '../i18n/server'
import type { components } from './schema'
export type Identity = components['schemas']['Identity']
export type Accounts = components['schemas']['Accounts']
export type Metrics = components['schemas']['Metrics']
export type Storage = components['schemas']['Storage']
export type Device = components['schemas']['Device']
export type Mount = components['schemas']['Mount']
export type Preferences = components['schemas']['Preferences']
export class APIError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}
export async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const r = await fetch(`/api/v1/${path}`, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-OstojaOS-Request': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!r.ok) {
    const data = await r.json().catch(() => ({}))
    throw new APIError(r.status, serverText(data.error ?? tr('common.requestFailed', { status: r.status })))
  }
  return r.status === 204 ? (undefined as T) : localizeResponse(await r.json())
}

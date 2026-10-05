import { GoogleConnect, ProviderConnect } from './external-connections'
import { useId, useState } from 'react'
import { WaitingOverlay } from '../shared/ui'
import { i18n, language, languageNames, languages, tr, type Language } from '../i18n/index'
import { applyTheme, themes, type Theme } from '../home/theme'
import { guestTheme, rememberGuestLanguage, rememberGuestTheme } from '../home/guest'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { request, APIError, type Identity } from '../api/client'
import { Button, Notice } from '../shared/ui'
const themeNames: Record<Theme, string> = {
  light: 'ui.light',
  dark: 'ui.dark',
  'light-glass': 'ui.lightGlass',
  'dark-glass': 'ui.darkGlass',
}
const credentials = z.object({
  username: z.string().min(1, tr('enter_a_username_912873bd')),
  password: z.string().min(1, tr('enter_your_password_9728edf3')),
})
export default function Login() {
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const q = useQueryClient()
  const form = useForm<z.infer<typeof credentials>>({ resolver: zodResolver(credentials) })
  const login = useMutation({
    mutationFn: (v: z.infer<typeof credentials>) =>
      request<Identity>('login', 'POST', { ...v, ...(next ? { newPassword: next } : {}) }),
    onSuccess: (id) => {
      q.clear()
      q.setQueryData(['session'], id)
      location.reload()
    },
  })
  const expired = (login.error instanceof APIError && login.error.status === 409) || !!next
  const [theme, setTheme] = useState<Theme>(guestTheme)
  const title = useId()
  const usernameError = useId()
  const passwordError = useId()
  const errors = form.formState.errors
  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby={title}>
        <header>
          <p className="login-product">PaNasMs</p>
          <h1 id={title}>{tr('login.title')}</h1>
        </header>
        <form className="login-form" onSubmit={form.handleSubmit((v) => login.mutate(v))}>
          <label className="field">
            {tr('user_51aff185')}
            <input
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              aria-invalid={!!errors.username}
              aria-describedby={errors.username ? usernameError : undefined}
              {...form.register('username')}
            />
          </label>
          {errors.username && (
            <p className="error-text" id={usernameError}>
              {errors.username.message}
            </p>
          )}
          <label className="field">
            {tr('password_14f7c63c')}
            <input
              type="password"
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? passwordError : undefined}
              {...form.register('password')}
            />
          </label>
          {errors.password && (
            <p className="error-text" id={passwordError}>
              {errors.password.message}
            </p>
          )}
          {expired && (
            <>
              <p className="muted small">{tr('accounts.expiredPasswordHelp')}</p>
              <label className="field">
                {tr('new_password_5e611d70')}
                <input
                  type="password"
                  autoComplete="new-password"
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  required
                />
              </label>
              <label className="field">
                {tr('repeat_new_password_e32d8bb9')}
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </label>
            </>
          )}
          {login.error && <Notice error>{login.error.message}</Notice>}
          <Button
            className="primary login-submit"
            disabled={login.isPending || (expired && (!next || next !== confirm))}
          >
            {login.isPending ? tr('checking_cbf41dbe') : tr('sign_in_939e95a1')}
          </Button>
          {login.isPending && <WaitingOverlay />}
        </form>
        <div className="login-providers" data-divider={tr('login.or')}>
          <GoogleConnect />
          <ProviderConnect providerId="github" />
        </div>
        <footer className="login-preferences">
          <label>
            <span className="sr-only">{tr('login.language')}</span>
            <select
              value={language(i18n.language)}
              onChange={(e) => {
                rememberGuestLanguage(e.target.value as Language)
                location.reload()
              }}
            >
              {languages.map((code) => (
                <option key={code} value={code}>
                  {languageNames[code]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">{tr('login.theme')}</span>
            <select
              value={theme}
              onChange={(e) => {
                const value = e.target.value as Theme
                setTheme(value)
                rememberGuestTheme(value)
                applyTheme(value)
              }}
            >
              {themes.map((value) => (
                <option key={value} value={value}>
                  {tr(themeNames[value])}
                </option>
              ))}
            </select>
          </label>
        </footer>
      </section>
    </main>
  )
}

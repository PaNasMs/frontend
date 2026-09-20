import { WaitingOverlay } from '../shared/ui'
import { tr } from '../i18n/index'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { mdiShieldCheckOutline, mdiArrowRight, mdiHarddisk } from '@mdi/js'
import { request, type Identity } from '../api/client'
import { Button, Icon, Notice } from '../shared/ui'
const credentials = z.object({
  username: z.string().min(1, tr('enter_a_username_912873bd')),
  password: z.string().min(1, tr('enter_your_password_9728edf3')),
})
export default function Login() {
  const q = useQueryClient()
  const form = useForm<z.infer<typeof credentials>>({ resolver: zodResolver(credentials) })
  const login = useMutation({
    mutationFn: (v: z.infer<typeof credentials>) => request<Identity>('login', 'POST', v),
    onSuccess: (id) => {
      q.clear()
      q.setQueryData(['session'], id)
      location.reload()
    },
  })
  return (
    <main className="login-page">
      <section className="login-intro">
        <div className="wordmark">
          PaNas<span>Ms</span>
          <span className="logo-dot" />
        </div>
        <span className="eyebrow">{tr('your_space_b869dc8f')}</span>
        <h1>
          {tr('your_data_at_home_10b1a132')}
          <br />
          {tr('everything_under_control_23e0d0a5')}
        </h1>
        <p>{tr('your_personal_nas_control_panel_2fcbfa19')}</p>
        <div className="login-orbit">
          <Icon path={mdiHarddisk} size={70} />
          <span />
          <span />
        </div>
      </section>
      <section className="login-card">
        <div className="icon-box">
          <Icon path={mdiShieldCheckOutline} size={30} />
        </div>
        <h2>{tr('welcome_031669e1')}</h2>
        <p className="muted">{tr('sign_in_with_your_linux_account_7fe1dcf6')}</p>
        <form style={{ position: 'relative' }} onSubmit={form.handleSubmit((v) => login.mutate(v))}>
          <label className="field">
            {tr('user_51aff185')}
            <input autoComplete="username" autoFocus {...form.register('username')} />
          </label>
          {form.formState.errors.username && (
            <p className="error-text">{form.formState.errors.username.message}</p>
          )}
          <label className="field">
            {tr('password_14f7c63c')}
            <input type="password" autoComplete="current-password" {...form.register('password')} />
          </label>
          {form.formState.errors.password && (
            <p className="error-text">{form.formState.errors.password.message}</p>
          )}
          {login.error && <Notice error>{login.error.message}</Notice>}
          <Button className="primary login-submit" disabled={login.isPending}>
            {login.isPending ? tr('checking_cbf41dbe') : tr('sign_in_939e95a1')}
            <Icon path={mdiArrowRight} />
          </Button>
          {login.isPending && <WaitingOverlay />}
        </form>
        <p className="small muted">{tr('access_for_existing_linux_users_in_the_sudo_group_bbc94faa')}</p>
      </section>
      <div className="login-foot">{tr('panasms_prototype_0_1_f18e5220')}</div>
    </main>
  )
}

import { useEffect } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

export function useRouteTab(base: string, choices: readonly string[], fallback: string) {
  const location = useLocation()
  const navigate = useNavigate()
  const segment = location.pathname.slice(base.length + 1).split('/')[0]
  const selected = choices.includes(segment) ? segment : fallback
  useEffect(() => {
    if (!choices.includes(segment))
      void navigate({ pathname: `${base}/${fallback}`, search: location.search }, { replace: true })
  }, [base, fallback, segment, location.search, navigate, choices.join('|')])
  return [
    selected,
    (next: string) => {
      if (choices.includes(next) && next !== selected)
        void navigate({ pathname: `${base}/${next}`, search: location.search })
    },
  ] as const
}

export function queryValue(
  params: URLSearchParams,
  key: string,
  fallback: string,
  choices?: readonly string[],
) {
  const value = params.get(key)
  return value !== null && (!choices || choices.includes(value)) ? value : fallback
}
export function updateQuery(params: URLSearchParams, key: string, value: string, fallback: string) {
  const next = new URLSearchParams(params)
  if (value === fallback) next.delete(key)
  else next.set(key, value)
  return next
}
export function useQueryValue(key: string, fallback = '', choices?: readonly string[]) {
  const [params, setParams] = useSearchParams()
  return [
    queryValue(params, key, fallback, choices),
    (value: string) => {
      setParams((current) => updateQuery(current, key, value, fallback))
    },
  ] as const
}

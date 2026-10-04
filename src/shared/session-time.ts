// loginctl reports "Sun 2026-10-04 20:01:33 UTC": the NAS wall clock plus a zone abbreviation.
// UTC converts to the viewer's zone. Other abbreviations are ambiguous, so the NAS wall clock is
// kept and only its presentation is localized. Unrecognized values are returned unchanged.
export function sessionTime(value: string | number, language: string) {
  if (typeof value === 'number') return new Date(value * 1000).toLocaleString(language)
  const match = value.match(/^(?:\S+ )?(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d) (\S+)$/)
  if (!match) return value
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number)
  const time = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  if (Number.isNaN(time.getTime())) return value
  return match[7] === 'UTC' || match[7] === 'GMT'
    ? time.toLocaleString(language)
    : time.toLocaleString(language, { timeZone: 'UTC' }) + ' ' + match[7]
}

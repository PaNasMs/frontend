/**
 * Below 640px a table is shown as stacked rows without its header row. Each cell
 * therefore carries the text of its column header in `data-label`, which the
 * stylesheet prints before the value. Runs for every table in a `.table-wrap`
 * (and the Containers module's own wrapper), so pages need no change of their own.
 */
function label(table: HTMLTableElement) {
  const heads = Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent?.trim() ?? '')
  if (!heads.length) return
  for (const row of table.querySelectorAll('tbody tr')) {
    let column = 0
    for (const cell of row.children) {
      const text = heads[column] ?? ''
      if (cell instanceof HTMLTableCellElement) {
        if (text && cell.dataset.label !== text) cell.dataset.label = text
        column += cell.colSpan || 1
      }
    }
  }
}
export function watchTableLabels(root: HTMLElement) {
  const run = () =>
    root.querySelectorAll<HTMLTableElement>('.table-wrap table, .containers-table-wrap table').forEach(label)
  let scheduled = 0
  const observer = new MutationObserver(() => {
    if (scheduled) return
    scheduled = requestAnimationFrame(() => {
      scheduled = 0
      run()
    })
  })
  run()
  observer.observe(root, { childList: true, subtree: true })
  return () => {
    observer.disconnect()
    if (scheduled) cancelAnimationFrame(scheduled)
  }
}

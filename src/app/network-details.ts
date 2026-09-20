type NetworkInterface = { name: string }
type Group = { source: string; outputs: string[]; bridge: string; mode: string }
export function connectionNetwork<T extends NetworkInterface>(item: T, interfaces: T[], groups: Group[]): T {
  const group = groups.find((g) => g.source === item.name || g.outputs.includes(item.name))
  if (group && (group.mode === 'bridge' || group.source !== item.name)) {
    return interfaces.find((i) => i.name === group.bridge) ?? item
  }
  return item
}

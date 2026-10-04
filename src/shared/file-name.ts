// One path component accepted by the file operations: the same rule as the name-conflict dialog.
export const validFileName = (name: string) =>
  !!name &&
  name === name.trim() &&
  !/[\/\x00-\x1f\x7f]/.test(name) &&
  !['.', '..'].includes(name) &&
  new TextEncoder().encode(name).length <= 255
export const baseName = (path: string) => path.split('/').filter(Boolean).at(-1) ?? ''
// Renaming keeps the item in its folder: only the last path component changes.
export const siblingPath = (path: string, name: string) => path.slice(0, path.lastIndexOf('/') + 1) + name
// Length of the name without its extension, for preselecting the part a rename usually changes.
export const stemLength = (name: string) => (name.lastIndexOf('.') > 0 ? name.lastIndexOf('.') : name.length)
// The trash does not record where an item came from. Suggest the root of the storage that holds
// this trash instead of the internal trash path; other paths are returned unchanged.
export const restoreDestination = (path: string) => {
  const match = path.match(/^(.*?)\/\.panasms-trash-\d+\/(?:.*\/)?([^/]+)$/)
  return match ? match[1] + '/' + match[2] : path
}

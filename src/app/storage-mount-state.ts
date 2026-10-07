import type { Device, Mount } from '../api/client'

export const volumeMount = (device: Device, mounts: Mount[]) =>
  mounts.find((mount) => mount.source === device.path || device.mountpoints?.includes(mount.target))

export const volumeMountPoint = (device: Device, mounts: Mount[]) =>
  volumeMount(device, mounts)?.target || device.mountpoints?.find(Boolean) || ''

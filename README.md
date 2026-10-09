# PaNasMs frontend

This is the web panel of PaNasMs (Pavlo's NAS Management System), a React single-page
application. The [backend](https://github.com/PaNasMs/backend) serves its static HTML, CSS and
JavaScript, and both ship in the same core Debian package. You need Node.js only to build and
develop it. The current release is 0.2.15. To install PaNasMs on a NAS, follow the
[main repository](https://github.com/PaNasMs/panasms) or the
[installation guide](https://panasms.github.io/docs/setup/install/). The
[project website](https://panasms.github.io/) has screenshots and setup guides in English,
Russian and Ukrainian.

Core and module interfaces follow the
[PaNasMs interface design standard](https://github.com/PaNasMs/panasms/blob/main/docs/ui-design-guidelines.md).
Read it before designing, implementing or reviewing an interface. Do not keep a separate
module-specific standard.

## What the panel contains

- A per-user desktop with a widget grid, wallpaper, shortcuts and taskbar ordering.
- Users and groups, storage and mounts, shared folders, network, services, logs, updates and
  metric history.
- Settings grouped by system area, with advanced controls kept separate.
- Task, notification and removable-device menus in the top bar.
- The module catalog, archive installation, module details and lifecycle actions.
- English (default and fallback), Russian and Ukrainian translations. Each user picks their own
  language.

Files, Terminal, Cloud Sync and Containers are installable modules with their own source and
release repositories. The panel loads their pages through the module API. The backend performs
system operations and enforces authorization.

## Stack and source layout

The panel uses React 19, strict TypeScript, Vite, React Router, TanStack Query, i18next, Radix
Dialog and Tabs, and Material Design Icons SVG paths from `@mdi/js`. Most styling is custom CSS,
and Tailwind is configured. The login form uses React Hook Form and Zod.

| Path | Contents |
| --- | --- |
| [src/app](src/app) | Shell, desktop and system feature views |
| [src/shared](src/shared) | Shared controls such as dialogs, pickers and waiting overlays |
| [src/home](src/home) | Design tokens, theme and shared component styles |
| [src/api](src/api) | HTTP client and generated OpenAPI declarations |
| [src/i18n](src/i18n) | Core translations and server-message localization |
| [tests](tests) | Unit tests and browser checks |

HTTP requests carry snapshots and commands. An authenticated WebSocket carries events and cache
invalidations. Nested routes keep the selected storage or settings section across reloads. Most
system feature components still live in `src/app` and have not been split into feature
directories.

## Development

You need Node.js 22.12 or newer and npm 9.5 or newer.

```sh
npm ci
npm run dev           # Vite dev server on 127.0.0.1
npm run format:check
npm run test:unit
npm run build         # type check and production bundle in dist/
```

Other scripts:

- `npm run typecheck` checks TypeScript without building a bundle.
- `npm run format` formats `src` and `tests` with Prettier.
- `npm run test:smoke` runs the browser smoke script. It needs `PANASMS_SMOKE_DIR` from the
  backend's `TestBrowserHarness` Go test and Chrome (set `CHROME_PATH` if it is not at
  `/opt/google/chrome/chrome`).
- `npm run test:dialogs` checks the shared dialogs in Chrome against a running dev server
  (`DIALOG_TEST_URL`, default `http://127.0.0.1:5173`).
- `npm run build:modules` builds the Files, Terminal and Cloud Sync bundles for local integration.
  It is not the release pipeline. Official module releases build in their own repositories:
  [Files](https://github.com/PaNasMs/module-files),
  [Terminal](https://github.com/PaNasMs/module-terminal),
  [Cloud Sync](https://github.com/PaNasMs/module-cloud-sync) and
  [Containers](https://github.com/PaNasMs/module-containers).

The translation tests also read the Files and Terminal dictionaries. For the full unit suite,
clone those repositories to `../modules/files` and `../modules/terminal` as in the
[workspace layout](https://github.com/PaNasMs/panasms#workspace-setup). The core bundle does not
include their runtime code.

Vite proxies `/api`, including WebSockets, to `http://127.0.0.1:8080`. Real system operations
need a running backend and agent. There is no mock NAS backend.

To regenerate the API declarations, clone the backend next to the frontend in the same workspace
layout and run:

```sh
npm run generate:api
```

The source contract is `backend/api/openapi.yaml`. Its management operation schemas are
incomplete, so the generated declarations do not cover the whole API.

## Builds and packages

Pushes to `main`, pull requests and manual runs start the **Build PaNasMs** workflow. It calls the
shared [PaNasMs package build](https://github.com/PaNasMs/panasms/blob/main/documentation/builds.md),
which pairs this frontend commit with the resolved backend commit and tests the result in native
ARM64 and AMD64 Debian 13 jobs. Download the packages and source manifest from the run's
artifacts on this repository's **Actions** tab. These artifacts do not install themselves.

The [update publisher](https://github.com/PaNasMs/updates) imports successful `main` builds into
the signed testing channel. Stable releases come from a version tag in the main repository. A NAS
installs updates according to its own channel and update policy.

## Interface notes

### Accounts

User and group cards open detail tabs for profile, access policy, SSH keys, panel and SSH
sessions, and security history. Ordinary users see their own profile, Files, their desktop and
read-only system widgets. The backend protects administrative routes whether or not the menu
shows them. Passwords follow the host Linux PAM policy. A sign-in with an expired password goes
through the required password change before the panel opens.

### Shared folders

The built-in `/sharing` page publishes local folders over SMB and NFS. Mounting remote shares is
a separate feature. The editor selects a folder and protocols, then user and group access and NFS
clients. Each user's Security tab controls SMB access and shows the password sync status.
`/sharing?tab=connections` lists active SMB sessions with disconnect actions. Changes wait for the
backend job to finish, refresh the data and show errors in place.

### Shared controls

`MultiSelect` is the compact searchable control for membership selection. `FolderField` picks
filesystem destinations through a named policy: `home`, `share`, `mount` or `data`. Each policy
uses an administrator-only server query with its own roots and restrictions. To create a new
destination, select an existing parent and type only the new folder name. Selecting a folder never
creates or moves data. The backend repeats home-volume checks when it plans and runs operations.

Dialogs use the shared header, body and footer layout from `src/shared`, with a scrollable body
and fixed actions. Shadow tokens (`--shadow-card`, `--shadow-card-hover`, `--shadow-raised`) and
other visual tokens live in `src/home/tokens.css`. The design standard defines how to use them.

### Settings, modules and updates

When the HTTP port changes in general settings, the panel checks `/api/v1/health` on the new
address before navigating and offers a manual link if the check fails. Administrators add module
repositories from the Modules toolbar and must review the publisher key first.

System update controls are at `/settings/updates`: channel, installation policy, maintenance
window, version comparison, actions, progress and history. The panel reconnects after a core
restart, and the installation keeps running in a separate service. See the
[update lifecycle](https://github.com/PaNasMs/panasms/blob/main/documentation/system-updates.md).

### Notifications

A notification shows its severity as an icon beside the message and its actions beside the date.
Operation notifications open the related task details. Reviewing an operation and dismissing its
notification are separate actions. Clearing notification history does not clear active hardware
conditions. The backend tells apart failures that happened before any change from operations whose
results still need review.

### External connections

Google account linking and optional Google sign-in to the panel use OAuth credentials registered
for each NAS. The [Google sign-in guide](https://panasms.github.io/docs/setup/google/) walks
administrators through the setup with screenshots. The
[external connections document](https://github.com/PaNasMs/panasms/blob/main/documentation/external-connections.md)
covers the architecture and the handoff to Cloud Sync.

## License

Original code is licensed under [PolyForm Noncommercial 1.0.0](LICENSE). See [NOTICE](NOTICE)
for third-party components. Public documentation is in English.

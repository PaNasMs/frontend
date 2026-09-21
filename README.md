# PaNasMs frontend

React SPA for **Pavlo's NAS Management System**, currently prototype 0.2.1.
Production output is static HTML, CSS and JavaScript served by the
[backend](https://github.com/PaNasMs/backend); Node.js is only a build/development dependency.

## Interface

- Per-user desktop grid, widgets, wallpaper, shortcuts and taskbar ordering.
- Users/groups, storage and mounts, network, services, logs, updates and metric history.
- Settings grouped by system area, with separate advanced controls.
- Task, notification and removable-device menus in the top bar.
- Module catalog, archive installation, module details and lifecycle actions.
- English default/fallback translations, plus Russian and Ukrainian; each user
  can choose their own language.

Files, Terminal and Cloud Sync are installable modules with separate source and
release repositories. The SPA hosts their contributions through the module API.
System operations and authorization are enforced by the backend.

## Stack and source layout

React 19, strict TypeScript, Vite, React Router, TanStack Query, i18next,
Radix Dialog/Tabs and local Material Design Icons SVG paths. Styling is primarily
custom CSS; Tailwind is configured. The login form uses React Hook Form and Zod.

| Path | Contents |
| --- | --- |
| [src/app](src/app) | Shell, desktop and system feature views |
| [src/api](src/api) | HTTP client and generated OpenAPI declarations |
| [src/i18n](src/i18n) | Core translations and server-message localization |
| [tests](tests) | Unit and browser smoke checks |

HTTP carries snapshots and commands; the authenticated WebSocket carries events
and invalidations. Nested routes preserve selected storage/settings sections
across reloads. Most system feature components still live in `src/app`; a complete
split into feature directories has not been done.

## Development and checks

Requirements: Node.js 22.12 or newer and npm 9.5 or newer.

```sh
npm ci
npm run dev
npm run format:check
npm run test:unit
npm run build
```

Vite proxies `/api`, including WebSockets, to `http://127.0.0.1:8080`. A working
backend/agent installation is required for real system operations; there is no
mock NAS backend. Production output is written to `dist/`.

`npm run typecheck` checks TypeScript without producing a Vite bundle;
`npm run format` formats source and tests. `npm run test:smoke` runs the separate
browser smoke script; inspect its environment requirements before using it.

To regenerate API declarations, clone backend beside frontend in the
[workspace layout](https://github.com/PaNasMs/panasms#workspace-setup), then run:

```sh
npm run generate:api
```

The source contract is `backend/api/openapi.yaml`. Management operation schemas
are not yet complete, so the generated declarations do not cover the entire API.

Official module releases build from their own repositories:
[Files](https://github.com/PaNasMs/module-files),
[Terminal](https://github.com/PaNasMs/module-terminal) and
[Cloud Sync](https://github.com/PaNasMs/module-cloud-sync).
The workspace `build:modules` command is a local integration build, not the
registry release pipeline.

## License

Public documentation is maintained in English. Original code uses
[PolyForm Noncommercial 1.0.0](LICENSE); see [NOTICE](NOTICE) for third-party scope.

## Account interface

Core 0.2.3 adds user/group cards and account detail tabs for profile, access policy,
SSH keys, panel/SSH sessions and security history. Ordinary users see their own
profile, Files, desktop and read-only system widgets. Administrative routes remain
protected by the backend independently of their visibility in the application menu.
Passwords follow the host Linux PAM policy; expired-password sign-in completes the
required password change before entering the application.

## Shared folders

The built-in `/sharing` module manages local SMB/NFS publication, separately from
mounting remote shares. Folder cards expose edit, Linux permission and unpublish
icons. The compact editor selects a folder and protocols, then user/group access
and NFS clients. The Security tab of each user controls SMB access and shows password sync status;
`/sharing?tab=connections` displays active SMB sessions and disconnect actions.
Mutations wait for actual job completion, refresh the query and show errors in
place; the editor uses the shared waiting overlay. Core supplies en/ru/uk labels.

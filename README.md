# PaNasMs frontend

React SPA for **Pavlo's NAS Management System**, currently in the 0.2.x prototype series.
Production output is static HTML, CSS and JavaScript served by the
[backend](https://github.com/PaNasMs/backend); Node.js is only a build/development dependency.

Follow the [PaNasMs UI/UX guidelines](https://github.com/PaNasMs/panasms/blob/main/documentation/ui-ux-guidelines.md)
for core and module interfaces. The public guide is the shared design baseline.

[Project website and English UI screenshots](https://panasms.github.io/) ·
[Website source](https://github.com/PaNasMs/panasms.github.io)

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

Translation tests include the Files and Terminal dictionaries. For the complete
unit suite, clone those module repositories at `../modules/files` and
`../modules/terminal` using the workspace layout below. The core production
bundle does not include their separate runtime payloads.

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

Pushes to `main`, pull requests and manual runs invoke the shared
[PaNasMs package build](https://github.com/PaNasMs/panasms/blob/main/documentation/builds.md).
The exact frontend commit is paired with the resolved backend commit and tested
in native ARM64/AMD64 Debian 13 jobs. Download the resulting packages and source
manifest from this repository's **Actions → Build PaNasMs** run. CI artifacts do
not install themselves. Successful main-branch builds are imported into the signed
testing channel; installation on a NAS follows its configured update policy.

## License

Public documentation is maintained in English. Original code uses
[PolyForm Noncommercial 1.0.0](LICENSE); see [NOTICE](NOTICE) for third-party scope.

## Account interface

The account interface provides user/group cards and account detail tabs for profile, access policy,
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

## Selection and page surfaces

Use `MultiSelect` for compact searchable membership selection and `FolderField`
for filesystem destinations. Folder selection policies are named `home`, `share`
and `mount`; each uses an administrator-only server query with its own roots and
restrictions. For a new destination, select an existing parent and enter only the
new folder name. Selection itself never creates or moves data. Home-volume checks
are also enforced when planning and executing operations, independently of the UI.

Horizontal Radix tab groups use `tabbed-page` so tabs, filters and content share
one surface. Tabs fill the height of the subtle header strip without gaps; the
active tab has a top accent and joins the content. Cards use `--shadow-card`,
interactive cards may use `--shadow-card-hover`, and menus/dialogs use
`--shadow-raised`. Outer tabbed panels and RAID groups remain flat.
Module cards keep their title/version separate from explicit
installation and enabled states; lifecycle actions stay in the footer. Desktop
shortcuts fill their grid cell, while widget and layout behavior is unchanged.

Dialog content uses a shared header/body/footer layout with a scrollable body and
stable actions. Nested tabs use an underline, while page-level tabs retain the
full-height panel strip. Settings use a vertical navigation divider and flat content
sections; tables inherit their containing page surface. General settings probe the
new HTTP port before navigation, with a manual-link fallback. Module repositories
are managed from the Modules toolbar and require explicit publisher-key review.

System update controls live at `/settings/updates`: channel, installation policy,
maintenance window, version comparison, actions, progress and history. The UI
reconnects after core restart; installation continues in an independent service.
See the [update lifecycle](https://github.com/PaNasMs/panasms/blob/main/documentation/system-updates.md).

## Notifications and network cards

Notifications show severity as an icon beside the message, with action icons
beside the date. Operation notifications open the corresponding task details.
Reviewing an operation and dismissing its notification are separate actions;
active hardware conditions are not silently cleared with notification history.
The backend distinguishes known failures before any changes from operations
whose results still need review.

Network-card action icons stay aligned with the interface heading. The labeled
Wi-Fi switch occupies a separate row beneath the actions, so it does not push
the entire toolbar below the title.

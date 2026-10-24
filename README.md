# TGSECCSL: Co-operative Society Management (prototype)

Finished-UI prototype, with mock data, for **The Telangana Secretariat Employees Co-operative Credit Society Ltd.**

| Part | What | Folder |
|---|---|---|
| **Admin Console** | Desktop web app for all staff (Admin, Accountant, Secretary, President, Cashier, DDO) | `apps/admin-console` |
| **Member App** | Android app for members and applicants | `apps/member-app` |
| **Mock API** | Shared pretend backend with fictional data | `apps/mock-api` |
| Shared packages | types · domain rules · API client · seed data · design tokens | `packages/*` |

Start here: [`CLAUDE.md`](CLAUDE.md) (project rules) → [`BUILD-CHECKLIST.md`](BUILD-CHECKLIST.md) (where we are) → [`LEARN-THE-APP.md`](LEARN-THE-APP.md) (plain-language guide) → [`docs/`](docs/) (specs).

## Requirements
- Node.js 22+ (tested with 24) and npm (comes with Node). No pnpm needed.
- For the phone: the **Expo Go** app on an Android phone on the same Wi-Fi as the laptop.

## Setup
```bash
npm install
```

## Run the demo
```bash
npm run demo          # mock API (port 4000) + Admin Console (http://localhost:5173)
npm run dev:app       # Member App dev server → scan the QR code with Expo Go
```
The API prints the laptop's Wi-Fi address (e.g. `http://192.168.1.45:4000`). In the Member App, long-press the logo on the Welcome screen → **Demo settings** → enter that address → **Test & save**.

## Everyday commands
| Command | Does |
|---|---|
| `npm test` | Unit + API tests (Vitest) |
| `npm run typecheck` | TypeScript across every workspace |
| `npm run format` | Prettier |
| `npm run tokens` | Regenerate `packages/design-tokens/css/tokens.css` after editing tokens |
| `npm run build:console` | Production build of the Admin Console |
| `npm run build:apk` | Android APK via EAS cloud build (needs a free Expo account) |

## Notes
- All people, numbers and money in the mock data are **fictional**. Use **Reset demo data** (console top bar or app Demo settings) to restore the seed.
- npm 12 blocks dependency install scripts by default and warns about `esbuild`. Everything works without it. To silence the warning: `npm install-scripts approve esbuild`.
- `npm audit` reports advisories inside Expo's own CLI tooling (node-forge, zod). The suggested "fix" downgrades Expo to SDK 44, so it is not applied. Revisit on the next Expo SDK upgrade.

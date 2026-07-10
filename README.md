# CashFlow

Local-first accounting, billing, inventory, and credit tracking for small businesses. Built with **Next.js**, **SQLite (Prisma)**, and optional **Electron** desktop packaging.

No cloud account or `.env` file required — clone, install, migrate, and run. All business data stays in a local SQLite file.

<!-- Add screenshots here before publishing — see "Before you go public" in README -->

## Features

- Sales & purchase invoicing with PDF export
- Party ledger, payments, and money owed (credit)
- Inventory, categories, and low-stock alerts
- Bank accounts and UPI QR codes
- Dashboard with revenue, collections, and category mix
- **Import from Tally or BUSY** (masters + vouchers)
- Desktop app (Windows x64) via Electron
- Docker deployment with persisted SQLite volume

> **Experimental:** An AI assistant module exists in the codebase (`src/agent/`) with stub responses. It is not required for core accounting workflows. Optional Ollama integration is available via `/api/ai`.

## Architecture

| Layer | Technology |
|-------|------------|
| UI | Next.js 16, React 19, Tailwind CSS |
| Data | SQLite via Prisma + `better-sqlite3` |
| Desktop | Electron 41 (embedded Next standalone server) |
| Import | XML parsers for Tally / BUSY export files |

**Data model:** One SQLite database per installation — designed for a single local shop.

Default database locations:

- **Development:** `dev.db` in the project root (automatic; no config needed)
- **Electron:** `%APPDATA%/CashFlow/cashflow.db` (Windows user data)
- **Docker:** `/data/cashflow.db` in the `cashflow-data` volume

Shop name, phone, address, and UPI IDs are stored in SQLite (Settings / Bank Accounts), not environment variables.

## Quick start

### Prerequisites

- Node.js 20+
- npm

### Setup

```bash
git clone <your-repo-url>
cd <your-clone-folder>
npm install
npx prisma migrate deploy
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Optional overrides

You only need environment variables for non-default deployments:

| Variable | When needed |
|----------|-------------|
| `DATABASE_URL` | Custom SQLite path (Docker sets `file:/data/cashflow.db`) |
| `OLLAMA_URL` / `OLLAMA_MODEL` | Local AI assistant (defaults to `http://127.0.0.1:11434`) |

## Import from Tally or BUSY

1. Open **Settings → Import from Tally or BUSY**
2. Export from your accounting software:
   - **BUSY:** `MSAll` (masters) + `Vh` (vouchers) XML files
   - **Tally:** XML export (masters and vouchers)
3. Upload one or both files and choose **Merge** or **Replace**

## Electron desktop (Windows x64)

```bash
npm run electron-build
```

Outputs:

- `dist/CashFlow Setup 0.1.0.exe` — installer
- `dist/win-unpacked/CashFlow.exe` — portable build

After building Electron, dev still works — the build script restores the Node native module automatically.

## Docker

```bash
docker compose up --build
```

- App: http://localhost:3000
- Health: http://localhost:3000/api/health

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Run production server |
| `npm test` | Run unit tests |
| `npm run electron-build` | Build Windows x64 desktop installer |
| `npm run rebuild-sqlite-for-node` | Fix SQLite native module after Electron rebuild |

## Troubleshooting

### `better_sqlite3.node is not a valid Win32 application`

After `npm run electron-build`, run:

```bash
npm run rebuild-sqlite-for-node
```

(The electron build script does this automatically at the end.)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

See [SECURITY.md](SECURITY.md).

## License

CashFlow is **source available** under the [Elastic License 2.0 (ELv2)](LICENSE).

| Allowed | Not allowed |
|---------|-------------|
| Personal use (free) | Offering CashFlow as a **hosted / managed service** to third parties (SaaS) |
| Internal business use — any size | Letting customers use CashFlow's features through **your** cloud product |
| Self-host on your own PC or servers | Removing copyright / license notices |
| Modify for your own use | |
| On-prem installs for a client's **internal** use (e.g. IT consultant) | |

This is **not** a traditional OSI "open source" license (like MIT). It is the same model used by [Elasticsearch](https://www.elastic.co/licensing/elastic-license) and other products that allow free internal use while blocking competing hosted offerings.

Questions about commercial licensing beyond ELv2: see [SECURITY.md](SECURITY.md) contact.

## Before you go public (maintainer checklist)

These steps are best done by the repo owner:

1. **Screenshots** — Add 2–3 images to this README (dashboard, billing, import)
2. **Git history** — Confirm `.env` and `*.db` were never committed: `git log --all -- .env dev.db`
3. **GitHub** — Create the public repo, add description + topics (`accounting`, `tally`, `busy`, `electron`, `sqlite`)
4. **Release** — Tag `v0.1.0` and paste [CHANGELOG.md](CHANGELOG.md) notes
5. **Security contact** — Update the email in [SECURITY.md](SECURITY.md) if needed
6. **Smoke test** — Fresh clone on another machine: `npm ci && npx prisma migrate deploy && npm run dev`


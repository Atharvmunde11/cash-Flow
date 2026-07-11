# CashFlow

**Billing, inventory, and credit tracking for small businesses — on your machine, not in the cloud.**

CashFlow is a local-first accounting app for shops and traders who want invoices, stock, party ledgers, and payments in one place. Data lives in a single SQLite file on your PC. No signup, no subscription, no `.env` file for day-to-day use.

Built with **Next.js**, **SQLite (Prisma)**, and an optional **Electron** desktop app for Windows.

<!-- Screenshots: add dashboard, billing, and import panels here before publishing -->

---

## Why CashFlow?

| | |
|---|---|
| **Your data stays local** | One SQLite database per install — nothing leaves your machine unless you export it |
| **Works offline** | Full app runs without internet after install |
| **Tally & BUSY import** | Bring over customers, stock, invoices, and payment vouchers |
| **Desktop or browser** | Use the Windows installer or run in dev/Docker |

---

## Features

**Invoicing & purchases**
- Sales and purchase bills with PDF export
- Sundry charges, stock warnings, and bill history

**Parties & credit**
- Customer and supplier ledgers
- Payments, balances, and money owed (credit tracking)

**Inventory**
- Items, categories, and low-stock alerts

**Finance**
- Bank accounts and UPI QR codes on invoices
- Dashboard: revenue, collections, category mix

**Migration**
- Import from **Tally** or **BUSY** (masters + vouchers, merge or replace)

**Desktop (Windows)**
- Installers for **x64** and **arm64**
- Auto-update checks via [GitHub Releases](https://github.com/Atharvmunde11/cash-Flow/releases)
- Database and settings in `%APPDATA%\CashFlow\`

---

## Quick start

**Requirements:** Node.js 20+, npm

```bash
git clone https://github.com/Atharvmunde11/cash-Flow.git
cd cash-Flow
npm install
npx prisma migrate deploy
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Set your business name and phone under **Settings**. No cloud account required.

---

## Windows desktop app

Build both installers (x64 + arm64):

```bash
npm run electron-build
```

Or one architecture:

```bash
npm run electron-build:x64    # Intel / AMD PCs
npm run electron-build:arm64  # ARM Windows (e.g. Surface)
```

Installers are written to `dist/`:

| File | Platform |
|------|----------|
| `CashFlow-x64-Setup-<version>.exe` | 64-bit Windows |
| `CashFlow-arm64-Setup-<version>.exe` | ARM64 Windows |

The installer is a guided setup: license → install folder → shortcuts → launch.

**Updates:** The desktop app checks GitHub Releases on startup. Publish new versions from [Releases](https://github.com/Atharvmunde11/cash-Flow/releases) (see `npm run electron-publish:x64` / `electron-publish:arm64` in `package.json`).

---

## Import from Tally or BUSY

1. Open **Settings → Import from Tally or BUSY**
2. Export from your accounting software:
   - **BUSY:** `MSAll` (masters) + `Vh` (vouchers)
   - **Tally:** XML export (masters and vouchers)
3. Upload files and choose **Merge** or **Replace**

---

## Docker

```bash
docker compose up --build
```

| | |
|---|---|
| App | http://localhost:3000 |
| Health | http://localhost:3000/api/health |
| Database | `/data/cashflow.db` in the `cashflow-data` volume |

---

## Where data lives

| Mode | Database path |
|------|----------------|
| Development | `dev.db` in project root (default) |
| Electron | `%APPDATA%\CashFlow\cashflow.db` |
| Docker | `file:/data/cashflow.db` |

Override with `DATABASE_URL` only when you need a custom path. Shop profile and UPI details are stored in SQLite, not in environment variables.

---

## Tech stack

| Layer | Stack |
|-------|--------|
| UI | Next.js 16, React 19, Tailwind CSS |
| Data | SQLite, Prisma, better-sqlite3 |
| Desktop | Electron 41 (embedded Next standalone server) |
| Import | XML parsers for Tally / BUSY exports |

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Run production server |
| `npm test` | Unit tests |
| `npm run electron-build` | Build x64 + arm64 Windows installers |
| `npm run electron-build:x64` | x64 installer only |
| `npm run electron-build:arm64` | arm64 installer only |
| `npm run electron-publish:x64` | Build & publish x64 to GitHub Releases |
| `npm run electron-publish:arm64` | Build & publish arm64 to GitHub Releases |
| `npm run rebuild-sqlite-for-node` | Restore Node native module after Electron build |

---

## Troubleshooting

**`better_sqlite3.node` version mismatch after Electron build**

```bash
npm run rebuild-sqlite-for-node
```

The electron build scripts run this automatically at the end; use the command above if dev breaks after a manual rebuild.

**Desktop app database errors**

Check `%APPDATA%\CashFlow\cashflow-startup.log` for migration or startup details.

---

## Contributing & security

- [CONTRIBUTING.md](CONTRIBUTING.md) — setup and pull requests
- [SECURITY.md](SECURITY.md) — reporting vulnerabilities

---

## License

CashFlow is **source available** under the [Elastic License 2.0 (ELv2)](LICENSE).

| You can | You cannot |
|---------|------------|
| Use internally at any business size | Offer CashFlow as a hosted SaaS to third parties |
| Self-host on your own hardware | Resell access through your cloud product |
| Modify for your own use | Remove license or copyright notices |
| Install on-prem for a client (e.g. IT consultant) | |

Not MIT/OSI open source — same model as [Elasticsearch](https://www.elastic.co/licensing/elastic-license): free internal use, no competing hosted service.

Commercial licensing questions: see [SECURITY.md](SECURITY.md).

---

## Author

**Atharv Munde** — [github.com/Atharvmunde11](https://github.com/Atharvmunde11)

---

## Maintainer checklist (before going public)

1. Add 2–3 screenshots to this README (dashboard, billing, import)
2. Confirm secrets never committed: `git log --all -- .env dev.db`
3. Set GitHub **About** description and topics: `accounting`, `billing`, `inventory`, `tally`, `busy`, `electron`, `sqlite`, `nextjs`
4. Tag `v0.1.0` and publish [CHANGELOG.md](CHANGELOG.md) on Releases
5. Smoke test on a clean machine: `npm ci && npx prisma migrate deploy && npm run dev`

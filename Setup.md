# Setup

## Prerequisites

- **Node.js** 20 or newer
- **npm**

## First-time setup

No `.env` file is required.

```bash
npm install
npx prisma migrate deploy
npm run dev
```

Open http://localhost:3000

The SQLite database is created automatically as `dev.db` in the project root.

## Desktop app

```bash
npm run electron-build
```

Installer: `dist/CashFlow Setup 0.1.0.exe`

## Docker

```bash
docker compose up --build
```

See [README.md](README.md) for full documentation.

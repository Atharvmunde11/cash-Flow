# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| latest `main` | yes |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Email **atharvmunde987@gmail.com** with:

- Description of the issue
- Steps to reproduce
- Impact assessment (data loss, local file access, etc.)

We aim to respond within 7 days.

## Scope notes

CashFlow is a **local-first** application:

- Business data is stored in SQLite on the user's machine
- There is **no built-in authentication** or multi-user access control
- API routes are **restricted to localhost by default** via middleware (`src/middleware.ts`)
- Set `ALLOW_REMOTE_ACCESS=1` only if you intentionally expose the app on your LAN or in Docker

### Deployment guidance

| Scenario | Recommendation |
| -------- | -------------- |
| Desktop (Electron) | Server binds to `127.0.0.1` — safe for single-user local use |
| `npm run dev` / production on one PC | Default localhost API guard applies |
| Docker / LAN access | Set `ALLOW_REMOTE_ACCESS=1` **and** restrict port `3000` to trusted networks (firewall/VPN) |
| Public internet | **Not supported** without adding your own auth layer and reverse proxy |

### Built-in protections

- **Localhost API guard** — non-loopback `Host` headers receive `403` on `/api/*`
- **Import** — localhost-only; validate file types server-side
- **Health endpoint** — returns `{ ok: true }` only (no paths or env leakage)
- **Security headers** — `X-Content-Type-Options`, `X-Frame-Options`, etc. via `next.config.ts`
- **Electron** — `contextIsolation: true`, `nodeIntegration: false`; PDF save validates bill IDs

## Sensitive data

- Never commit `*.db` files or customer export files
- A `.env` file is optional; only use it if you need custom paths (e.g. Docker)
- Import files may contain real business data — handle test fixtures carefully
- Review git history before publishing for accidentally committed secrets

## Threat model (what we do not protect against)

- A malicious user with physical access to the machine
- Another process on the same host calling `http://127.0.0.1:3000/api/*`
- Intentional LAN exposure when `ALLOW_REMOTE_ACCESS=1` is set without network controls

For multi-user or hosted deployments, you must add authentication and network isolation yourself.

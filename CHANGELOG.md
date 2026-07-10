# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-07-10

### Added

- Local-first billing, inventory, parties, payments, and credit tracking (SQLite)
- Tally and BUSY XML import (masters + vouchers)
- Dashboard with revenue, collections, category mix, and activity charts
- PDF export for invoices and party ledgers
- Electron desktop packaging (Windows x64)
- Docker deployment with persisted SQLite volume
- First-time onboarding (shop details + optional import)
- Elastic License 2.0 (source available — internal use OK, no competing hosted service)

### Changed

- Removed Google OAuth and MongoDB — app runs fully offline with SQLite
- No `.env` file required for local development
- UPI QR codes read from Bank Accounts instead of environment variables
- Business name on PDFs/prints comes from Settings

### Removed

- Experimental AI assistant UI, voice transcription, and Ollama integration

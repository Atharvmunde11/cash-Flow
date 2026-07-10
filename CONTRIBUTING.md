# Contributing to CashFlow

Thank you for your interest in contributing!

## Getting started

1. Fork the repository and clone your fork
2. `npm install`
3. `npx prisma migrate deploy`
4. `npm run dev`

## Before opening a PR

- Run `npm run lint`
- Run `npm test`
- Keep changes focused — one feature or fix per PR
- Match existing code style and naming

## Import / accounting changes

Changes to bill totals, ledger balances, or Tally/BUSY import logic should include tests in `src/**/*.test.ts` where practical.

## Reporting bugs

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.yml) and include:

- Steps to reproduce
- Expected vs actual behavior
- OS and whether you use web, Electron, or Docker
- Sample export file (redacted) if the issue is import-related

## Feature requests

Use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.yml).

## License

By contributing, you agree that your contributions will be licensed under the
[Elastic License 2.0](LICENSE) used by this project.

## Code of conduct

Be respectful and constructive. This project serves small business owners — clarity and reliability matter more than clever abstractions.

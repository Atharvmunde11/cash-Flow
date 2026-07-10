#!/usr/bin/env sh
set -e

mkdir -p /data

# Apply migrations to the persisted SQLite DB (non-interactive).
# If migrations fail, we want the container to fail fast rather than serving 500s.
npx prisma migrate deploy

exec npm run start


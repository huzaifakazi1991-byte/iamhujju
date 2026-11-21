#!/usr/bin/env bash
# Render start command with resilient migration/seed startup.
# Neon cold starts can exceed Prisma's 10s advisory-lock timeout (P1002),
# and overlapping deploys can hold the migration lock briefly — retry instead of failing.
set -e

run_migrate() {
  npx prisma migrate deploy
}

if ! run_migrate; then
  echo "[deploy-start] migrate deploy failed (likely DB cold start or lock contention) — retrying in 20s"
  sleep 20
  if ! run_migrate; then
    echo "[deploy-start] retry 2 failed — retrying in 40s"
    sleep 40
    run_migrate
  fi
fi

if ! npm run db:seed; then
  echo "[deploy-start] seed failed — retrying in 15s"
  sleep 15
  npm run db:seed
fi

exec npm run start

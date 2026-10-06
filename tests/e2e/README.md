# End-to-end API test

Runs the real Next.js API against a local PostgreSQL database and a **test-only** mock of api.telegram.org
(`mock-telegram.mjs`). The application code is unchanged; only `TELEGRAM_API_ROOT` points at the mock.

```bash
# DIRECT_URL is set too because scripts/migrate.ts prefers it over DATABASE_URL (and .env.local may define it).
createdb tg_files_e2e
DIRECT_URL=postgresql://localhost:5432/tg_files_e2e DATABASE_URL=postgresql://localhost:5432/tg_files_e2e pnpm db:migrate
node tests/e2e/mock-telegram.mjs &
TELEGRAM_API_ROOT=http://127.0.0.1:8099 DATABASE_URL=postgresql://localhost:5432/tg_files_e2e \
  NEXT_PUBLIC_APP_URL=http://localhost:3100 pnpm dev -p 3100 &
node tests/e2e/run.mjs
```

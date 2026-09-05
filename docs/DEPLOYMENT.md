# Deployment (Railway)

Two services from one repository.

## Service 1 — API

- **Root directory:** repository root
- **Config:** `apps/api/railway.json`
- Build: `npm ci && npm run build -w @manas/shared && npm run build -w @manas/api`
- Start: `npm run migrate -w @manas/api && npm run start -w @manas/api`
- Health check: `/health`

Environment:

```
NODE_ENV=production
PORT=${{PORT}}
DATABASE_URL=…              # Supabase pooled connection string
DATABASE_SSL=true
SUPABASE_URL=…
SUPABASE_SERVICE_ROLE_KEY=… # mark as secret
CORS_ORIGINS=https://<your-web-domain>
LOG_LEVEL=info
JOBS_ENABLED=true           # true on exactly ONE instance
NOTIFICATION_PROVIDER=log
BIOMETRIC_PROVIDER=none
```

Use the **pooled** (pgBouncer) connection string in production; Supabase limits
direct connections.

## Service 2 — Web

- **Root directory:** repository root
- **Config:** `apps/web/railway.json`
- Build: `npm ci && npm run build -w @manas/shared && npm run build -w @manas/web`
- Start: `npm run start -w @manas/web`

Environment:

```
NODE_ENV=production
PORT=${{PORT}}
NEXT_PUBLIC_SUPABASE_URL=…
NEXT_PUBLIC_SUPABASE_ANON_KEY=…
NEXT_PUBLIC_API_URL=https://<your-api-domain>
```

`NEXT_PUBLIC_*` values are baked in at build time — changing one requires a
rebuild, not just a restart.

## Scaling

`JOBS_ENABLED=true` on more than one instance means fee reminders run twice.
The jobs are idempotent so this will not double-send, but it wastes work and
muddies the logs. Keep it on one instance.

## Supabase configuration

1. **Auth → URL Configuration** — add `https://<your-web-domain>` as a site URL
   and `https://<your-web-domain>/reset-password` as a redirect URL, or
   password-reset links will not work.
2. **Auth → Email templates** — customise the recovery email; it is how every
   new user sets their first password.
3. **Database → Extensions** — confirm `pgcrypto`, `btree_gist` and `citext`
   are enabled. Migration 0001 creates them, which requires sufficient
   privileges on the connection.

## Rollout order

1. Run migrations against a scratch project first and confirm they apply
   cleanly end to end (see "Known gaps" in `DEVELOPMENT.md` — they have not yet
   been executed against a live database).
2. Deploy the API. Confirm `/health` and `/health/ready` both return 200.
3. Seed the Super Admin.
4. Deploy the web service with `NEXT_PUBLIC_API_URL` pointing at the API.
5. Set the API's `CORS_ORIGINS` to the web domain and redeploy.
6. Sign in, create a branch, and walk one admission through end to end.

## Monitoring

- `/health` — liveness. Never touches the database, so it stays green during a
  brief database blip and Railway does not restart a healthy process.
- `/health/ready` — readiness. Runs `SELECT 1`; returns 503 when the database
  is unreachable.
- Logs are structured JSON via pino, with credentials redacted. Every response
  carries `X-Request-Id`, which appears in the corresponding log lines.

## Backups

Supabase takes automatic daily backups. Verify the retention window matches
what the franchise needs, and test a restore before go-live — an untested
backup is not a backup.

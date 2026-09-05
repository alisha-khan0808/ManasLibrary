# Manas Library Management System

Multi-branch library management for the Manas Library franchise: admissions,
seat allocation, batches, attendance, invoicing, payments and fee reminders —
with strict branch isolation throughout.

Built against [`Manas_Library_PRD_Claude_Code.md`](Manas_Library_PRD_Claude_Code.md).

---

## Architecture

```
Browser  ──►  Next.js 14 (App Router)  ──►  Node.js API (Express)  ──►  Supabase PostgreSQL
                     │                              │
                     └──── Supabase Auth ───────────┘
```

- **Identity** is owned by Supabase Auth. The browser signs in against
  Supabase; the Node API verifies the resulting JWT (JWKS, or a legacy HS256
  secret) and resolves the user's role and branches **from the database**, so a
  revoked branch assignment takes effect immediately.
- **Business rules and all writes** live in the Node API, which talks to
  Postgres over `pg` so multi-table operations (admission, seat transfer,
  payment) run inside real transactions.
- **Row Level Security** is a second layer: the browser's anon-key session can
  read only its own branches' rows and can write nothing.

| Workspace          | What it is                                  |
| ------------------ | ------------------------------------------- |
| `apps/api`         | Express + TypeScript REST API (`/api/v1`)   |
| `apps/web`         | Next.js 14 admin console                    |
| `packages/shared`  | Enums, entity types, permission matrix      |
| `database/`        | SQL migrations and seed data                |
| `docs/`            | Architecture, API and integration notes     |

---

## Getting started

Requires Node.js ≥ 18.17 and a Supabase project.

```bash
npm install
```

Copy the environment template and fill it in:

```bash
cp .env.example .env
```

At minimum you need `DATABASE_URL`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY`. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)
for where each value comes from.

Apply the schema and create the first Super Admin:

```bash
npm run build:shared
npm run migrate
SEED_ADMIN_EMAIL=you@example.com npm run seed
```

The seed does **not** set a password. Use *Forgot password* on the sign-in
screen to set your own.

Run both apps:

```bash
npm run dev
```

- Web: <http://localhost:3000>
- API: <http://localhost:4000> · health at `/health`

---

## Scripts

| Command                | What it does                                        |
| ---------------------- | --------------------------------------------------- |
| `npm run dev`          | API and web in watch mode                           |
| `npm run build`        | Builds shared → api → web                           |
| `npm run typecheck`    | `tsc --noEmit` across all workspaces                |
| `npm run lint`         | ESLint across api and web                           |
| `npm test`             | Domain unit tests (no database required)            |
| `npm run migrate`      | Applies pending SQL migrations                      |
| `npm run seed`         | Creates a Super Admin, demo branch, plans and seats |

---

## Design decisions worth knowing

**Money never touches a float.** `numeric` columns are read as strings and all
arithmetic runs in integer paise (`apps/api/src/domain/money.ts`). Invoice
`total` and `balance` are *generated columns* in Postgres, so no code path can
persist a total that disagrees with its components.

**Branch isolation is structural, not just enforced in code.** Child tables
declare composite foreign keys on `(entity_id, branch_id)`, so the database
itself rejects a row that mixes one branch's student with another's seat. The
API checks first and returns a clean 403; the constraint is the backstop.

**Double-booking is impossible by construction.** `seat_allocations` carries a
GiST `EXCLUDE` constraint on `(seat_id, daterange)` where the allocation is
active — two concurrent requests cannot both win.

**Reminders and syncs are idempotent.** Fee reminders are keyed on
`(fee_schedule_id, reminder_type, reminder_date)`; biometric punches on
`(device_id, biometric_record_id)`. Re-running a job sends nothing twice.

**No vendor biometric protocol is invented.** `BiometricProvider` is an
interface with a null implementation by default. See
[docs/BIOMETRIC_INTEGRATION.md](docs/BIOMETRIC_INTEGRATION.md).

---

## Deployment

Two Railway services from one repository — see
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Both have `railway.json` with build,
start and health-check configuration. The API runs migrations on start.

---

## Security

- Secrets are validated at boot and never sent to the browser.
- `SUPABASE_SERVICE_ROLE_KEY` is used only for Supabase Auth admin calls.
- Every protected route validates authentication, role, branch, payload and
  business rules — in that order.
- Stack traces and database errors are logged, never returned to clients.
- Payments are append-only; corrections are compensating entries.
- All significant actions are written to `audit_logs` inside the same
  transaction as the change they describe.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full picture.

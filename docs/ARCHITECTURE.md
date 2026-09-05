# Architecture

## Request path

```
Browser
  │  Supabase session cookie (anon key)
  ▼
Next.js server component
  │  Authorization: Bearer <supabase access token>
  ▼
Express API  ──► verify JWT (JWKS or HS256)
             ──► load role + branches from public.users
             ──► requirePermission(...)
             ──► resolve + authorize branch
             ──► zod validation
             ──► business rules
             ──► pg transaction
             ▼
Supabase PostgreSQL
```

Nothing the browser sends is trusted. `branchId` in a URL, query string or body
is a *request*, not a fact — `guards/branch.ts` resolves it against the caller's
authorized branches before any query runs.

## Authorization, in order

Every protected route runs these in sequence. Skipping or reordering any of
them is a bug:

1. **Authentication** — `requireAuth` verifies the Supabase JWT and loads the
   application profile. An account that exists in `auth.users` but has no
   `public.users` row cannot use the API.
2. **Role / permission** — `requirePermission(...)` against the matrix in
   `packages/shared/src/permissions.ts`. The frontend imports the same matrix,
   but only to decide what to render.
3. **Branch** — `requireBranchForWrite` (writes) or `resolveBranchScope`
   (reads). Writes must name exactly one branch; a user with several branches
   must say which, rather than have the server guess.
4. **Payload** — zod schemas, with unknown keys stripped.
5. **Business rules** — seat availability, batch capacity, payment limits.

### Why role and branch are not read from the JWT

They live in the database and are cached for 15 seconds. A JWT could carry them
more cheaply, but then removing someone's branch access would not take effect
until their token expired. Fifteen seconds is a deliberate ceiling on that
window.

## Branch isolation

Three independent layers:

| Layer | Mechanism |
| ----- | --------- |
| Application | `canAccessBranch` / `branchPredicate`, unit-tested in `tests/branchAccess.test.ts` |
| Database constraints | Composite FKs on `(entity_id, branch_id)` — a cross-branch row cannot be inserted at all |
| Row Level Security | `has_branch_access(branch_id)` policies for the browser's Realtime subscriptions |

The API connects as the database owner and is therefore not subject to RLS. RLS
exists for the browser session, which can read its own branches and write
nothing.

## Financial integrity

- `invoices.total` and `invoices.balance` are `GENERATED ALWAYS AS ... STORED`.
  They cannot drift from `subtotal - discount + tax`.
- A `CHECK` constraint rejects `amount_paid > total`. Overpayment requires an
  explicit policy, which the PRD does not specify, so it is refused.
- Payments are append-only. A correction inserts a negative compensating row
  pointing at the original and marks the original `REVERSED`.
- `refreshInvoiceTotals` recomputes `amount_paid` from `sum(payments.amount)`
  after every payment or reversal, then re-derives status. The invoice is
  always a projection of the ledger, never an independent record.
- Money arithmetic runs in integer minor units. `numeric` columns are read as
  strings; nothing parses them into a float.

## Concurrency

| Risk | Guard |
| ---- | ----- |
| Two students allocated the same seat | `EXCLUDE USING gist (seat_id, daterange)` where status is ACTIVE |
| One student holding two seats | Matching exclusion constraint on `student_id` |
| Batch over capacity | `SELECT … FOR UPDATE` on the batch row, plus a trigger as backstop |
| Two cashiers paying the same balance | `SELECT … FOR UPDATE` on the invoice, consistent lock ordering with reversal |
| Duplicate document numbers | `next_document_number` upserts a counter row inside the caller's transaction |

## Transactions

Every multi-table write goes through `withTransaction`. The admission workflow
is the clearest case: student creation, batch enrolment, seat allocation,
admission, invoice, line items, fee schedule, opening payment and six audit
entries either all commit or none do.

The one operation that cannot be transactional is user creation, because the
Supabase Auth identity lives outside our database. That path compensates: if
the profile insert fails, the orphaned auth user is deleted so the email is not
left permanently taken.

## Background jobs

`node-cron` in-process, gated by `JOBS_ENABLED` so only one instance schedules
them. Each job is idempotent and guarded against overlapping runs.

| Job | Default | Idempotency key |
| --- | ------- | --------------- |
| Fee reminders | `0 8 * * *` | `(fee_schedule_id, reminder_type, reminder_date)` |
| Membership expiry | `15 0 * * *` | Only touches `CONFIRMED` rows past `end_date` |
| Biometric sync | `*/15 * * * *` | `(device_id, biometric_record_id)` |

## Error handling

`AppError` is the only error type that reaches a client verbatim. Postgres
constraint violations are translated into documented error codes in
`utils/errors.ts` — constraint names are part of that contract, so renaming one
in a migration means updating the translation table.

Everything else becomes `INTERNAL_ERROR` with a generic message. Stack traces
and database messages are logged, never returned.

## Realtime

Migration 0010 adds the operationally interesting tables to the
`supabase_realtime` publication. A browser subscription is filtered by the same
RLS policies as a read, so a Realtime channel cannot leak another branch's
rows. This is why writes stay in the API rather than going direct: the
subscription needs read access, nothing more.

# Development

## Prerequisites

- Node.js ≥ 18.17 (CI runs 20; `@supabase/supabase-js` warns below 22 but works)
- A Supabase project

## Where each environment value comes from

In the Supabase dashboard:

| Variable | Location |
| -------- | -------- |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_URL` | Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → API → anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → service_role key |
| `DATABASE_URL` | Project Settings → Database → Connection string (URI) |
| `SUPABASE_JWT_SECRET` | Only for legacy projects still on the HS256 shared secret |

Leave `SUPABASE_JWT_SECRET` empty on a modern project — the API verifies tokens
against the public JWKS endpoint and the secret then never needs to exist on
the server at all.

> The service role key bypasses Row Level Security. It belongs only in the API
> service's environment. Never expose it to the browser or commit it.

## First run

```bash
npm install
cp .env.example .env      # then fill it in
npm run build:shared      # api and web import the built output
npm run migrate
SEED_ADMIN_EMAIL=you@example.com npm run seed
npm run dev
```

The seed creates a Super Admin identity with **no password**. Open
<http://localhost:3000/forgot-password>, request a link, and set one.

For a Supabase-hosted database, set `DATABASE_SSL=true`. For a local Postgres
instance, set it to `false`.

## Migrations

Forward-only. Each file runs in its own transaction and its checksum is
recorded, so editing an already-applied migration is detected rather than
silently ignored.

```bash
npm run migrate           # apply pending
npm run migrate:status -w @manas/api
```

To change the schema, add a new numbered file in `database/migrations/`. Never
edit an applied one.

When a migration renames a constraint, update the translation table in
`apps/api/src/utils/errors.ts` — constraint names are part of the API's error
contract.

## Tests

```bash
npm test
```

The suite covers the rules that would cost real money or leak real data if they
broke: money arithmetic, invoice totals and status derivation, payment limits,
fee status and reminder selection, membership date maths, and the full branch
authorization matrix. These are pure functions, so they need no database.

Integration tests against a live database are the natural next layer; see
"Known gaps" below.

## Project conventions

**Services own SQL and business rules; routes own validation and HTTP.** A route
should read as: permission check → validate → call service → format response.

**Never interpolate client input into SQL.** Column names used in `ORDER BY`
come from a whitelist map keyed by a zod enum; everything else is a bound
parameter.

**Column lists are functions, not string surgery.** `studentColumns('s')` and
`studentColumns()` produce the aliased and unaliased forms from one definition,
rather than regex-rewriting a template.

**Every list query threads the branch predicate.** `branchPredicate` returns
`TRUE` for a Super Admin, `FALSE` for a user with no branches, and a
parameterised `= ANY(...)` otherwise — so call sites never assemble conditional
SQL by hand, and "no branches" can never accidentally mean "all branches".

**Frontend permission checks are cosmetic.** They decide what to render. The
API re-checks everything.

## Known gaps

Worth knowing before this goes to production:

- **The migrations have not been run against a live database.** They were
  written for Supabase Postgres but the project was built without database
  credentials, so `CREATE EXTENSION btree_gist`, the RLS policies and the
  `auth.users` foreign key are unverified in practice. Run `npm run migrate`
  against a scratch Supabase project first.
- **No integration or end-to-end tests.** The PRD asks for them (§46). The
  domain layer is well covered; the transactional workflows are not.
- **Attendance days use UTC.** `punch.timestamp.toISOString().slice(0, 10)`
  assigns a biometric punch to a UTC calendar day. For IST this shifts punches
  before 05:30 into the previous day. Fix this before enabling biometric sync
  in production — the branch's timezone should drive the date.
- **Realtime subscriptions are not yet wired into the UI.** The database side
  (publication, RLS policies) is in place; the frontend still refreshes on
  navigation rather than subscribing.

## Demo mode (UI preview without a backend)

Demo mode renders the whole interface from static fixtures so the UI can be
reviewed before Supabase and the database exist. Enable it in
`apps/web/.env.local`:

```
NEXT_PUBLIC_DEMO_MODE=true
```

Then start the web app and click **Explore the demo** on the sign-in page.

### What it does

- `middleware.ts` skips the session check, so no route redirects to `/login`.
- `lib/api.ts` and `lib/api-client.ts` short-circuit to
  `lib/demo/resolver.ts` instead of calling the API.
- Writes are refused with an explicit toast rather than faked, so the UI never
  shows a success it cannot back up.
- An amber banner sits above every screen.

### What it does not do

Demo mode exercises **no** authentication, branch isolation, business rules,
transactions or persistence. It proves the interface renders. It proves
nothing about the backend, and a screen working here is not evidence that the
corresponding API route works.

### It cannot reach production

`assertDemoModeIsSafe()` runs in the root layout, which is evaluated during
`next build`. If `NEXT_PUBLIC_DEMO_MODE=true` is set in a production build the
build throws and fails.

Note that `next build` loads `.env.local`, so **you cannot run a production
build while demo mode is enabled there** — that is the guard working. Comment
the flag out (or remove the file) before building for deployment.

### Turning it off

Remove the flag from `.env.local` and fill in real Supabase credentials. No
other change is needed; the same pages then read from the live API.

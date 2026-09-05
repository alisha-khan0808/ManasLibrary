# Biometric integration

The deployed attendance machine's vendor and protocol are not yet known, so
this codebase deliberately does **not** implement one. It defines an interface
and ships a null implementation that fails loudly rather than silently
recording nothing.

## The interface

`apps/api/src/integrations/biometric/BiometricProvider.ts`:

```ts
interface BiometricProvider {
  readonly name: string;
  syncAttendance(connection, since, until): Promise<BiometricPunch[]>;
  getDeviceStatus(connection): Promise<DeviceStatusReport>;
  testConnection(connection): Promise<DeviceStatusReport>;
}
```

A punch must carry a `recordId` that is stable for the life of the device.
That value is the deduplication key — without it, re-syncing a window would
duplicate attendance, so punches lacking one are dropped with a warning rather
than ingested.

## Shipped implementations

| `BIOMETRIC_PROVIDER` | Behaviour |
| -------------------- | --------- |
| `none` (default) | Refuses to sync and reports "not configured". The sync job is not scheduled. |
| `http` | Speaks the generic JSON contract below. |

The `http` provider is **our** contract, not a guess at any manufacturer's API.
Use it when the device exposes a plain HTTP API, or when a vendor middleware
can be adapted to this shape.

### Generic HTTP contract

`GET {api_endpoint}/attendance?deviceId=…&since=…&until=…`

```json
{
  "records": [
    {
      "recordId": "882301",
      "biometricUserId": "104",
      "timestamp": "2026-03-14T06:12:44+05:30",
      "direction": "IN"
    }
  ]
}
```

`GET {api_endpoint}/status`

```json
{ "status": "ok", "time": "2026-03-14T06:15:00+05:30" }
```

`BIOMETRIC_API_KEY`, when set, is sent as `Authorization: Bearer …`.

## Adding a real device

1. Implement `BiometricProvider` in
   `apps/api/src/integrations/biometric/`.
2. Register it in the switch in `providers.ts`.
3. Add its enum value to `BIOMETRIC_PROVIDER` in `config/env.ts`.

Nothing outside that folder needs to change. Mapping, deduplication, attendance
creation and branch checks are all provider-agnostic.

## How a punch becomes attendance

```
Device punch
   │
   ▼
biometric_events  ── ON CONFLICT (device_id, biometric_record_id) DO NOTHING
   │                 (replaying a window is a no-op)
   ▼
biometric_mappings lookup by (device_id, biometric_user_id)
   │
   ├── no mapping ──► event kept, flagged, surfaced in /biometric/unmapped
   │
   ├── mapping branch ≠ device branch ──► rejected and logged
   │
   ▼
attendance  ── one row per (student, day)
               first punch becomes check-in, later punches extend check-out
```

An unmapped punch is never discarded. It stays in `biometric_events` so an
administrator can create the mapping afterwards and see the history.

## Branch safety

PRD §26 requires that a biometric user, its student and its device all belong
to the same branch. This is enforced three times:

1. `createMapping` checks device and student branches explicitly.
2. Composite foreign keys `(device_id, branch_id)` and `(student_id, branch_id)`
   make a cross-branch mapping impossible to insert.
3. `ingestPunches` re-checks at sync time and logs an error if a mismatch ever
   appears, rather than writing attendance into the wrong branch.

## Scheduled sync

Runs on `JOB_BIOMETRIC_SYNC_CRON` (default every 15 minutes) for every ACTIVE
device in an ACTIVE branch, pulling a rolling 24-hour window. The wide window
is deliberate: it covers a missed run without re-reading the device's whole
log, and already-seen records cost nothing because of the unique key.

## Known issue

`ingestPunches` derives the attendance date with
`punch.timestamp.toISOString().slice(0, 10)` — a **UTC** calendar day. In IST
(UTC+5:30) a punch before 05:30 local time is attributed to the previous day.
Resolve this against the branch's timezone before enabling biometric sync in
production.

# API reference

Base URL: `{API_URL}/api/v1`

All routes except `/health`, `/health/ready` and `/auth/password-reset` require
`Authorization: Bearer <supabase access token>`.

## Response envelope

Success:

```json
{ "success": true, "data": {}, "message": "Operation completed successfully" }
```

List endpoints add `meta`:

```json
{ "success": true, "data": [], "meta": { "page": 1, "pageSize": 20, "total": 0, "totalPages": 0 }, "message": "…" }
```

`/payments` and `/fees` additionally return a `totals` object.

Error:

```json
{
  "success": false,
  "error": {
    "code": "SEAT_ALREADY_ALLOCATED",
    "message": "The selected seat is already allocated for an overlapping period.",
    "details": [{ "path": "body.mobile", "message": "Must be a 10–15 digit mobile number." }]
  }
}
```

`details` is present only for validation failures.

## Error codes

| Code | HTTP | Meaning |
| ---- | ---- | ------- |
| `UNAUTHENTICATED` | 401 | Missing, invalid or expired token; or no application profile |
| `FORBIDDEN` | 403 | Role lacks the required permission |
| `BRANCH_ACCESS_DENIED` | 403 | Branch is outside the caller's authorized set |
| `NOT_FOUND` | 404 | No such record |
| `VALIDATION_ERROR` | 400 | Payload failed validation or a business rule |
| `CONFLICT` | 409 | Uniqueness or state conflict |
| `RATE_LIMITED` | 429 | Too many requests |
| `BRANCH_INACTIVE` | 409 | Branch is not ACTIVE and cannot take new transactions |
| `SEAT_ALREADY_ALLOCATED` | 409 | Overlapping allocation for the seat or student |
| `SEAT_NOT_AVAILABLE` | 409 | Seat is under maintenance or inactive |
| `SEAT_ALLOCATION_NOT_ACTIVE` | 409 | Transfer/release attempted on a closed allocation |
| `BATCH_CAPACITY_EXCEEDED` | 409 | Batch is full |
| `BATCH_INACTIVE` | 409 | Batch cannot accept new students |
| `STUDENT_ALREADY_ENROLLED` | 409 | Student already holds an active batch |
| `INVOICE_CANCELLED` | 409 | Cancelled invoices cannot receive payment |
| `INVOICE_ALREADY_PAID` | 409 | No outstanding balance |
| `OVERPAYMENT_NOT_ALLOWED` | 400 | Payment exceeds the balance |
| `PAYMENT_ALREADY_REVERSED` | 409 | Payment already has a reversal |
| `DUPLICATE_ATTENDANCE` | 409 | Attendance already exists for that student and day |
| `BIOMETRIC_MAPPING_MISMATCH` | 403 | Device and student are in different branches |
| `MEMBERSHIP_PLAN_INACTIVE` | 409 | Plan cannot be sold |
| `INTERNAL_ERROR` | 500 | Unexpected failure (message is generic in production) |

## Endpoints

### Health

| Method | Path | Notes |
| ------ | ---- | ----- |
| GET | `/health` | `{ "status": "ok" }`, no auth |
| GET | `/health/ready` | Includes a live database check; 503 when unreachable |

### Auth & users

| Method | Path | Permission |
| ------ | ---- | ---------- |
| GET | `/auth/session` | authenticated |
| POST | `/auth/password-reset` | public, rate limited, always reports success |
| GET | `/users/me` | authenticated |
| GET | `/users` | `user:manage` |
| POST | `/users` | `user:manage` |
| GET | `/users/:id` | `user:manage` |
| PATCH | `/users/:id` | `user:manage` |

Sign-in and sign-out happen directly against Supabase from the browser.

### Branches

| Method | Path | Permission |
| ------ | ---- | ---------- |
| GET | `/branches` | authenticated (scoped) |
| POST | `/branches` | `branch:manage` |
| GET | `/branches/:id` | branch access |
| GET | `/branches/:id/stats` | branch access |
| PATCH | `/branches/:id` | `branch:manage` |
| POST | `/branches/:id/status` | `branch:manage` |

### Students

| Method | Path | Permission |
| ------ | ---- | ---------- |
| GET | `/students` | `student:view` |
| POST | `/students` | `student:manage` |
| GET | `/students/:id` | `student:view` |
| GET | `/students/:id/profile` | `student:view` |
| PATCH | `/students/:id` | `student:manage` |

### Memberships

| Method | Path | Permission |
| ------ | ---- | ---------- |
| GET | `/memberships` | authenticated |
| GET | `/memberships/:id` | authenticated |
| POST | `/memberships` | `membership-plan:manage` |
| PATCH | `/memberships/:id` | `membership-plan:manage` |

### Seats and allocations

| Method | Path | Permission |
| ------ | ---- | ---------- |
| GET | `/seats` | authenticated (scoped) |
| POST | `/seats` | `seat:manage` |
| POST | `/seats/bulk` | `seat:manage` |
| GET | `/seats/:id` | branch access |
| PATCH | `/seats/:id` | `seat:manage` |
| GET | `/seat-allocations` | authenticated (scoped) |
| POST | `/seat-allocations` | `seat:allocate` |
| POST | `/seat-allocations/transfer` | `seat:allocate` |
| POST | `/seat-allocations/release` | `seat:allocate` |

`GET /seats?availableOn=YYYY-MM-DD` returns only seats with no active
allocation covering that date.

### Batches

| Method | Path | Permission |
| ------ | ---- | ---------- |
| GET | `/batches` | authenticated (scoped) |
| POST | `/batches` | `batch:manage` |
| GET | `/batches/:id` | branch access |
| GET | `/batches/:id/students` | branch access |
| PATCH | `/batches/:id` | `batch:manage` |
| POST | `/batches/enroll` | `batch:manage` |
| POST | `/batches/transfer` | `batch:manage` |
| POST | `/batches/enrollments/:id/unenroll` | `batch:manage` |

### Admissions

| Method | Path | Permission |
| ------ | ---- | ---------- |
| GET | `/admissions` | `admission:manage` |
| POST | `/admissions/quote` | `admission:manage` |
| POST | `/admissions` | `admission:manage` |
| GET | `/admissions/renewals` | `admission:manage` |
| GET | `/admissions/:id` | `admission:manage` |
| POST | `/admissions/:id/cancel` | `admission:manage` |

`POST /admissions` accepts either `student_id` or an inline `student` object,
and optionally a `payment`. It runs as one transaction.

`POST /admissions/quote` previews the fee. Its output is **not** an input to
the real calculation — the server recomputes everything on submit.

### Finance

| Method | Path | Permission |
| ------ | ---- | ---------- |
| GET | `/invoices` | `invoice:view` |
| POST | `/invoices` | `invoice:manage` |
| GET | `/invoices/:id` | `invoice:view` |
| POST | `/invoices/:id/cancel` | `invoice:manage` |
| GET | `/payments` | `invoice:view` |
| POST | `/payments` | `payment:record` |
| GET | `/payments/:id` | `invoice:view` |
| POST | `/payments/:id/reverse` | `payment:reverse` |
| GET | `/fees` | `invoice:view` |
| GET | `/fees/reminders` | `fee:manage` |
| POST | `/fees/reminders/run` | `fee:manage` |

### Attendance & biometric

| Method | Path | Permission |
| ------ | ---- | ---------- |
| GET | `/attendance` | `attendance:manage` |
| GET | `/attendance/roster` | `attendance:manage` |
| GET | `/attendance/summary` | `attendance:manage` |
| POST | `/attendance` | `attendance:manage` |
| POST | `/attendance/batch` | `attendance:manage` |
| PATCH | `/attendance/:id` | `attendance:manage` |
| GET | `/biometric/devices` | `biometric:manage` |
| POST | `/biometric/devices` | `biometric:manage` |
| PATCH | `/biometric/devices/:id` | `biometric:manage` |
| POST | `/biometric/devices/:id/test` | `biometric:manage` |
| POST | `/biometric/devices/:id/sync` | `biometric:manage` |
| GET | `/biometric/mappings` | `biometric:manage` |
| POST | `/biometric/mappings` | `biometric:manage` |
| DELETE | `/biometric/mappings/:id` | `biometric:manage` |
| GET | `/biometric/unmapped` | `biometric:manage` |

### Dashboard, search and reports

| Method | Path | Permission |
| ------ | ---- | ---------- |
| GET | `/dashboard` | authenticated (scoped) |
| GET | `/dashboard/trends` | authenticated (scoped) |
| GET | `/search?q=` | authenticated (scoped) |
| GET | `/reports` | `report:view` — lists report names |
| GET | `/reports/:name` | `report:view` — add `format=csv` to download |

Available reports: `active-students`, `new-admissions`, `expired-memberships`,
`seat-utilisation`, `allocation-history`, `attendance`, `absentees`,
`collections`, `outstanding-fees`, `branch-revenue`.

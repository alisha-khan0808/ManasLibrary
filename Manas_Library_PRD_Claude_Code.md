# Manas Library Management System — Claude Code Development PRD

**Document Version:** 1.0  
**Status:** Development Specification  
**Application Type:** Multi-Branch Library Management Web App  
**Frontend:** Next.js  
**Backend:** Node.js  
**Database:** Supabase PostgreSQL  
**Deployment:** Railway  
**Version Control:** Git/GitHub

---

## 1. Purpose

Build a production-ready, multi-branch web application for **Manas Library Management**.

The system is designed for a library franchise that operates multiple branches. Every operational entity must be associated with a library branch.

The application must support:

- Multiple branch management
- Student/member admissions
- Seat allocation
- Batch/session management
- Attendance
- External biometric attendance integration
- Invoice and payment management
- Fee reminders
- Branch-wise dashboards and reports
- Role-based access control
- Real-time operational updates

This document is intended to be used as the **single source of truth for Claude Code development**.

Claude Code should implement the system incrementally, test each module, and avoid introducing functionality that is outside this specification unless explicitly requested.

---

# 2. Development Principles

Claude Code must follow these principles:

1. **Do not build everything in one step.**
2. Work module-by-module.
3. Before changing an existing module, inspect the current implementation.
4. Do not overwrite working functionality unnecessarily.
5. Keep frontend, backend, database, and integrations modular.
6. Use TypeScript wherever practical.
7. Validate all inputs on the server.
8. Never trust `branch_id` supplied by the client without authorization validation.
9. Enforce branch-level data isolation.
10. Never expose secrets in frontend code.
11. Never commit `.env` files or credentials.
12. Write reusable components instead of duplicating UI/business logic.
13. Use database transactions for operations that modify multiple related records.
14. Add loading, empty, success, and error states to important screens.
15. Test critical business rules before marking a module complete.
16. Do not add chatbot/AI functionality unless explicitly requested later.

---

# 3. Core Architecture

Recommended architecture:

```text
Browser
   |
   v
Next.js Frontend
   |
   | HTTPS / REST API
   v
Node.js Backend
   |
   +--------------------+
   |                    |
   v                    v
Supabase PostgreSQL   External Biometric Machine
   |
   v
Supabase Realtime
```

Railway will be used for production deployment.

Supabase will provide PostgreSQL database capabilities and may be used for authentication and realtime functionality.

The Node.js backend remains responsible for business rules and external integrations.

---

# 4. Repository Structure

Use a maintainable project structure.

Recommended:

```text
manas-library/
│
├── apps/
│   ├── web/
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── services/
│   │   └── types/
│   │
│   └── api/
│       ├── src/
│       │   ├── modules/
│       │   ├── middleware/
│       │   ├── guards/
│       │   ├── services/
│       │   ├── jobs/
│       │   ├── integrations/
│       │   ├── database/
│       │   └── utils/
│       └── tests/
│
├── packages/
│   ├── shared/
│   └── config/
│
├── database/
│   ├── migrations/
│   ├── seeds/
│   └── documentation/
│
├── docs/
│
├── .env.example
├── README.md
└── PRD.md
```

If the repository already has a different structure, preserve the existing architecture unless there is a strong technical reason to refactor it.

---

# 5. User Roles

Implement the following roles.

## 5.1 Super Admin

Global franchise-level access.

Permissions:

- Manage branches
- Manage branch administrators
- View all branches
- View consolidated reports
- View branch-wise reports
- Manage system configuration
- View financial information
- Manage membership plans
- Manage users

## 5.2 Branch Admin

Branch-level management.

Permissions:

- Manage students
- Manage admissions
- Manage seats
- Manage batches
- Manage attendance
- Manage invoices
- Manage payments
- Manage fees
- View branch reports
- Manage branch staff

Cannot access another branch's data unless explicitly authorized.

## 5.3 Staff/Librarian

Operational access.

Permissions:

- Search students
- Process admissions
- Allocate seats
- Manage attendance
- Record payments
- Generate/view invoices
- View student profiles
- View fee status

---

# 6. Branch Isolation — Critical Requirement

Every branch-owned record must contain a `branch_id`.

At minimum:

```text
students.branch_id
seats.branch_id
batches.branch_id
attendance.branch_id
invoices.branch_id
payments.branch_id
fee_schedules.branch_id
```

The backend must enforce:

```text
Authenticated User
       |
       v
Determine Authorized Branches
       |
       v
Validate requested branch
       |
       v
Execute operation
```

A user must never be able to access another branch simply by changing a URL parameter, request body, query parameter, or database identifier.

Use Supabase Row Level Security where appropriate as a second layer of protection.

---

# 7. Authentication

Implement:

- Login
- Logout
- Password reset
- Session handling
- Protected routes
- Role-based authorization
- Branch-level authorization

Frontend routes must redirect unauthorized users.

Backend APIs must independently validate authentication and authorization.

Never rely only on frontend route protection.

---

# 8. Branch Management

## Branch Fields

```text
id
branch_code
name
address
city
state
phone
email
opening_time
closing_time
status
created_at
updated_at
```

## Status

```text
ACTIVE
INACTIVE
SUSPENDED
```

Super Admin can:

- Create branch
- Edit branch
- Activate/deactivate branch
- View branch details

Inactive branches must not allow new admissions or new operational transactions.

---

# 9. Student Management

## Student Fields

```text
id
student_code
branch_id
full_name
mobile
email
date_of_birth
address
emergency_contact_name
emergency_contact_phone
photo_url
status
created_at
updated_at
```

## Student Status

```text
ACTIVE
INACTIVE
EXPIRED
SUSPENDED
```

Student profile must display:

- Personal information
- Current membership
- Current seat
- Current batch
- Admission information
- Fee status
- Payment history
- Attendance history

---

# 10. Membership Plans

Membership plans must be configurable.

Example:

```text
Monthly
Quarterly
Half-Yearly
Yearly
```

Fields:

```text
id
name
duration_days
price
description
status
created_at
updated_at
```

Do not hard-code prices.

---

# 11. Seat Management

Each seat belongs to one branch.

## Seat Fields

```text
id
branch_id
seat_number
floor
section
seat_type
status
created_at
updated_at
```

## Seat Status

```text
AVAILABLE
OCCUPIED
RESERVED
MAINTENANCE
INACTIVE
```

## Rules

1. A seat can only belong to one branch.
2. A seat cannot be allocated to two active students during overlapping periods.
3. Allocation must be transactional.
4. Seat transfers must preserve history.
5. Releasing a seat must update its status correctly.

---

# 12. Seat Allocation

Create a dedicated `seat_allocations` table.

Recommended fields:

```text
id
branch_id
seat_id
student_id
start_date
end_date
status
allocated_by
created_at
updated_at
```

Allocation workflow:

```text
Select Student
      |
      v
Select Branch
      |
      v
Find Available Seats
      |
      v
Select Seat
      |
      v
Validate Availability
      |
      v
Create Allocation
      |
      v
Mark Seat OCCUPIED
```

Use database constraints/transactions to prevent conflicting allocations.

---

# 13. Seat Transfer

Staff can transfer a student from one seat to another.

Workflow:

```text
Current Seat
     |
     v
Request Transfer
     |
     v
Check New Seat
     |
     v
Close Existing Allocation
     |
     v
Create New Allocation
     |
     v
Update Seat Statuses
```

All operations must occur atomically.

---

# 14. Batch / Session Management

Each batch belongs to a branch.

Fields:

```text
id
branch_id
name
start_time
end_time
capacity
status
created_at
updated_at
```

Example:

```text
Morning
06:00 - 10:00

Afternoon
12:00 - 16:00

Evening
17:00 - 21:00
```

The system must prevent a batch from exceeding its configured capacity.

---

# 15. Batch Enrollment

Create a relationship between students and batches.

Recommended:

```text
batch_students
----------------
id
branch_id
batch_id
student_id
start_date
end_date
status
created_at
updated_at
```

Rules:

- Student and batch must belong to the same branch.
- Inactive batches cannot accept new students.
- Capacity must be checked before enrollment.

---

# 16. Admission Management

Admission is a multi-step transaction.

Required workflow:

```text
New Admission
      |
      v
Student Details
      |
      v
Select Branch
      |
      v
Select Membership Plan
      |
      v
Select Batch
      |
      v
Select Seat
      |
      v
Calculate Charges
      |
      v
Generate Invoice
      |
      v
Record Payment
      |
      v
Confirm Admission
```

The system should avoid partially completed admissions.

If a transaction fails, related database changes must be rolled back.

---

# 17. Admission Data

Create an admissions record.

Recommended:

```text
admissions
----------------
id
admission_number
branch_id
student_id
membership_plan_id
batch_id
seat_id
admission_date
start_date
end_date
status
created_by
created_at
updated_at
```

Admission numbers must be unique.

---

# 18. Invoice Management

Invoices are branch-specific.

Fields:

```text
id
invoice_number
branch_id
student_id
admission_id
invoice_date
due_date
subtotal
discount
tax
total
amount_paid
balance
status
created_at
updated_at
```

## Invoice Status

```text
DRAFT
PENDING
PARTIALLY_PAID
PAID
OVERDUE
CANCELLED
```

Invoice numbers must be unique.

---

# 19. Payment Management

Fields:

```text
id
branch_id
invoice_id
student_id
amount
payment_method
transaction_reference
payment_date
recorded_by
created_at
updated_at
```

Payment methods:

```text
CASH
UPI
BANK_TRANSFER
CARD
OTHER
```

When payment is recorded:

```text
Payment
   |
   v
Update Invoice amount_paid
   |
   v
Recalculate balance
   |
   v
Update invoice status
```

Do not allow payment amount to exceed the outstanding balance unless an explicit overpayment policy is implemented.

---

# 20. Fee Schedule

Fees must be trackable independently from invoices.

Recommended:

```text
fee_schedules
----------------
id
branch_id
student_id
invoice_id
amount
due_date
status
created_at
updated_at
```

Statuses:

```text
UPCOMING
DUE
PAID
OVERDUE
CANCELLED
```

---

# 21. Fee Reminders

The backend must support automated fee reminder processing.

Reminder conditions:

```text
Fee due soon
Fee due today
Fee overdue
```

The reminder service should be provider-independent.

Future providers can include:

- WhatsApp
- SMS
- Email
- Push notifications

The first production implementation should use only the notification provider explicitly configured for the project.

Do not hard-code a third-party notification provider.

---

# 22. Background Jobs

Create background jobs for:

- Fee reminder processing
- Membership expiry detection
- Biometric synchronization
- Attendance processing
- Notification processing

Jobs must be idempotent wherever possible.

A failed job must not create duplicate payments, invoices, attendance records, or reminders.

---

# 23. Attendance

Attendance sources:

```text
MANUAL
BIOMETRIC
IMPORTED
```

Attendance fields:

```text
id
branch_id
student_id
batch_id
attendance_date
check_in_time
check_out_time
source
biometric_record_id
created_at
updated_at
```

---

# 24. Manual Attendance

Authorized users can:

- View daily attendance
- Mark attendance
- Correct attendance
- View attendance history
- Search attendance by student

Attendance changes must be logged.

---

# 25. Biometric Integration

Attendance will originate from an external biometric machine.

Architecture:

```text
Biometric Machine
       |
       v
Integration Layer
       |
       v
Node.js Backend
       |
       v
Validate / Map / Deduplicate
       |
       v
Supabase PostgreSQL
       |
       v
Next.js Dashboard
```

The exact biometric integration must be determined from the machine's available API/SDK/network protocol.

Do not invent a vendor-specific API.

Create an abstraction such as:

```text
BiometricProvider
   |
   +-- syncAttendance()
   +-- getDeviceStatus()
   +-- testConnection()
```

This allows different biometric devices to be supported later.

---

# 26. Biometric User Mapping

Create:

```text
biometric_devices
-----------------
id
branch_id
name
device_identifier
ip_address
api_endpoint
status
last_sync_at
created_at
updated_at
```

And:

```text
biometric_mappings
------------------
id
branch_id
device_id
biometric_user_id
student_id
created_at
updated_at
```

Critical rule:

```text
Biometric User ID
        |
        v
Student
        |
        v
Branch
```

The system must verify that the biometric mapping and student belong to the same authorized branch.

---

# 27. Attendance Deduplication

Biometric synchronization must not create duplicate attendance records.

Use a stable external identifier where available.

If the biometric device provides:

```text
device_id
biometric_record_id
timestamp
```

use an appropriate unique constraint/idempotency mechanism.

---

# 28. Dashboard

## Super Admin Dashboard

Display:

- Total branches
- Active branches
- Total active students
- Total seats
- Occupied seats
- Available seats
- Today's attendance
- Today's admissions
- Revenue
- Pending fees
- Overdue fees

Allow filtering by branch and date.

## Branch Dashboard

Display:

- Active students
- Available seats
- Occupied seats
- Today's attendance
- New admissions
- Today's collection
- Pending fees
- Overdue fees
- Upcoming renewals

---

# 29. Search

Search must support:

- Student name
- Student code
- Mobile number
- Seat number
- Invoice number
- Batch
- Admission number

Search results must respect user branch permissions.

Use pagination for large datasets.

---

# 30. Reports

Required reports:

### Student Reports

- Active students
- New admissions
- Expired memberships
- Branch-wise students

### Seat Reports

- Available seats
- Occupied seats
- Seat utilization
- Allocation history

### Attendance Reports

- Daily attendance
- Monthly attendance
- Student attendance
- Branch attendance
- Absentee report

### Finance Reports

- Daily collection
- Monthly collection
- Outstanding fees
- Overdue fees
- Invoice report
- Payment report
- Branch-wise revenue

Reports should support:

- Date filtering
- Branch filtering
- Batch filtering
- Pagination
- Export where implemented

---

# 31. API Design

Use REST APIs.

Suggested endpoints:

```text
/api/v1/auth
/api/v1/branches
/api/v1/users
/api/v1/students
/api/v1/memberships
/api/v1/admissions
/api/v1/seats
/api/v1/seat-allocations
/api/v1/batches
/api/v1/attendance
/api/v1/biometric
/api/v1/invoices
/api/v1/payments
/api/v1/fees
/api/v1/reports
```

All protected APIs must validate:

1. Authentication
2. Role
3. Branch authorization
4. Request payload
5. Business rules

---

# 32. API Response Standard

Use a consistent response format.

Success:

```json
{
  "success": true,
  "data": {},
  "message": "Operation completed successfully"
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "SEAT_ALREADY_ALLOCATED",
    "message": "The selected seat is already allocated."
  }
}
```

Do not expose stack traces or internal database errors to clients.

---

# 33. Database Design

Minimum tables:

```text
branches
users
roles
students
membership_plans
admissions
seats
seat_allocations
batches
batch_students
invoices
invoice_items
payments
fee_schedules
fee_reminders
attendance
biometric_devices
biometric_mappings
audit_logs
```

All relevant foreign keys must be enforced.

Use indexes for:

- branch_id
- student_id
- seat_id
- invoice_number
- admission_number
- attendance_date
- due_date
- mobile
- status

---

# 34. Audit Logs

Create an audit logging mechanism.

Log important actions:

```text
BRANCH_CREATED
BRANCH_UPDATED
STUDENT_CREATED
STUDENT_UPDATED
ADMISSION_CREATED
SEAT_ALLOCATED
SEAT_TRANSFERRED
SEAT_RELEASED
INVOICE_CREATED
PAYMENT_RECORDED
ATTENDANCE_CREATED
ATTENDANCE_UPDATED
USER_CREATED
```

Audit fields:

```text
id
branch_id
user_id
action
entity_type
entity_id
metadata
created_at
```

Do not store sensitive credentials in audit metadata.

---

# 35. Frontend Requirements

Use Next.js with a clean, professional admin UI.

Required screens:

```text
/login

/dashboard

/branches
/branches/[id]

/students
/students/[id]
/students/new

/admissions
/admissions/new

/seats
/batches

/attendance
/attendance/history

/invoices
/invoices/[id]

/payments

/fees
/reports

/users
/settings
```

Routes should be protected according to role.

---

# 36. UI Components

Build reusable components for:

- Data tables
- Pagination
- Search
- Filters
- Forms
- Modal dialogs
- Confirmation dialogs
- Status badges
- Date pickers
- Select/dropdowns
- Toast notifications
- Dashboard cards
- Charts
- Empty states
- Loading states
- Error states

Do not duplicate the same component across modules.

---

# 37. Seat UI

The seat management screen should provide a visual representation of seats.

Example:

```text
┌────┬────┬────┬────┬────┐
│ A01│ A02│ A03│ A04│ A05│
├────┼────┼────┼────┼────┤
│ A06│ A07│ A08│ A09│ A10│
└────┴────┴────┴────┴────┘
```

Users should be able to quickly understand:

- Available
- Occupied
- Reserved
- Maintenance

Do not rely only on color; include text/icons/status indicators for accessibility.

---

# 38. Admission UI

Create a guided admission form.

Suggested sections:

```text
1. Student Information
2. Membership
3. Batch
4. Seat
5. Fee Summary
6. Payment
7. Confirmation
```

Show calculated totals before confirmation.

---

# 39. Validation

Frontend validation improves UX, but backend validation is mandatory.

Validate:

- Required fields
- Phone format
- Email format
- Dates
- Amounts
- Seat availability
- Batch capacity
- Branch access
- Membership validity

Never trust calculated amounts from the frontend.

The backend must recalculate financial values.

---

# 40. Financial Integrity

Financial operations require special care.

Rules:

1. Invoice totals must be calculated server-side.
2. Payments must be transaction-safe.
3. Invoice balance must be calculated from trusted data.
4. Cancelled invoices cannot receive normal payments.
5. Payment records should not be hard-deleted.
6. Corrections should use reversal/cancellation mechanisms.
7. Audit all payment-related actions.

---

# 41. Real-Time Updates

Use Supabase Realtime where it provides meaningful value.

Potential realtime events:

- Seat allocation
- Seat release
- Attendance arrival
- Payment update
- Fee status update

The UI must gracefully handle connection loss.

Realtime functionality must never bypass authorization.

---

# 42. Security

Implement:

- HTTPS
- Authentication
- RBAC
- Branch-level authorization
- Supabase RLS where applicable
- Input validation
- Secure headers
- Rate limiting
- CORS configuration
- Secret management
- SQL injection protection
- XSS protection
- Secure cookies/session handling
- Audit logs

Never expose:

```text
SUPABASE_SERVICE_ROLE_KEY
DATABASE_PASSWORD
JWT_SECRET
BIOMETRIC_API_KEY
```

to the browser.

---

# 43. Environment Variables

Create `.env.example`.

Example:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

DATABASE_URL=

JWT_SECRET=

BIOMETRIC_API_URL=
BIOMETRIC_API_KEY=

NOTIFICATION_PROVIDER=
NOTIFICATION_API_KEY=
```

Only variables explicitly required by the selected implementation should be added.

---

# 44. Railway Deployment

Production deployment target:

**Railway**

Requirements:

- Production environment
- Environment variables
- HTTPS
- Health endpoint
- Application logs
- Deployment configuration
- Restart/recovery behavior
- Production build
- Database connectivity verification

Add:

```text
GET /health
```

Response:

```json
{
  "status": "ok"
}
```

---

# 45. CI/CD

Use GitHub-based development.

Recommended workflow:

```text
Feature Branch
      |
      v
Pull Request
      |
      v
Lint
      |
      v
Type Check
      |
      v
Unit Tests
      |
      v
Build
      |
      v
Review
      |
      v
Merge
      |
      v
Railway Deployment
```

Claude Code should not push directly to production unless explicitly instructed.

---

# 46. Testing Strategy

Testing is mandatory for critical business rules.

## Unit Tests

Test:

- Fee calculations
- Invoice calculations
- Seat availability
- Batch capacity
- Fee status
- Attendance deduplication
- Branch authorization

## Integration Tests

Test:

- Admission workflow
- Payment workflow
- Seat allocation
- Seat transfer
- Attendance synchronization

## API Tests

Verify:

- Authentication
- Authorization
- Validation
- Error handling
- Branch isolation

## End-to-End Tests

At minimum test:

```text
Login
   ↓
Create Student
   ↓
Create Admission
   ↓
Allocate Seat
   ↓
Generate Invoice
   ↓
Record Payment
   ↓
View Attendance
   ↓
View Fee Status
```

---

# 47. Branch Isolation Test

This test is mandatory.

Example:

```text
User belongs to Branch A

Attempt:
GET /api/v1/students/{branch-B-student-id}

Expected:
403 Forbidden
```

Also test that a Branch A user cannot:

- Allocate a Branch B seat
- Create a Branch B admission
- View Branch B invoices
- Modify Branch B attendance
- View Branch B student information

---

# 48. Definition of Done

A module is complete only when:

- Database migration exists
- Backend API exists
- Authorization is implemented
- Branch isolation is verified
- Frontend screen exists
- Loading state exists
- Empty state exists
- Error handling exists
- Validation exists
- Tests exist for critical rules
- Documentation is updated
- No TypeScript/build errors remain
- No secrets are committed

---

# 49. Development Phases for Claude Code

Claude Code should follow this order.

## Phase 0 — Repository Inspection

Before writing code:

1. Inspect repository.
2. Identify existing frontend/backend.
3. Identify package manager.
4. Inspect environment configuration.
5. Inspect database configuration.
6. Identify existing authentication.
7. Identify existing deployment configuration.
8. Run the application.
9. Run existing tests.
10. Document current architecture.

Do not make destructive changes during inspection.

---

## Phase 1 — Foundation

Implement:

- Project structure
- TypeScript configuration
- Environment handling
- Authentication
- Roles
- Branch model
- Authorization middleware
- Database migrations
- Error handling
- Logging
- Health endpoint

---

## Phase 2 — Branch & User Management

Implement:

- Branch CRUD
- User management
- Role assignment
- Branch assignment
- Branch authorization

Acceptance:

A Branch Admin can only operate within their assigned branch.

---

## Phase 3 — Student Management

Implement:

- Student CRUD
- Student profile
- Search
- Pagination
- Status management
- Branch filtering

---

## Phase 4 — Seats

Implement:

- Seat CRUD
- Seat visual grid
- Availability
- Allocation
- Release
- Transfer
- Allocation history

Add tests for overlapping allocation.

---

## Phase 5 — Batches

Implement:

- Batch CRUD
- Capacity
- Student enrollment
- Batch transfer
- Batch status

---

## Phase 6 — Admissions

Implement:

- Admission workflow
- Membership selection
- Batch assignment
- Seat assignment
- Admission number
- Admission confirmation

Use database transactions.

---

## Phase 7 — Finance

Implement:

- Invoice generation
- Invoice listing
- Payment recording
- Payment history
- Outstanding balance
- Fee schedule
- Fee status

Add strong financial validation.

---

## Phase 8 — Fee Reminders

Implement:

- Upcoming fee detection
- Due-date detection
- Overdue detection
- Reminder records
- Background job
- Notification provider abstraction

---

## Phase 9 — Attendance

Implement:

- Manual attendance
- Attendance history
- Attendance reports
- Biometric provider abstraction
- Device configuration
- Student mapping
- Synchronization
- Deduplication

---

## Phase 10 — Dashboards & Reports

Implement:

- Super Admin dashboard
- Branch dashboard
- Student metrics
- Seat metrics
- Attendance metrics
- Financial metrics
- Reports
- Filters
- Export functionality where required

---

## Phase 11 — Realtime

Implement:

- Seat updates
- Attendance updates
- Payment updates
- Dashboard updates

Only after core workflows are stable.

---

## Phase 12 — Production

Complete:

- Security review
- Performance optimization
- Automated tests
- Build validation
- Railway deployment
- Environment configuration
- Monitoring
- Logging
- Backup verification
- UAT

---

# 50. Claude Code Working Protocol

For every development task, Claude Code should follow:

```text
1. Understand the requested change
2. Inspect relevant existing files
3. Identify dependencies
4. Propose implementation approach
5. Implement smallest safe change
6. Run lint/type checks
7. Run relevant tests
8. Fix failures
9. Verify build
10. Summarize changes
```

For database changes:

```text
1. Create migration
2. Review migration
3. Apply migration
4. Verify schema
5. Update types
6. Update API
7. Update frontend
8. Test
```

For a bug:

```text
1. Reproduce
2. Identify root cause
3. Fix root cause
4. Add regression test
5. Run affected tests
6. Run build
```

Do not hide errors by suppressing them.

---

# 51. Claude Code Rules

Claude Code must:

- Prefer existing project conventions.
- Avoid unnecessary dependencies.
- Avoid unnecessary rewrites.
- Avoid duplicated business logic.
- Keep functions focused.
- Use meaningful names.
- Add comments only where they improve understanding.
- Keep secrets out of source code.
- Use migrations for schema changes.
- Never directly modify production data during development.
- Never bypass authorization to make a test pass.
- Never disable security controls as a shortcut.
- Never silently change business rules.
- Ask for clarification when a requirement materially conflicts with this PRD.

---

# 52. MVP Acceptance Criteria

The MVP is successful when:

### Branches
- Multiple branches can be created.
- Branch data is isolated.
- Super Admin can view all branches.
- Branch users can only access authorized branches.

### Students
- Students can be created and managed.
- Student profiles show current membership, batch, seat and fees.

### Seats
- Seats can be configured by branch.
- Seats can be allocated.
- Duplicate allocations are prevented.
- Seats can be transferred.
- Allocation history is retained.

### Batches
- Batches can be created.
- Capacity is enforced.
- Students can be assigned to batches.

### Admissions
- Complete admissions can be processed.
- Membership, batch and seat can be assigned.
- Invoice is generated.

### Finance
- Payments can be recorded.
- Invoice balance is accurate.
- Fee status is accurate.
- Fee reminders are generated.

### Attendance
- Manual attendance works.
- Biometric integration abstraction exists.
- Biometric records can be mapped to students.
- Duplicate attendance is prevented.

### Dashboard
- Branch dashboard shows accurate operational metrics.
- Super Admin can see consolidated information.

### Deployment
- Application builds successfully.
- Application runs on Railway.
- Supabase connection works.
- Production secrets are securely configured.
- Health endpoint works.

---

# 53. Future Scope — Not MVP

Do not implement these unless explicitly requested:

- AI chatbot
- AI agents
- Student mobile app
- Parent portal
- Online admission portal
- Online payment gateway
- WhatsApp automation
- SMS automation
- QR attendance
- Payroll
- Accounting integration
- CCTV integration
- Advanced predictive analytics
- Digital ID cards
- Book inventory/catalog management

The architecture should remain extensible enough to support these later.

---

# 54. Final Product Principle

The most important rule of the Manas Library Management System is:

> **Everything is branch-aware.**

The system must be designed so that adding a new library branch does not require creating a separate application or database.

The same platform must support:

```text
Manas Library Franchise
        |
        +--- Branch 1
        +--- Branch 2
        +--- Branch 3
        +--- Branch 4
        +--- ...
```

Each branch operates independently while Super Admin retains centralized visibility and control.

---

# 55. Initial Claude Code Prompt

After placing this file in the repository as `PRD.md`, use the following prompt with Claude Code:

```text
Read PRD.md completely before making any changes.

You are the lead full-stack engineer for the Manas Library Management System.

Do not implement the entire application in one step.

First inspect the existing repository and report:

1. Current project structure
2. Frontend framework and version
3. Backend framework and version
4. Database setup
5. Authentication setup
6. Existing APIs
7. Existing UI/pages
8. Environment variables
9. Existing tests
10. Existing deployment configuration

Do not modify files during this inspection.

Then create a development plan based on PRD.md.

The implementation must be incremental and follow the phases in PRD.md.

Critical requirements:

- Multi-branch architecture
- Strict branch-level authorization
- Role-based access control
- Next.js frontend
- Node.js backend
- Supabase PostgreSQL
- Railway deployment
- Seat allocation
- Admissions
- Invoices
- Payments
- Batches
- Attendance
- External biometric integration abstraction
- Fee reminders
- Reports
- Real-time updates

Do not add chatbot or AI functionality.

Do not invent biometric-machine-specific APIs without knowing the actual device/vendor.

Do not expose secrets.

Do not bypass authorization.

After each implementation phase:
- Run tests
- Run lint
- Run type checks
- Run production build
- Fix errors
- Summarize completed work
- Identify the next phase

Start with repository inspection only.
```

---

# 56. Deliverable

The final production system should provide:

```text
                    MANAS LIBRARY
                         |
              ┌──────────┴──────────┐
              |                     |
         SUPER ADMIN           BRANCH ADMIN
              |                     |
       All Branches            One Branch
              |                     |
       ┌──────┴──────┐       ┌──────┴──────┐
       |             |       |             |
    Students       Reports Students      Operations
       |                     |
   Admissions             Seats
   Seats                   Batches
   Batches                 Attendance
   Attendance              Invoices
   Finance                 Payments
                           Fees
```

The implementation should prioritize **correctness, security, branch isolation, financial integrity, maintainability, and production stability** over adding unnecessary features.

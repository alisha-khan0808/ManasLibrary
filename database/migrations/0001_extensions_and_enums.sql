-- 0001 — Extensions, enum types and shared helpers.
-- Everything in this project lives in the `public` schema; Supabase owns `auth`.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "btree_gist"; -- exclusion constraints on (uuid, daterange)
CREATE EXTENSION IF NOT EXISTS "citext";     -- case-insensitive email/codes

-- --------------------------------------------------------------------------
-- Enum types (mirrored in packages/shared/src/enums.ts)
-- --------------------------------------------------------------------------
CREATE TYPE user_role            AS ENUM ('SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF');
CREATE TYPE user_status          AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');
CREATE TYPE branch_status        AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');
CREATE TYPE student_status       AS ENUM ('ACTIVE', 'INACTIVE', 'EXPIRED', 'SUSPENDED');
CREATE TYPE plan_status          AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE seat_status          AS ENUM ('AVAILABLE', 'OCCUPIED', 'RESERVED', 'MAINTENANCE', 'INACTIVE');
CREATE TYPE seat_type            AS ENUM ('STANDARD', 'CABIN', 'AC', 'NON_AC');
CREATE TYPE allocation_status    AS ENUM ('ACTIVE', 'RELEASED', 'TRANSFERRED', 'EXPIRED', 'CANCELLED');
CREATE TYPE batch_status         AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE enrollment_status    AS ENUM ('ACTIVE', 'COMPLETED', 'TRANSFERRED', 'CANCELLED');
CREATE TYPE admission_status     AS ENUM ('PENDING', 'CONFIRMED', 'EXPIRED', 'CANCELLED');
CREATE TYPE invoice_status       AS ENUM ('DRAFT', 'PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED');
CREATE TYPE payment_method       AS ENUM ('CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'OTHER');
CREATE TYPE payment_status       AS ENUM ('COMPLETED', 'REVERSED');
CREATE TYPE fee_schedule_status  AS ENUM ('UPCOMING', 'DUE', 'PAID', 'OVERDUE', 'CANCELLED');
CREATE TYPE reminder_type        AS ENUM ('UPCOMING', 'DUE_TODAY', 'OVERDUE');
CREATE TYPE reminder_status      AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');
CREATE TYPE attendance_source    AS ENUM ('MANUAL', 'BIOMETRIC', 'IMPORTED');
CREATE TYPE attendance_status    AS ENUM ('PRESENT', 'ABSENT', 'LATE');
CREATE TYPE device_status        AS ENUM ('ACTIVE', 'INACTIVE', 'ERROR');

-- --------------------------------------------------------------------------
-- Shared trigger: keep updated_at honest regardless of what the client sends.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_updated_at() IS
  'Attach as BEFORE UPDATE trigger on every table carrying updated_at.';

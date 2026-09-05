-- 0003 — Students and membership plans.

CREATE TABLE public.membership_plans (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL UNIQUE,
  duration_days  integer NOT NULL,
  price          numeric(12, 2) NOT NULL,
  description    text,
  status         plan_status NOT NULL DEFAULT 'ACTIVE',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT membership_plans_duration_positive CHECK (duration_days > 0),
  CONSTRAINT membership_plans_price_non_negative CHECK (price >= 0)
);

CREATE INDEX idx_membership_plans_status ON public.membership_plans (status);

CREATE TRIGGER trg_membership_plans_updated_at
  BEFORE UPDATE ON public.membership_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.students (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_code             citext NOT NULL UNIQUE,
  branch_id                uuid NOT NULL REFERENCES public.branches (id) ON DELETE RESTRICT,
  full_name                text NOT NULL,
  mobile                   text NOT NULL,
  email                    citext,
  date_of_birth            date,
  address                  text,
  emergency_contact_name   text,
  emergency_contact_phone  text,
  photo_url                text,
  status                   student_status NOT NULL DEFAULT 'ACTIVE',
  created_by               uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT students_full_name_not_blank CHECK (length(btrim(full_name)) > 0),
  CONSTRAINT students_mobile_format CHECK (mobile ~ '^[0-9]{10,15}$'),
  CONSTRAINT students_dob_past CHECK (date_of_birth IS NULL OR date_of_birth < CURRENT_DATE)
);

-- Redundant on its own, but lets child tables declare a composite foreign key
-- (student_id, branch_id) so the database itself rejects a row that mixes a
-- student from one branch with another branch's context. Branch isolation is
-- enforced structurally, not only in application code.
ALTER TABLE public.students
  ADD CONSTRAINT uq_students_id_branch UNIQUE (id, branch_id);

-- A mobile number identifies one student inside a branch. The same person may
-- legitimately exist at two branches, so the constraint is branch-scoped.
CREATE UNIQUE INDEX uq_students_branch_mobile
  ON public.students (branch_id, mobile);

CREATE INDEX idx_students_branch  ON public.students (branch_id);
CREATE INDEX idx_students_status  ON public.students (status);
CREATE INDEX idx_students_mobile  ON public.students (mobile);
CREATE INDEX idx_students_branch_status ON public.students (branch_id, status);

-- Trigram-free prefix search on name, adequate for admin-console volumes.
CREATE INDEX idx_students_name_lower ON public.students (lower(full_name) text_pattern_ops);

CREATE TRIGGER trg_students_updated_at
  BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

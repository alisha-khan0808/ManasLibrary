-- 0005 — Batches (sessions) and student enrolment.

CREATE TABLE public.batches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id   uuid NOT NULL REFERENCES public.branches (id) ON DELETE RESTRICT,
  name        text NOT NULL,
  start_time  time NOT NULL,
  end_time    time NOT NULL,
  capacity    integer NOT NULL,
  status      batch_status NOT NULL DEFAULT 'ACTIVE',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT batches_capacity_positive CHECK (capacity > 0),
  CONSTRAINT batches_time_order CHECK (end_time > start_time),
  CONSTRAINT uq_batches_branch_name UNIQUE (branch_id, name),
  CONSTRAINT uq_batches_id_branch UNIQUE (id, branch_id)
);

CREATE INDEX idx_batches_branch ON public.batches (branch_id);
CREATE INDEX idx_batches_status ON public.batches (status);

CREATE TRIGGER trg_batches_updated_at
  BEFORE UPDATE ON public.batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.batch_students (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id   uuid NOT NULL REFERENCES public.branches (id) ON DELETE RESTRICT,
  batch_id    uuid NOT NULL,
  student_id  uuid NOT NULL,
  start_date  date NOT NULL,
  end_date    date,
  status      enrollment_status NOT NULL DEFAULT 'ACTIVE',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fk_batch_students_batch
    FOREIGN KEY (batch_id, branch_id)
    REFERENCES public.batches (id, branch_id) ON DELETE RESTRICT,
  CONSTRAINT fk_batch_students_student
    FOREIGN KEY (student_id, branch_id)
    REFERENCES public.students (id, branch_id) ON DELETE RESTRICT,

  CONSTRAINT batch_students_date_order
    CHECK (end_date IS NULL OR end_date >= start_date)
);

-- A student holds at most one ACTIVE enrolment per batch, and at most one
-- ACTIVE batch overall (a person cannot sit in two sessions at once).
CREATE UNIQUE INDEX uq_batch_students_active
  ON public.batch_students (student_id)
  WHERE status = 'ACTIVE';

CREATE INDEX idx_batch_students_branch  ON public.batch_students (branch_id);
CREATE INDEX idx_batch_students_batch   ON public.batch_students (batch_id);
CREATE INDEX idx_batch_students_student ON public.batch_students (student_id);
CREATE INDEX idx_batch_students_active
  ON public.batch_students (batch_id)
  WHERE status = 'ACTIVE';

CREATE TRIGGER trg_batch_students_updated_at
  BEFORE UPDATE ON public.batch_students
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- Capacity guard. The API also checks capacity inside the enrolment
-- transaction (with the batch row locked) to return a clean error message;
-- this trigger is the last line of defence against any other writer.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_batch_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  active_count integer;
  max_capacity integer;
BEGIN
  IF NEW.status <> 'ACTIVE' THEN
    RETURN NEW;
  END IF;

  SELECT capacity INTO max_capacity
  FROM public.batches
  WHERE id = NEW.batch_id
  FOR UPDATE;

  SELECT count(*) INTO active_count
  FROM public.batch_students
  WHERE batch_id = NEW.batch_id
    AND status = 'ACTIVE'
    AND id <> NEW.id;

  IF active_count >= max_capacity THEN
    RAISE EXCEPTION 'BATCH_CAPACITY_EXCEEDED: batch % is at capacity (%)',
      NEW.batch_id, max_capacity
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_batch_students_capacity
  BEFORE INSERT OR UPDATE OF status, batch_id ON public.batch_students
  FOR EACH ROW EXECUTE FUNCTION public.enforce_batch_capacity();

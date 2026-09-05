-- 0006 — Admissions.

CREATE TABLE public.admissions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_number    citext NOT NULL UNIQUE,
  branch_id           uuid NOT NULL REFERENCES public.branches (id) ON DELETE RESTRICT,
  student_id          uuid NOT NULL,
  membership_plan_id  uuid NOT NULL REFERENCES public.membership_plans (id) ON DELETE RESTRICT,
  batch_id            uuid,
  seat_id             uuid,
  admission_date      date NOT NULL DEFAULT CURRENT_DATE,
  start_date          date NOT NULL,
  end_date            date NOT NULL,
  status              admission_status NOT NULL DEFAULT 'PENDING',
  notes               text,
  created_by          uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fk_admissions_student
    FOREIGN KEY (student_id, branch_id)
    REFERENCES public.students (id, branch_id) ON DELETE RESTRICT,
  CONSTRAINT fk_admissions_batch
    FOREIGN KEY (batch_id, branch_id)
    REFERENCES public.batches (id, branch_id) ON DELETE RESTRICT,
  CONSTRAINT fk_admissions_seat
    FOREIGN KEY (seat_id, branch_id)
    REFERENCES public.seats (id, branch_id) ON DELETE RESTRICT,

  CONSTRAINT admissions_date_order CHECK (end_date >= start_date),
  CONSTRAINT uq_admissions_id_branch UNIQUE (id, branch_id)
);

CREATE INDEX idx_admissions_branch     ON public.admissions (branch_id);
CREATE INDEX idx_admissions_student    ON public.admissions (student_id);
CREATE INDEX idx_admissions_status     ON public.admissions (status);
CREATE INDEX idx_admissions_date       ON public.admissions (admission_date);
CREATE INDEX idx_admissions_end_date   ON public.admissions (end_date);
CREATE INDEX idx_admissions_branch_date ON public.admissions (branch_id, admission_date);

-- The student's current membership: at most one CONFIRMED admission may be
-- open at a time, which keeps "current membership" on the profile unambiguous.
CREATE UNIQUE INDEX uq_admissions_active_per_student
  ON public.admissions (student_id)
  WHERE status IN ('PENDING', 'CONFIRMED');

CREATE TRIGGER trg_admissions_updated_at
  BEFORE UPDATE ON public.admissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

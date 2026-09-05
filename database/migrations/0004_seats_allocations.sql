-- 0004 — Seats and seat allocations.
--
-- The overlap rule (PRD §11.2) is enforced by an EXCLUDE constraint rather
-- than application logic, so a race between two concurrent allocations can
-- never produce a double-booked seat.

CREATE TABLE public.seats (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id    uuid NOT NULL REFERENCES public.branches (id) ON DELETE RESTRICT,
  seat_number  citext NOT NULL,
  floor        text,
  section      text,
  seat_type    seat_type NOT NULL DEFAULT 'STANDARD',
  status       seat_status NOT NULL DEFAULT 'AVAILABLE',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seats_number_not_blank CHECK (length(btrim(seat_number::text)) > 0),
  CONSTRAINT uq_seats_branch_number UNIQUE (branch_id, seat_number),
  CONSTRAINT uq_seats_id_branch UNIQUE (id, branch_id)
);

CREATE INDEX idx_seats_branch        ON public.seats (branch_id);
CREATE INDEX idx_seats_status        ON public.seats (status);
CREATE INDEX idx_seats_branch_status ON public.seats (branch_id, status);

CREATE TRIGGER trg_seats_updated_at
  BEFORE UPDATE ON public.seats
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.seat_allocations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id     uuid NOT NULL REFERENCES public.branches (id) ON DELETE RESTRICT,
  seat_id       uuid NOT NULL,
  student_id    uuid NOT NULL,
  start_date    date NOT NULL,
  end_date      date,
  status        allocation_status NOT NULL DEFAULT 'ACTIVE',
  allocated_by  uuid REFERENCES public.users (id) ON DELETE SET NULL,
  released_at   timestamptz,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- Composite FKs: the seat and the student must live in this same branch.
  CONSTRAINT fk_seat_allocations_seat
    FOREIGN KEY (seat_id, branch_id)
    REFERENCES public.seats (id, branch_id) ON DELETE RESTRICT,
  CONSTRAINT fk_seat_allocations_student
    FOREIGN KEY (student_id, branch_id)
    REFERENCES public.students (id, branch_id) ON DELETE RESTRICT,

  CONSTRAINT seat_allocations_date_order
    CHECK (end_date IS NULL OR end_date >= start_date)
);

-- One seat cannot carry two ACTIVE allocations over overlapping dates.
-- Bounds are inclusive ('[]') so a membership ending on the 30th still holds
-- the seat on the 30th — that is how staff read an end date. A NULL end_date
-- means open-ended and blocks every later allocation until released.
ALTER TABLE public.seat_allocations
  ADD CONSTRAINT excl_seat_allocations_overlap
  EXCLUDE USING gist (
    seat_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  )
  WHERE (status = 'ACTIVE');

-- A student may not hold two active seats at once in the same branch.
ALTER TABLE public.seat_allocations
  ADD CONSTRAINT excl_student_allocations_overlap
  EXCLUDE USING gist (
    student_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  )
  WHERE (status = 'ACTIVE');

CREATE INDEX idx_seat_allocations_branch  ON public.seat_allocations (branch_id);
CREATE INDEX idx_seat_allocations_seat    ON public.seat_allocations (seat_id);
CREATE INDEX idx_seat_allocations_student ON public.seat_allocations (student_id);
CREATE INDEX idx_seat_allocations_status  ON public.seat_allocations (status);
CREATE INDEX idx_seat_allocations_active
  ON public.seat_allocations (branch_id, seat_id)
  WHERE status = 'ACTIVE';

CREATE TRIGGER trg_seat_allocations_updated_at
  BEFORE UPDATE ON public.seat_allocations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

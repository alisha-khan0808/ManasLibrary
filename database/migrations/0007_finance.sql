-- 0007 — Invoices, invoice items, payments, fee schedules and reminders.
--
-- Financial integrity (PRD §40) is structural: `total` and `balance` are
-- GENERATED columns, so no code path — application, job or manual SQL — can
-- persist a total that disagrees with its components.

CREATE TABLE public.invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number  citext NOT NULL UNIQUE,
  branch_id       uuid NOT NULL REFERENCES public.branches (id) ON DELETE RESTRICT,
  student_id      uuid NOT NULL,
  admission_id    uuid,
  invoice_date    date NOT NULL DEFAULT CURRENT_DATE,
  due_date        date NOT NULL,
  subtotal        numeric(12, 2) NOT NULL DEFAULT 0,
  discount        numeric(12, 2) NOT NULL DEFAULT 0,
  tax             numeric(12, 2) NOT NULL DEFAULT 0,
  total           numeric(12, 2) GENERATED ALWAYS AS (subtotal - discount + tax) STORED,
  amount_paid     numeric(12, 2) NOT NULL DEFAULT 0,
  balance         numeric(12, 2) GENERATED ALWAYS AS (subtotal - discount + tax - amount_paid) STORED,
  status          invoice_status NOT NULL DEFAULT 'PENDING',
  notes           text,
  created_by      uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fk_invoices_student
    FOREIGN KEY (student_id, branch_id)
    REFERENCES public.students (id, branch_id) ON DELETE RESTRICT,
  CONSTRAINT fk_invoices_admission
    FOREIGN KEY (admission_id, branch_id)
    REFERENCES public.admissions (id, branch_id) ON DELETE RESTRICT,

  CONSTRAINT invoices_amounts_non_negative
    CHECK (subtotal >= 0 AND discount >= 0 AND tax >= 0 AND amount_paid >= 0),
  CONSTRAINT invoices_discount_within_subtotal
    CHECK (discount <= subtotal),
  CONSTRAINT invoices_due_after_issue
    CHECK (due_date >= invoice_date),
  CONSTRAINT uq_invoices_id_branch UNIQUE (id, branch_id)
);

-- No overpayment: amount_paid may never exceed the invoice total.
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_no_overpayment
  CHECK (amount_paid <= subtotal - discount + tax);

CREATE INDEX idx_invoices_branch     ON public.invoices (branch_id);
CREATE INDEX idx_invoices_student    ON public.invoices (student_id);
CREATE INDEX idx_invoices_status     ON public.invoices (status);
CREATE INDEX idx_invoices_due_date   ON public.invoices (due_date);
CREATE INDEX idx_invoices_date       ON public.invoices (invoice_date);
CREATE INDEX idx_invoices_branch_status ON public.invoices (branch_id, status);
CREATE INDEX idx_invoices_outstanding
  ON public.invoices (branch_id, due_date)
  WHERE status IN ('PENDING', 'PARTIALLY_PAID', 'OVERDUE');

CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.invoice_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   uuid NOT NULL REFERENCES public.invoices (id) ON DELETE CASCADE,
  description  text NOT NULL,
  quantity     integer NOT NULL DEFAULT 1,
  unit_price   numeric(12, 2) NOT NULL,
  amount       numeric(12, 2) GENERATED ALWAYS AS (unit_price * quantity) STORED,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_items_quantity_positive CHECK (quantity > 0),
  CONSTRAINT invoice_items_price_non_negative CHECK (unit_price >= 0),
  CONSTRAINT invoice_items_description_not_blank CHECK (length(btrim(description)) > 0)
);

CREATE INDEX idx_invoice_items_invoice ON public.invoice_items (invoice_id);

-- --------------------------------------------------------------------------
-- Payments. Records are never hard-deleted (PRD §40.5). A correction inserts
-- a compensating row with a negative amount pointing at the original, so the
-- ledger stays append-only and auditable.
-- --------------------------------------------------------------------------
CREATE TABLE public.payments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id              uuid NOT NULL REFERENCES public.branches (id) ON DELETE RESTRICT,
  invoice_id             uuid NOT NULL,
  student_id             uuid NOT NULL,
  amount                 numeric(12, 2) NOT NULL,
  payment_method         payment_method NOT NULL,
  transaction_reference  text,
  payment_date           date NOT NULL DEFAULT CURRENT_DATE,
  status                 payment_status NOT NULL DEFAULT 'COMPLETED',
  reverses_payment_id    uuid REFERENCES public.payments (id) ON DELETE RESTRICT,
  notes                  text,
  recorded_by            uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fk_payments_invoice
    FOREIGN KEY (invoice_id, branch_id)
    REFERENCES public.invoices (id, branch_id) ON DELETE RESTRICT,
  CONSTRAINT fk_payments_student
    FOREIGN KEY (student_id, branch_id)
    REFERENCES public.students (id, branch_id) ON DELETE RESTRICT,

  -- Ordinary receipts are positive; reversals are negative and must reference
  -- the payment they undo.
  CONSTRAINT payments_signed_amount CHECK (
    (reverses_payment_id IS NULL AND amount > 0)
    OR (reverses_payment_id IS NOT NULL AND amount < 0)
  )
);

-- A payment can be reversed at most once.
CREATE UNIQUE INDEX uq_payments_single_reversal
  ON public.payments (reverses_payment_id)
  WHERE reverses_payment_id IS NOT NULL;

CREATE INDEX idx_payments_branch   ON public.payments (branch_id);
CREATE INDEX idx_payments_invoice  ON public.payments (invoice_id);
CREATE INDEX idx_payments_student  ON public.payments (student_id);
CREATE INDEX idx_payments_date     ON public.payments (payment_date);
CREATE INDEX idx_payments_branch_date ON public.payments (branch_id, payment_date);

CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- Fee schedules and reminders.
-- --------------------------------------------------------------------------
CREATE TABLE public.fee_schedules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id   uuid NOT NULL REFERENCES public.branches (id) ON DELETE RESTRICT,
  student_id  uuid NOT NULL,
  invoice_id  uuid,
  amount      numeric(12, 2) NOT NULL,
  due_date    date NOT NULL,
  status      fee_schedule_status NOT NULL DEFAULT 'UPCOMING',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fk_fee_schedules_student
    FOREIGN KEY (student_id, branch_id)
    REFERENCES public.students (id, branch_id) ON DELETE RESTRICT,
  CONSTRAINT fk_fee_schedules_invoice
    FOREIGN KEY (invoice_id, branch_id)
    REFERENCES public.invoices (id, branch_id) ON DELETE RESTRICT,

  CONSTRAINT fee_schedules_amount_positive CHECK (amount > 0)
);

-- One schedule row per invoice keeps the reminder job idempotent.
CREATE UNIQUE INDEX uq_fee_schedules_invoice
  ON public.fee_schedules (invoice_id)
  WHERE invoice_id IS NOT NULL;

CREATE INDEX idx_fee_schedules_branch   ON public.fee_schedules (branch_id);
CREATE INDEX idx_fee_schedules_student  ON public.fee_schedules (student_id);
CREATE INDEX idx_fee_schedules_due_date ON public.fee_schedules (due_date);
CREATE INDEX idx_fee_schedules_status   ON public.fee_schedules (status);
CREATE INDEX idx_fee_schedules_pending
  ON public.fee_schedules (due_date)
  WHERE status IN ('UPCOMING', 'DUE', 'OVERDUE');

CREATE TRIGGER trg_fee_schedules_updated_at
  BEFORE UPDATE ON public.fee_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.fee_reminders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id        uuid NOT NULL REFERENCES public.branches (id) ON DELETE RESTRICT,
  student_id       uuid NOT NULL,
  fee_schedule_id  uuid NOT NULL REFERENCES public.fee_schedules (id) ON DELETE CASCADE,
  reminder_type    reminder_type NOT NULL,
  reminder_date    date NOT NULL,
  status           reminder_status NOT NULL DEFAULT 'PENDING',
  provider         text,
  error_message    text,
  sent_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fk_fee_reminders_student
    FOREIGN KEY (student_id, branch_id)
    REFERENCES public.students (id, branch_id) ON DELETE RESTRICT
);

-- Idempotency key for the reminder job: re-running it on the same day can
-- never produce a second reminder of the same kind for the same fee.
CREATE UNIQUE INDEX uq_fee_reminders_idempotency
  ON public.fee_reminders (fee_schedule_id, reminder_type, reminder_date);

CREATE INDEX idx_fee_reminders_branch ON public.fee_reminders (branch_id);
CREATE INDEX idx_fee_reminders_status ON public.fee_reminders (status);

CREATE TRIGGER trg_fee_reminders_updated_at
  BEFORE UPDATE ON public.fee_reminders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

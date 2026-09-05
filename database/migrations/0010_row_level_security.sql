-- 0010 — Row Level Security.
--
-- Second line of defence (PRD §6). The Node API connects as the database
-- owner and is therefore NOT subject to these policies — it enforces branch
-- access itself in code. RLS exists for the browser session, which holds a
-- Supabase `authenticated` JWT and subscribes to Realtime channels directly.
--
-- Policy shape for the browser:
--   * SELECT  — only rows in a branch the user is assigned to.
--   * INSERT/UPDATE/DELETE — never. All writes go through the API so business
--     rules, transactions and audit logging cannot be bypassed.

ALTER TABLE public.branches           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_branches      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_plans   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seats              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seat_allocations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batches            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_students     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admissions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_schedules      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_reminders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.biometric_devices  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.biometric_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.biometric_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_sequences ENABLE ROW LEVEL SECURITY;

-- document_sequences and biometric_events carry no browser-facing use case:
-- RLS enabled with zero policies means deny-all for non-owner roles.

-- --------------------------------------------------------------------------
-- Identity
-- --------------------------------------------------------------------------
CREATE POLICY branches_select ON public.branches
  FOR SELECT TO authenticated
  USING (public.has_branch_access(id));

CREATE POLICY roles_select ON public.roles
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY users_select_self ON public.users
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_super_admin());

CREATE POLICY user_branches_select_self ON public.user_branches
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin());

CREATE POLICY membership_plans_select ON public.membership_plans
  FOR SELECT TO authenticated
  USING (true);

-- --------------------------------------------------------------------------
-- Branch-scoped operational data
-- --------------------------------------------------------------------------
CREATE POLICY students_select ON public.students
  FOR SELECT TO authenticated USING (public.has_branch_access(branch_id));

CREATE POLICY seats_select ON public.seats
  FOR SELECT TO authenticated USING (public.has_branch_access(branch_id));

CREATE POLICY seat_allocations_select ON public.seat_allocations
  FOR SELECT TO authenticated USING (public.has_branch_access(branch_id));

CREATE POLICY batches_select ON public.batches
  FOR SELECT TO authenticated USING (public.has_branch_access(branch_id));

CREATE POLICY batch_students_select ON public.batch_students
  FOR SELECT TO authenticated USING (public.has_branch_access(branch_id));

CREATE POLICY admissions_select ON public.admissions
  FOR SELECT TO authenticated USING (public.has_branch_access(branch_id));

CREATE POLICY invoices_select ON public.invoices
  FOR SELECT TO authenticated USING (public.has_branch_access(branch_id));

CREATE POLICY payments_select ON public.payments
  FOR SELECT TO authenticated USING (public.has_branch_access(branch_id));

CREATE POLICY fee_schedules_select ON public.fee_schedules
  FOR SELECT TO authenticated USING (public.has_branch_access(branch_id));

CREATE POLICY fee_reminders_select ON public.fee_reminders
  FOR SELECT TO authenticated USING (public.has_branch_access(branch_id));

CREATE POLICY attendance_select ON public.attendance
  FOR SELECT TO authenticated USING (public.has_branch_access(branch_id));

CREATE POLICY biometric_devices_select ON public.biometric_devices
  FOR SELECT TO authenticated USING (public.has_branch_access(branch_id));

CREATE POLICY biometric_mappings_select ON public.biometric_mappings
  FOR SELECT TO authenticated USING (public.has_branch_access(branch_id));

CREATE POLICY audit_logs_select ON public.audit_logs
  FOR SELECT TO authenticated
  USING (branch_id IS NOT NULL AND public.has_branch_access(branch_id));

-- invoice_items inherit their parent invoice's branch.
CREATE POLICY invoice_items_select ON public.invoice_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
      AND public.has_branch_access(i.branch_id)
  ));

-- --------------------------------------------------------------------------
-- Realtime publication. Only the tables whose changes the dashboards react to
-- (PRD §41); every subscriber is still filtered by the SELECT policies above.
-- --------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE
      public.seats,
      public.seat_allocations,
      public.attendance,
      public.invoices,
      public.payments,
      public.fee_schedules;
  END IF;
END;
$$;

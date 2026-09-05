-- 0009 — Audit log and per-branch document number sequences.

CREATE TABLE public.audit_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id    uuid REFERENCES public.branches (id) ON DELETE SET NULL,
  user_id      uuid REFERENCES public.users (id) ON DELETE SET NULL,
  action       text NOT NULL,
  entity_type  text NOT NULL,
  entity_id    uuid,
  metadata     jsonb,
  ip_address   inet,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_branch  ON public.audit_logs (branch_id);
CREATE INDEX idx_audit_logs_user    ON public.audit_logs (user_id);
CREATE INDEX idx_audit_logs_entity  ON public.audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_logs_created ON public.audit_logs (created_at DESC);

COMMENT ON COLUMN public.audit_logs.metadata IS
  'Business context only. Never store passwords, tokens or API keys here.';

-- --------------------------------------------------------------------------
-- Human-readable document numbers, unique per branch and year:
--   ADM-MLB-2026-000123
--   INV-MLB-2026-000123
-- The counter row is locked for the rest of the calling transaction, so
-- numbers never collide under concurrency.
-- --------------------------------------------------------------------------
CREATE TABLE public.document_sequences (
  branch_id    uuid NOT NULL REFERENCES public.branches (id) ON DELETE CASCADE,
  doc_type     text NOT NULL,
  year         integer NOT NULL,
  last_number  integer NOT NULL DEFAULT 0,
  PRIMARY KEY (branch_id, doc_type, year),
  CONSTRAINT document_sequences_type
    CHECK (doc_type IN ('ADMISSION', 'INVOICE', 'STUDENT'))
);

CREATE OR REPLACE FUNCTION public.next_document_number(
  p_branch_id uuid,
  p_doc_type  text,
  p_prefix    text
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_year        integer := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
  v_next        integer;
  v_branch_code text;
BEGIN
  SELECT branch_code INTO v_branch_code
  FROM public.branches
  WHERE id = p_branch_id;

  IF v_branch_code IS NULL THEN
    RAISE EXCEPTION 'Unknown branch %', p_branch_id USING ERRCODE = 'foreign_key_violation';
  END IF;

  INSERT INTO public.document_sequences (branch_id, doc_type, year, last_number)
  VALUES (p_branch_id, p_doc_type, v_year, 1)
  ON CONFLICT (branch_id, doc_type, year)
  DO UPDATE SET last_number = public.document_sequences.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN format('%s-%s-%s-%s',
                p_prefix,
                upper(v_branch_code::text),
                v_year,
                lpad(v_next::text, 6, '0'));
END;
$$;

COMMENT ON FUNCTION public.next_document_number(uuid, text, text) IS
  'Call inside the same transaction as the row being numbered so a rollback releases the number.';

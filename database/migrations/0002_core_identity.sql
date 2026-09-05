-- 0002 — Branches, roles, application users and branch assignments.
--
-- Identity is owned by Supabase Auth (auth.users). public.users is the
-- application profile: role, status and branch assignments. The Node API is
-- the only writer.

CREATE TABLE public.branches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_code   citext NOT NULL UNIQUE,
  name          text NOT NULL,
  address       text,
  city          text,
  state         text,
  phone         text,
  email         citext,
  opening_time  time,
  closing_time  time,
  status        branch_status NOT NULL DEFAULT 'ACTIVE',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT branches_code_format CHECK (branch_code ~ '^[A-Za-z0-9_-]{2,20}$'),
  CONSTRAINT branches_name_not_blank CHECK (length(btrim(name)) > 0)
);

CREATE INDEX idx_branches_status ON public.branches (status);

CREATE TRIGGER trg_branches_updated_at
  BEFORE UPDATE ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Role lookup table (PRD §33). The enum drives type safety; this table exists
-- so roles are describable/queryable and can carry future metadata.
CREATE TABLE public.roles (
  code        user_role PRIMARY KEY,
  name        text NOT NULL,
  description text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.roles (code, name, description) VALUES
  ('SUPER_ADMIN',  'Super Admin',  'Franchise-wide access across every branch.'),
  ('BRANCH_ADMIN', 'Branch Admin', 'Full management of assigned branches only.'),
  ('STAFF',        'Staff',        'Day-to-day operations within assigned branches.');

CREATE TABLE public.users (
  id            uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email         citext NOT NULL UNIQUE,
  full_name     text NOT NULL,
  phone         text,
  role          user_role NOT NULL REFERENCES public.roles (code),
  status        user_status NOT NULL DEFAULT 'ACTIVE',
  created_by    uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_full_name_not_blank CHECK (length(btrim(full_name)) > 0)
);

CREATE INDEX idx_users_role   ON public.users (role);
CREATE INDEX idx_users_status ON public.users (status);

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Branch authorisation. A SUPER_ADMIN needs no rows here (implicitly all
-- branches); every other role is limited to the branches listed.
CREATE TABLE public.user_branches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  branch_id   uuid NOT NULL REFERENCES public.branches (id) ON DELETE CASCADE,
  is_primary  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, branch_id)
);

CREATE INDEX idx_user_branches_user   ON public.user_branches (user_id);
CREATE INDEX idx_user_branches_branch ON public.user_branches (branch_id);

-- At most one primary branch per user.
CREATE UNIQUE INDEX uq_user_branches_primary
  ON public.user_branches (user_id)
  WHERE is_primary;

-- --------------------------------------------------------------------------
-- Authorisation helpers. Used by RLS policies (migration 0010) so the browser
-- session can read its own branches directly for Realtime subscriptions.
-- SECURITY DEFINER + a locked-down search_path so policies cannot recurse.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_role_code()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT u.role
  FROM public.users u
  WHERE u.id = auth.uid() AND u.status = 'ACTIVE';
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(public.current_role_code() = 'SUPER_ADMIN', false);
$$;

CREATE OR REPLACE FUNCTION public.has_branch_access(target_branch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_super_admin()
     OR EXISTS (
       SELECT 1
       FROM public.user_branches ub
       JOIN public.users u ON u.id = ub.user_id
       WHERE ub.user_id = auth.uid()
         AND ub.branch_id = target_branch_id
         AND u.status = 'ACTIVE'
     );
$$;

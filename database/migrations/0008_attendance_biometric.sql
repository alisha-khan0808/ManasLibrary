-- 0008 — Attendance, biometric devices and biometric user mapping.

CREATE TABLE public.biometric_devices (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id          uuid NOT NULL REFERENCES public.branches (id) ON DELETE RESTRICT,
  name               text NOT NULL,
  device_identifier  citext NOT NULL UNIQUE,
  ip_address         inet,
  api_endpoint       text,
  status             device_status NOT NULL DEFAULT 'ACTIVE',
  last_sync_at       timestamptz,
  last_error         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_biometric_devices_id_branch UNIQUE (id, branch_id)
);

CREATE INDEX idx_biometric_devices_branch ON public.biometric_devices (branch_id);

CREATE TRIGGER trg_biometric_devices_updated_at
  BEFORE UPDATE ON public.biometric_devices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Maps a device-local user id to a student. The composite FKs guarantee the
-- device, the student and the mapping all belong to the same branch (PRD §26).
CREATE TABLE public.biometric_mappings (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id          uuid NOT NULL REFERENCES public.branches (id) ON DELETE RESTRICT,
  device_id          uuid NOT NULL,
  biometric_user_id  text NOT NULL,
  student_id         uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fk_biometric_mappings_device
    FOREIGN KEY (device_id, branch_id)
    REFERENCES public.biometric_devices (id, branch_id) ON DELETE CASCADE,
  CONSTRAINT fk_biometric_mappings_student
    FOREIGN KEY (student_id, branch_id)
    REFERENCES public.students (id, branch_id) ON DELETE RESTRICT,

  CONSTRAINT uq_biometric_mappings_device_user UNIQUE (device_id, biometric_user_id),
  CONSTRAINT uq_biometric_mappings_device_student UNIQUE (device_id, student_id)
);

CREATE INDEX idx_biometric_mappings_branch  ON public.biometric_mappings (branch_id);
CREATE INDEX idx_biometric_mappings_student ON public.biometric_mappings (student_id);

CREATE TRIGGER trg_biometric_mappings_updated_at
  BEFORE UPDATE ON public.biometric_mappings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- Attendance
-- --------------------------------------------------------------------------
CREATE TABLE public.attendance (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id            uuid NOT NULL REFERENCES public.branches (id) ON DELETE RESTRICT,
  student_id           uuid NOT NULL,
  batch_id             uuid,
  attendance_date      date NOT NULL,
  check_in_time        timestamptz,
  check_out_time       timestamptz,
  status               attendance_status NOT NULL DEFAULT 'PRESENT',
  source               attendance_source NOT NULL DEFAULT 'MANUAL',
  device_id            uuid,
  biometric_record_id  text,
  notes                text,
  recorded_by          uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fk_attendance_student
    FOREIGN KEY (student_id, branch_id)
    REFERENCES public.students (id, branch_id) ON DELETE RESTRICT,
  CONSTRAINT fk_attendance_batch
    FOREIGN KEY (batch_id, branch_id)
    REFERENCES public.batches (id, branch_id) ON DELETE RESTRICT,
  CONSTRAINT fk_attendance_device
    FOREIGN KEY (device_id, branch_id)
    REFERENCES public.biometric_devices (id, branch_id) ON DELETE SET NULL,

  CONSTRAINT attendance_time_order
    CHECK (check_out_time IS NULL OR check_in_time IS NULL OR check_out_time >= check_in_time),
  CONSTRAINT attendance_biometric_has_device
    CHECK (source <> 'BIOMETRIC' OR device_id IS NOT NULL)
);

-- Deduplication (PRD §27), two independent layers:
--   1. one attendance row per student per day, whatever the source;
--   2. a device's record id can only ever be ingested once.
CREATE UNIQUE INDEX uq_attendance_student_day
  ON public.attendance (student_id, attendance_date);

CREATE UNIQUE INDEX uq_attendance_biometric_record
  ON public.attendance (device_id, biometric_record_id)
  WHERE biometric_record_id IS NOT NULL;

CREATE INDEX idx_attendance_branch   ON public.attendance (branch_id);
CREATE INDEX idx_attendance_student  ON public.attendance (student_id);
CREATE INDEX idx_attendance_date     ON public.attendance (attendance_date);
CREATE INDEX idx_attendance_batch    ON public.attendance (batch_id);
CREATE INDEX idx_attendance_branch_date ON public.attendance (branch_id, attendance_date);

CREATE TRIGGER trg_attendance_updated_at
  BEFORE UPDATE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Raw device events, kept before mapping so an unmapped punch is never lost
-- and a re-sync of the same window is a no-op.
CREATE TABLE public.biometric_events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id            uuid NOT NULL REFERENCES public.branches (id) ON DELETE RESTRICT,
  device_id            uuid NOT NULL,
  biometric_record_id  text NOT NULL,
  biometric_user_id    text NOT NULL,
  event_time           timestamptz NOT NULL,
  direction            text,
  processed            boolean NOT NULL DEFAULT false,
  student_id           uuid,
  attendance_id        uuid REFERENCES public.attendance (id) ON DELETE SET NULL,
  error_message        text,
  raw_payload          jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fk_biometric_events_device
    FOREIGN KEY (device_id, branch_id)
    REFERENCES public.biometric_devices (id, branch_id) ON DELETE CASCADE,
  CONSTRAINT uq_biometric_events_record UNIQUE (device_id, biometric_record_id),
  CONSTRAINT biometric_events_direction
    CHECK (direction IS NULL OR direction IN ('IN', 'OUT'))
);

CREATE INDEX idx_biometric_events_unprocessed
  ON public.biometric_events (device_id, event_time)
  WHERE NOT processed;

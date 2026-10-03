CREATE TABLE IF NOT EXISTS public.rcy_editor_access_requests (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by text
);

ALTER TABLE public.rcy_editor_access_requests ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS rcy_editor_access_status_created_idx
  ON public.rcy_editor_access_requests (status, created_at);

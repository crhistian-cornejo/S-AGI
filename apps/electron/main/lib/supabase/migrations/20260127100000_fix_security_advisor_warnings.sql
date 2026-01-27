-- Migration: Fix Security Advisor warnings (7 of 8)
-- 1. Function Search Path Mutable (6 functions): set explicit search_path
-- 2. RLS Policy Always True (batch_jobs): restrict to service_role-only access
--    (anon/auth get no access; service_role bypasses RLS)
--
-- 8. Leaked Password Protection: enable in Dashboard (not SQL).
--    Authentication > Providers > Email > "Enable Leaked Password Protection"
--    https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

-- =============================================================================
-- 1. Functions: SET search_path = public (fixes function_search_path_mutable)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_panel_messages_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_user_files_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_next_file_version(p_file_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  next_version INTEGER;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO next_version
  FROM public.file_versions
  WHERE file_id = p_file_id;
  RETURN next_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_old_file_versions(
  p_file_id UUID,
  p_keep_count INTEGER DEFAULT 100
)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH versions_to_delete AS (
    SELECT id
    FROM public.file_versions
    WHERE file_id = p_file_id
    ORDER BY version_number DESC
    OFFSET p_keep_count
  )
  DELETE FROM public.file_versions
  WHERE id IN (SELECT id FROM versions_to_delete);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_commit_chain(p_commit_id UUID)
RETURNS TABLE (
  version_number INTEGER,
  change_type TEXT,
  change_description TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    fv.version_number,
    fv.change_type,
    fv.change_description,
    fv.created_at
  FROM public.file_versions fv
  WHERE fv.commit_id = p_commit_id
  ORDER BY fv.version_number ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_version_diff(
  p_file_id UUID,
  p_version_a INTEGER,
  p_version_b INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_version_a JSONB;
  v_version_b JSONB;
BEGIN
  SELECT univer_data INTO v_version_a
  FROM public.file_versions
  WHERE file_id = p_file_id AND version_number = p_version_a;

  SELECT univer_data INTO v_version_b
  FROM public.file_versions
  WHERE file_id = p_file_id AND version_number = p_version_b;

  RETURN jsonb_build_object(
    'version_a', v_version_a,
    'version_b', v_version_b,
    'version_a_number', p_version_a,
    'version_b_number', p_version_b
  );
END;
$$;

-- =============================================================================
-- 2. batch_jobs RLS: replace permissive policy (fixes rls_policy_always_true)
--    Service role bypasses RLS → full access. Anon/auth must have no policy
--    match → use USING(false)/WITH CHECK(false) so they get no access.
-- =============================================================================

DROP POLICY IF EXISTS "Service role can manage batch jobs" ON public.batch_jobs;

CREATE POLICY "Service role can manage batch jobs" ON public.batch_jobs
  FOR ALL
  USING (false)
  WITH CHECK (false);

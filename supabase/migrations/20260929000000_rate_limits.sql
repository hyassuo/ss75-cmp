-- =============================================================================
-- Shared rate limits (backlog C4)
-- =============================================================================
-- The API routes used to count requests in each serverless instance's
-- memory, so on Vercel a client spread over several instances was barely
-- limited. The counters now live here, shared by every instance, and are
-- reachable only with the service-role key (the routes call
-- rate_limit_hit through lib/utils/rateLimit.ts).
--
-- Fixed windows: a key's window starts at its first hit and lasts
-- p_window_seconds; hits inside it are counted, and the caller is refused
-- once the count passes p_limit. Refused hits still count, so hammering a
-- closed window keeps it closed until it expires.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.rate_limits (
  key          text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  count        integer NOT NULL
);
-- For the periodic cleanup in rate_limit_hit.
CREATE INDEX IF NOT EXISTS rate_limits_window_start_idx
  ON public.rate_limits (window_start);
-- Not an API table: RLS on with no policies, and no grants.
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limits FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.rate_limit_hit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS TABLE (allowed boolean, retry_after integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_window interval := make_interval(secs => p_window_seconds);
  v_count  integer;
  v_start  timestamptz;
BEGIN
  IF p_key IS NULL OR p_limit IS NULL OR p_limit < 1
     OR p_window_seconds IS NULL OR p_window_seconds < 1 THEN
    RAISE EXCEPTION 'rate_limit_hit: invalid arguments';
  END IF;

  -- One statement, so concurrent hits on the same key serialize on the row.
  INSERT INTO public.rate_limits AS r (key, window_start, count)
  VALUES (p_key, now(), 1)
  ON CONFLICT (key) DO UPDATE SET
    window_start = CASE WHEN r.window_start + v_window <= now()
                        THEN now() ELSE r.window_start END,
    count        = CASE WHEN r.window_start + v_window <= now()
                        THEN 1 ELSE r.count + 1 END
  RETURNING r.count, r.window_start INTO v_count, v_start;

  -- Now and then, drop windows that ended long ago (keys include dates and
  -- client addresses, so the table would otherwise only grow). In small
  -- batches, skipping rows another request holds: two cleanups can't
  -- deadlock, and no request waits behind one.
  IF random() < 0.01 THEN
    DELETE FROM public.rate_limits
    WHERE key IN (
      SELECT key FROM public.rate_limits
      WHERE window_start < now() - interval '2 days'
      LIMIT 500
      FOR UPDATE SKIP LOCKED
    );
  END IF;

  allowed := v_count <= p_limit;
  retry_after := CASE WHEN allowed THEN 0
                 ELSE greatest(1, ceil(extract(epoch FROM v_start + v_window - now()))::integer)
                 END;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.rate_limit_hit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_hit(text, integer, integer) TO service_role;

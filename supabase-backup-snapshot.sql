-- =============================================================================
-- SS-75 CMP — DATA SNAPSHOT (run in Supabase SQL Editor, download the result)
-- =============================================================================
-- Read-only. Dumps the 7 application tables as ONE json document. Run it in
-- the SQL Editor and use "Download results" (JSON/CSV) to save the backup
-- locally BEFORE applying a schema migration (e.g. supabase-schema-v140.sql).
--
-- Not included:
--   - public.ifs_objects  — re-seedable from supabase-ifs-data.sql
--   - Storage bucket 'evidence-photos' — files are not reachable from SQL;
--     evidences.file_path below preserves every object's path. (Schema
--     migrations never touch Storage.)
-- =============================================================================

SELECT json_build_object(
  'generated_at', now(),
  'schema_version', 'pre-v140',
  'units',     (SELECT coalesce(json_agg(t ORDER BY t.created_at), '[]'::json) FROM public.units t),
  'profiles',  (SELECT coalesce(json_agg(t ORDER BY t.created_at), '[]'::json) FROM public.profiles t),
  'zones',     (SELECT coalesce(json_agg(t ORDER BY t.display_order), '[]'::json) FROM public.zones t),
  'items',     (SELECT coalesce(json_agg(t ORDER BY t.created_at), '[]'::json) FROM public.items t),
  'readings',  (SELECT coalesce(json_agg(t ORDER BY t.created_at), '[]'::json) FROM public.readings t),
  'evidences', (SELECT coalesce(json_agg(t ORDER BY t.created_at), '[]'::json) FROM public.evidences t),
  'history',   (SELECT coalesce(json_agg(t ORDER BY t.event_date), '[]'::json) FROM public.history t)
) AS backup;

-- Stand-in for a database older than security round 5, for the upgrade
-- chain in run.sh. The pre-round-5 upgrade files (security-fixes,
-- hardening, hardening-3/4, schema-v130/140) refuse to run once round 5's
-- is_pristine_draft() exists; dropping it (and the two policies that use
-- it) lets the chain run them again, and hardening-5.sql puts all three
-- back.
DROP FUNCTION IF EXISTS public.is_pristine_draft(uuid) CASCADE;

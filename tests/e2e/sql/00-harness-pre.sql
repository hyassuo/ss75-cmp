-- Harness additions loaded right after tests/sql/supabase-stub.sql and before
-- the app schema. Makes the stub look enough like a hosted Supabase project
-- for PostgREST v12 + the fake GoTrue/Storage gateway.

-- PostgREST v12 exposes the JWT as request.jwt.claims (JSON); the stub only
-- reads the legacy request.jwt.claim.sub. Accept both (as Supabase does).
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )
$$;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role() TO anon, authenticated, service_role;

-- PostgREST connects as a NOINHERIT login role that switches into the JWT role.
DO $$ BEGIN
  CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD 'authenticator';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT anon, authenticated, service_role TO authenticator;

-- auth.users: columns the fake GoTrue returns / keeps. encrypted_password
-- NULL = the shared test password ($E2E_PASSWORD); banned_until as in GoTrue.
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS encrypted_password text;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS banned_until timestamptz;

-- storage.objects: the columns Supabase Storage keeps (the stub only has
-- id/bucket_id/name/owner). Unique like the real table.
ALTER TABLE storage.objects ADD COLUMN IF NOT EXISTS owner_id text;
ALTER TABLE storage.objects ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE storage.objects ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE storage.objects ADD COLUMN IF NOT EXISTS last_accessed_at timestamptz DEFAULT now();
ALTER TABLE storage.objects ADD COLUMN IF NOT EXISTS metadata jsonb;
ALTER TABLE storage.objects ADD COLUMN IF NOT EXISTS version text;
CREATE UNIQUE INDEX IF NOT EXISTS objects_bucket_name_uq ON storage.objects (bucket_id, name);

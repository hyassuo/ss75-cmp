#!/usr/bin/env bash
# Full backup: database + evidence photos, packed and encrypted with age.
# Nothing unencrypted is written outside a private temp dir, and the
# output file only appears once it is complete.
#
# Contents of the archive:
#   data.sql        data only (public schema + auth.users/identities), with
#                   session_replication_role = replica so a restore neither
#                   fires the audit/authorship triggers nor duplicates
#                   history — the restore path (README "Backups")
#   database.dump   full custom-format dump of public/auth/storage (schema,
#                   data, privileges) — forensic copy, pg_restore -l to browse
#   storage/        every file of the evidence-photos bucket
#
# Env:
#   SUPABASE_DB_URL            postgres URL of the *session pooler*
#                              (Supabase → Connect → Session pooler; the
#                              direct db.<ref> host is IPv6-only)
#   SUPABASE_URL               https://<ref>.supabase.co
#   SUPABASE_SERVICE_ROLE_KEY  service-role key (storage download)
#   BACKUP_AGE_RECIPIENT       age public key (age1…) — keep the private key
#                              offline; it is the only way to restore.
#   PG_DUMP                    pg_dump binary, ≥ the server's major version
#                              (default: pg_dump on PATH)
# Usage: scripts/backup.sh <output-dir>
set -euo pipefail
out="${1:?output dir}"
: "${SUPABASE_DB_URL:?}" "${SUPABASE_URL:?}" "${SUPABASE_SERVICE_ROLE_KEY:?}" "${BACKUP_AGE_RECIPIENT:?}"
PG_DUMP="${PG_DUMP:-pg_dump}"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
work="$(mktemp -d)"
chmod 700 "$work"
trap 'rm -rf "$work"' EXIT
name="ss75-backup-$stamp"
dir="$work/$name"
mkdir -p "$dir" "$out"

{
  echo "-- SS-75 CMP data backup $stamp. Restore into a NEW/EMPTY project that"
  echo "-- already has the schema (supabase db push): psql \"\$URL\" -f data.sql"
  echo "\\set ON_ERROR_STOP on"
  echo "DO \$\$ BEGIN"
  echo "  IF EXISTS (SELECT 1 FROM public.items) THEN"
  echo "    RAISE EXCEPTION 'restore target already has items - use a new or emptied project';"
  echo "  END IF;"
  echo "END \$\$;"
  echo "BEGIN;"
  # Created by supabase/seed/demo.sql, not by the migrations: a project
  # that ever loaded the demo has rows in it.
  echo "CREATE TABLE IF NOT EXISTS public.demo_seed_items (id uuid PRIMARY KEY);"
  echo "ALTER TABLE public.demo_seed_items ENABLE ROW LEVEL SECURITY;"
  echo "REVOKE ALL ON public.demo_seed_items FROM anon, authenticated;"
  echo "SET LOCAL session_replication_role = replica;"
  # The migrations seed the unit, the zone catalog and (via config) the IFS
  # register with their own ids; the backup's rows replace them.
  echo "TRUNCATE public.units, public.zones, public.ifs_objects CASCADE;"
  "$PG_DUMP" "$SUPABASE_DB_URL" --data-only --no-owner --schema=public
  "$PG_DUMP" "$SUPABASE_DB_URL" --data-only --no-owner \
    --table=auth.users --table=auth.identities
  echo "COMMIT;"
} > "$dir/data.sql"

"$PG_DUMP" "$SUPABASE_DB_URL" --format=custom --no-owner \
  --schema=public --schema=auth --schema=storage \
  --file="$dir/database.dump"

node "$(dirname "$0")/backup-storage.mjs" "$dir/storage"

tar -C "$work" -czf - "$name" \
  | age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" \
  > "$out/$name.tar.gz.age.part"
mv "$out/$name.tar.gz.age.part" "$out/$name.tar.gz.age"
echo "backup: $out/$name.tar.gz.age"

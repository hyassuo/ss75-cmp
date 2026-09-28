#!/usr/bin/env bash
# Full backup: database (pg_dump, custom format) + evidence photos, packed
# and encrypted with age. Nothing is ever written unencrypted to the output.
#
# Env:
#   SUPABASE_DB_URL            postgres://… (Supabase → Project Settings →
#                              Database → connection string, session mode)
#   SUPABASE_URL               https://<ref>.supabase.co
#   SUPABASE_SERVICE_ROLE_KEY  service-role key (storage download)
#   BACKUP_AGE_RECIPIENT       age public key (age1…) — keep the private key
#                              offline; it is the only way to restore.
# Usage: scripts/backup.sh <output-dir>
set -euo pipefail
out="${1:?output dir}"
: "${SUPABASE_DB_URL:?}" "${SUPABASE_URL:?}" "${SUPABASE_SERVICE_ROLE_KEY:?}" "${BACKUP_AGE_RECIPIENT:?}"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/ss75-backup-$stamp" "$out"
dir="$work/ss75-backup-$stamp"

# App data + the auth users its profiles reference + storage metadata.
pg_dump "$SUPABASE_DB_URL" --format=custom --no-owner --no-privileges \
  --schema=public --schema=auth --schema=storage \
  --file="$dir/database.dump"
node "$(dirname "$0")/backup-storage.mjs" "$dir/storage"

tar -C "$work" -czf - "ss75-backup-$stamp" \
  | age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" \
  > "$out/ss75-backup-$stamp.tar.gz.age"
echo "backup: $out/ss75-backup-$stamp.tar.gz.age"

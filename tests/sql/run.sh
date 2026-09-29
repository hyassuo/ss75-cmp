#!/usr/bin/env bash
# RLS / trigger regression tests for the Supabase schema.
#
# Spins up a throwaway PostgreSQL cluster (needs the server binaries, e.g.
# `apt install postgresql`), loads a minimal Supabase stand-in
# (supabase-stub.sql), applies the schema files and then acts as each role
# the way PostgREST would (SET ROLE authenticated + JWT sub claim).
#
# Scenarios:
#   fresh    every file in supabase/migrations/, in order (run twice: idempotency)
#   upgrade  fresh install, then every in-place upgrade file in README order,
#            ending with the latest hardening round
#
# Usage: tests/sql/run.sh            (from the repo root or anywhere)
# Env:   PG_BIN       directory with initdb/pg_ctl (auto-detected)
#        SQL_TEST_DIR parent directory for the throwaway cluster (default: $TMPDIR)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HERE="$ROOT/tests/sql"
PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
[ -x "$PG_BIN/initdb" ] || { echo "initdb not found (set PG_BIN)"; exit 2; }

BASE="${SQL_TEST_DIR:-${TMPDIR:-/tmp}}"
WORK="$(mktemp -d "$BASE/ss75-sqltest.XXXXXX")"
PORT="${SQL_TEST_PORT:-54329}"
RUN_AS=()
if [ "$(id -u)" = 0 ]; then
  # initdb refuses to run as root.
  chown -R postgres "$WORK"
  RUN_AS=(su postgres -c)
fi
pgrun() {
  if [ ${#RUN_AS[@]} -gt 0 ]; then "${RUN_AS[@]}" "$*"; else bash -c "$*"; fi
}

pgrun "'$PG_BIN/initdb' -D '$WORK/data' -A trust -U postgres >/dev/null"
pgrun "'$PG_BIN/pg_ctl' -D '$WORK/data' -o \"-p $PORT -k '$WORK' -c listen_addresses=''\" -l '$WORK/log' -w start >/dev/null"
cleanup() {
  pgrun "'$PG_BIN/pg_ctl' -D '$WORK/data' -m immediate stop >/dev/null" || true
  rm -rf "$WORK"
}
trap cleanup EXIT

PSQL=(psql -h "$WORK" -p "$PORT" -U postgres -X -q -v ON_ERROR_STOP=1)
DB=""
FAILS=0
PASSES=0

load() { "${PSQL[@]}" -d "$DB" -f "$1" >/dev/null 2>"$WORK/load.err" || { cat "$WORK/load.err"; exit 1; }; }
su_sql() { "${PSQL[@]}" -d "$DB" -At -c "$1" 2>&1 | tail -1; }
# as <uid> <sql>: run as the authenticated API role with that JWT subject.
as() {
  "${PSQL[@]}" -d "$DB" -At \
    -c "SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '$1', false);" \
    -c "$2" 2>&1 | tail -n +2 | grep -v '^$' | head -1 | sed 's/^ERROR: *//'
}
# rows <uid> <DML ... RETURNING 1>: number of rows the statement touched.
rows() { as "$1" "WITH x AS ($2) SELECT count(*) FROM x"; }
check() { # check <description> <actual> <expected (grep -E)>
  if printf '%s' "$2" | grep -Eq -- "^($3)\$"; then
    PASSES=$((PASSES + 1)); printf '  ok   %s\n' "$1"
  else
    FAILS=$((FAILS + 1)); printf '  FAIL %s\n       got: %s\n       expected: %s\n' "$1" "$2" "$3"
  fi
}

A1=00000000-0000-0000-0000-00000000a001; A2=00000000-0000-0000-0000-00000000a002
I1=00000000-0000-0000-0000-00000000c001; I2=00000000-0000-0000-0000-00000000c002
V1=00000000-0000-0000-0000-00000000e001; AB=00000000-0000-0000-0000-00000000b001
DENIED='permission denied.*|new row violates row-level security.*'

suite() {
  local U1; U1=$(su_sql "SELECT id FROM units WHERE code = 'SS-75'")
  new_item() { as "$1" "INSERT INTO items (unit_id, zone_id, name) VALUES ('$U1', 'Z01', '$2') RETURNING id"; }

  echo " authorship & deletion"
  local IT; IT=$(new_item $I2 'Pump P-101')
  as $I2 "UPDATE items SET status = 'Critical' WHERE id = '$IT' RETURNING 1" >/dev/null
  as $I1 "UPDATE items SET created_by = '$I1', created_at = now() - interval '1 year', unit_id = unit_id WHERE id = '$IT' RETURNING 1" >/dev/null
  check "created_by is immutable on update" "$(su_sql "SELECT created_by FROM items WHERE id = '$IT'")" "$I2"
  check "created_at is immutable on update" "$(su_sql "SELECT created_at > now() - interval '1 day' FROM items WHERE id = '$IT'")" "t"
  check "inspector cannot delete a colleague's item" "$(rows $I1 "DELETE FROM items WHERE id = '$IT' RETURNING 1")" "0"
  check "creator cannot delete own named item" "$(rows $I2 "DELETE FROM items WHERE id = '$IT' RETURNING 1")" "0"
  check "viewer cannot update items" "$(rows $V1 "UPDATE items SET notes = 'x' WHERE id = '$IT' RETURNING 1")" "0"
  check "item cannot move to another unit" "$(as $A1 "UPDATE items SET unit_id = '00000000-0000-0000-0000-0000000000b2' WHERE id = '$IT' RETURNING unit_id")" "$U1|$DENIED"

  local F; F=$(as $I1 "INSERT INTO items (unit_id, zone_id, name, created_at, updated_at) VALUES ('$U1', 'Z01', 'Forged', '2099-01-01', '2099-01-01') RETURNING id")
  check "created_at/updated_at are server-set on insert" "$(su_sql "SELECT created_at > now() - interval '1 minute' AND updated_at > now() - interval '1 minute' FROM items WHERE id = '$F'")" "t"
  check "created_at cannot be nulled on insert" "$(as $I1 "INSERT INTO items (unit_id, zone_id, name, created_at) VALUES ('$U1', 'Z01', 'Null ts', NULL) RETURNING created_at IS NOT NULL")" "t"
  check "reading created_at is server-set" "$(as $I1 "INSERT INTO readings (item_id, reading_date, depth_mm, created_at) VALUES ('$F', current_date, 0.1, '2001-01-01') RETURNING created_at > now() - interval '1 minute'")" "t"

  local D; D=$(new_item $I1 'Untitled')
  check "creator can discard a pristine draft" "$(rows $I1 "DELETE FROM items WHERE id = '$D' RETURNING 1")" "1"
  check "discarded pristine draft leaves no audit noise" "$(su_sql "SELECT count(*) FROM history WHERE item_ref = '$D' OR item_id = '$D'")" "0"

  local DP; DP=$(new_item $I1 'Untitled')
  as $I1 "INSERT INTO readings (item_id, reading_date, depth_mm) VALUES ('$DP', current_date, 0.4) RETURNING 1" >/dev/null
  check "creator can cancel a draft that has a reading" "$(rows $I1 "DELETE FROM items WHERE id = '$DP' RETURNING 1")" "1"
  check "...and that deletion is logged" "$(su_sql "SELECT note FROM history WHERE item_ref = '$DP' AND action = 'deleted'")" "Item deleted \(1 readings, 0 evidences removed\)"
  local DR; DR=$(new_item $I1 'Untitled')
  local RID; RID=$(as $I1 "INSERT INTO readings (item_id, reading_date, depth_mm) VALUES ('$DR', current_date, 0.2) RETURNING id")
  su_sql "DELETE FROM readings WHERE id = '$RID'" >/dev/null
  check "a draft whose reading was added then removed is still a draft" "$(as $I1 "SELECT public.is_pristine_draft('$DR')")" "t"
  check "...and its creator can cancel it" "$(rows $I1 "DELETE FROM items WHERE id = '$DR' RETURNING 1")" "1"
  check "...keeping the reading's add/remove events and logging the deletion" "$(su_sql "SELECT string_agg(action, ',' ORDER BY action) FROM history WHERE item_ref = '$DR'")" "created,deleted,reading_added,reading_deleted"

  local OLD; OLD=$(new_item $I1 'Untitled')
  su_sql "UPDATE items SET created_at = now() - interval '30 days' WHERE id = '$OLD'" >/dev/null
  check "abandoned draft older than 24h is still discardable" "$(rows $I1 "DELETE FROM items WHERE id = '$OLD' RETURNING 1")" "1"

  local ATK; ATK=$(as $I1 "INSERT INTO items (unit_id, zone_id, name, status, prob, cons, priority, sece) VALUES ('$U1', 'Z07', 'Crane slew ring', 'Critical', 5, 5, 'Critical', true) RETURNING id")
  as $I1 "INSERT INTO readings (item_id, reading_date, depth_mm) VALUES ('$ATK', current_date, 4.1) RETURNING 1" >/dev/null
  as $I1 "UPDATE items SET name = 'Untitled' WHERE id = '$ATK' RETURNING 1" >/dev/null
  check "rename is audited" "$(su_sql "SELECT prev_value || '>' || new_value FROM history WHERE item_ref = '$ATK' AND action = 'renamed'")" "Crane slew ring>Untitled"
  check "real item renamed to Untitled is not deletable by creator" "$(rows $I1 "DELETE FROM items WHERE id = '$ATK' RETURNING 1")" "0"
  local ATK2; ATK2=$(as $I1 "INSERT INTO items (unit_id, zone_id, name, status, prob, cons) VALUES ('$U1', 'Z07', 'Untitled', 'Critical', 5, 5) RETURNING id")
  check "Untitled item created with content is not a draft" "$(rows $I1 "DELETE FROM items WHERE id = '$ATK2' RETURNING 1")" "0"
  check "admin deleting it leaves a trail" "$(rows $A1 "DELETE FROM items WHERE id = '$ATK2' RETURNING 1")/$(su_sql "SELECT count(*) FROM history WHERE item_ref = '$ATK2' AND action = 'deleted'")" "1/1"

  echo " audit trail"
  local R; R=$(new_item $I1 'Riser clamp')
  as $I1 "UPDATE items SET status = 'Attention' WHERE id = '$R' RETURNING 1" >/dev/null
  as $I1 "INSERT INTO readings (item_id, reading_date, depth_mm) VALUES ('$R', current_date, 0.4) RETURNING 1" >/dev/null
  check "adding a reading is audited, attributed" "$(su_sql "SELECT count(*) FROM history WHERE item_id = '$R' AND action = 'reading_added' AND new_value = '0.400' AND by_user = '$I1' AND by_user_email = 'insp1@test'")" "1"
  check "admin can delete a real item" "$(rows $A1 "DELETE FROM items WHERE id = '$R' RETURNING 1")" "1"
  check "history survives deletion" "$(su_sql "SELECT string_agg(action, ',' ORDER BY action) FROM history WHERE item_ref = '$R'")" "created,deleted,reading_added,status_changed"
  check "deletion event records what went with it" "$(su_sql "SELECT note FROM history WHERE item_ref = '$R' AND action = 'deleted'")" "Item deleted \(1 readings, 0 evidences removed\)"
  check "deletion event keeps item name" "$(su_sql "SELECT item_name FROM history WHERE item_ref = '$R' AND action = 'deleted'")" "Riser clamp"
  check "deleted item's history visible to its unit" "$(as $I2 "SELECT count(*) FROM history WHERE item_ref = '$R'")" "4"
  check "deleted item's history hidden from other units" "$(as $AB "SELECT count(*) FROM history WHERE item_ref = '$R'")" "0"
  check "history is append-only (delete)" "$(as $A1 "DELETE FROM history WHERE item_ref = '$R'")" "$DENIED"
  check "history is append-only (update)" "$(as $A1 "UPDATE history SET note = 'x' WHERE item_ref = '$R'")" "$DENIED"
  check "history is append-only (insert)" "$(as $A1 "INSERT INTO history (item_id, action) VALUES (NULL, 'forged')")" "$DENIED"

  local X; X=$(new_item $I1 'Deck plate')
  as $I1 "UPDATE items SET status = 'Attention' WHERE id = '$X' RETURNING 1" >/dev/null
  as $I1 "UPDATE items SET name = 'Untitled' WHERE id = '$X' RETURNING 1" >/dev/null
  check "renamed-to-Untitled item is not deletable by creator" "$(rows $I1 "DELETE FROM items WHERE id = '$X' RETURNING 1")" "0"
  as $I1 "UPDATE items SET zone_id = 'Z05', notes = 'moved' WHERE id = '$X' RETURNING 1" >/dev/null
  check "zone and notes changes are audited" "$(su_sql "SELECT string_agg(action, ',' ORDER BY action) FROM history WHERE item_ref = '$X' AND action IN ('zone_changed', 'notes_changed')")" "notes_changed,zone_changed"

  echo " profiles"
  check "admin cannot delete another admin's profile" "$(as $A1 "DELETE FROM profiles WHERE id = '$A2'")" "$DENIED"
  check "admin cannot delete own profile" "$(as $A1 "DELETE FROM profiles WHERE id = '$A1'")" "$DENIED"
  su_sql "INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-00000000d001', 'x@test') ON CONFLICT DO NOTHING" >/dev/null
  local DU; DU=$(new_item $A2 'Temp item')
  local KEEP; KEEP=$(new_item $A2 'Kept item')
  rows $A2 "DELETE FROM items WHERE id = '$DU' RETURNING 1" >/dev/null
  check "a user who authored rows and audit events can still be deleted" "$(su_sql "DELETE FROM auth.users WHERE id = '$A2' RETURNING 'deleted'")" "deleted"
  check "...their items stay, authorship cleared" "$(su_sql "SELECT created_by IS NULL FROM items WHERE id = '$KEEP'")" "t"
  check "...without bumping updated_at (no false edit conflicts)" "$(su_sql "SELECT updated_at = created_at FROM items WHERE id = '$KEEP'")" "t"
  check "...and the trail keeps the email" "$(su_sql "SELECT by_user IS NULL AND by_user_email = 'admin2@test' FROM history WHERE item_ref = '$DU' AND action = 'deleted'")" "t"
  check "new sign-ups start inactive" "$(su_sql "SELECT active FROM profiles WHERE id = '00000000-0000-0000-0000-00000000d001'")" "f"
  local NU=00000000-0000-0000-0000-00000000d001
  check "an inactive account reads no units" "$(as $NU "SELECT count(*) FROM units")" "0"
  check "an inactive account reads no zones" "$(as $NU "SELECT count(*) FROM zones")" "0"
  check "an inactive account reads no IFS objects" "$(as $NU "SELECT count(*) FROM ifs_objects")" "0"
  check "an active user reads units, zones and IFS objects" "$(as $I1 "SELECT (SELECT count(*) FROM units) > 0 AND (SELECT count(*) FROM zones) > 0 AND (SELECT count(*) FROM ifs_objects) > 0")" "t"
  check "no reference table grants reads beyond active users" "$(su_sql "SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('units','zones','ifs_objects') AND cmd IN ('SELECT','ALL') AND qual NOT LIKE '%current_user_role()%'")" "0"
  su_sql "DELETE FROM profiles WHERE id = '00000000-0000-0000-0000-00000000d001'" >/dev/null
  check "admin cannot insert profiles" "$(as $A1 "INSERT INTO profiles (id, email, role, unit_id, active) VALUES ('00000000-0000-0000-0000-00000000d001', 'x@test', 'admin', '$U1', true)")" "$DENIED"
  check "admin lists own unit's profiles" "$(as $A1 "SELECT count(*) FROM profiles")" "4"
  check "inspector sees only self" "$(as $I1 "SELECT count(*) FROM profiles")" "1"
  check "user can edit own full_name" "$(rows $I1 "UPDATE profiles SET full_name = 'Insp One' WHERE id = '$I1' RETURNING 1")" "1"
  check "user cannot escalate own role" "$(as $I1 "UPDATE profiles SET role = 'admin' WHERE id = '$I1'")" "$DENIED"
  check "user cannot reactivate/transfer self" "$(as $I1 "UPDATE profiles SET unit_id = NULL WHERE id = '$I1'")" "$DENIED"

  local N0; N0=$(new_item $I1 'Depth check')
  echo " server-owned ids & folder squatting"
  check "client-chosen item id is ignored" "$(as $I1 "INSERT INTO items (id, unit_id, zone_id, name) VALUES ('00000000-0000-0000-0000-0000000000aa', '$U1', 'Z01', 'Chosen id') RETURNING id <> '00000000-0000-0000-0000-0000000000aa'")" "t"
  local GONE; GONE=$(su_sql "INSERT INTO items (unit_id, zone_id, name) VALUES ('00000000-0000-0000-0000-0000000000b2', 'Z01', 'Other unit, soon deleted') RETURNING id")
  su_sql "INSERT INTO storage.objects (bucket_id, name) VALUES ('evidence-photos', '$GONE/secret-b.jpg')" >/dev/null
  su_sql "DELETE FROM items WHERE id = '$GONE'" >/dev/null
  as $I1 "INSERT INTO items (id, unit_id, zone_id, name) VALUES ('$GONE', '$U1', 'Z01', 'Untitled') RETURNING 1" >/dev/null
  check "cannot re-occupy another unit's deleted item folder" "$(su_sql "SELECT count(*) FROM items WHERE id = '$GONE'")/$(as $I1 "SELECT count(*) FROM storage.objects WHERE name LIKE '$GONE/%'")" "0/0"
  check "this unit's admin cannot see another unit's orphans" "$(as $A1 "SELECT count(*) FROM storage.objects WHERE name LIKE '$GONE/%'")" "0"
  check "the owning unit's admin can" "$(as $AB "SELECT count(*) FROM storage.objects WHERE name LIKE '$GONE/%'")" "1"

  echo " storage (evidence-photos)"
  local UB=00000000-0000-0000-0000-0000000000b2
  local OI; OI=$(su_sql "INSERT INTO items (unit_id, zone_id, name) VALUES ('$UB', 'Z01', 'Other unit item') RETURNING id")
  su_sql "INSERT INTO storage.objects (bucket_id, name) VALUES ('evidence-photos', '$OI/secret.jpg')" >/dev/null
  local SI; SI=$(new_item $I1 'Pipe rack')
  check "inspector uploads into own unit's item folder" "$(rows $I1 "INSERT INTO storage.objects (bucket_id, name) VALUES ('evidence-photos', '$SI/p1.jpg') RETURNING 1")" "1"
  check "inspector reads own unit's photo" "$(as $I2 "SELECT count(*) FROM storage.objects WHERE name = '$SI/p1.jpg'")" "1"
  check "viewer cannot upload" "$(as $V1 "INSERT INTO storage.objects (bucket_id, name) VALUES ('evidence-photos', '$SI/v.jpg')")" "$DENIED"
  check "cannot upload into another unit's item folder" "$(as $I1 "INSERT INTO storage.objects (bucket_id, name) VALUES ('evidence-photos', '$OI/planted.jpg')")" "$DENIED"
  local TRAP=00000000-0000-0000-0000-00000000f00d
  as $I1 "INSERT INTO items (id, unit_id, zone_id, name) VALUES ('$TRAP', '$U1', 'Z01', '$TRAP/x') RETURNING 1" >/dev/null
  check "item named like a folder does not open other units' photos" "$(as $I1 "SELECT count(*) FROM storage.objects WHERE name LIKE '$OI/%'")" "0"
  check "...nor let an admin delete them" "$(rows $A1 "DELETE FROM storage.objects WHERE name LIKE '$OI/%' RETURNING 1")" "0"
  check "inspector cannot delete a real item's photo" "$(rows $I1 "DELETE FROM storage.objects WHERE name = '$SI/p1.jpg' RETURNING 1")" "0"
  local SD; SD=$(new_item $I1 'Untitled')
  as $I1 "INSERT INTO storage.objects (bucket_id, name) VALUES ('evidence-photos', '$SD/d.jpg') RETURNING 1" >/dev/null
  check "creator clears photos of a draft being discarded" "$(rows $I1 "DELETE FROM storage.objects WHERE name = '$SD/d.jpg' RETURNING 1")" "1"
  check "a colleague cannot clear them" "$(as $I1 "INSERT INTO storage.objects (bucket_id, name) VALUES ('evidence-photos', '$SD/d2.jpg') RETURNING 1" >/dev/null; rows $I2 "DELETE FROM storage.objects WHERE name = '$SD/d2.jpg' RETURNING 1")" "0"
  rows $A1 "DELETE FROM items WHERE id = '$SI' RETURNING 1" >/dev/null
  check "other unit's admin cannot clear a deleted item's photos" "$(rows $AB "DELETE FROM storage.objects WHERE name = '$SI/p1.jpg' RETURNING 1")" "0"
  check "admin clears photos a deleted item left behind" "$(rows $A1 "DELETE FROM storage.objects WHERE name = '$SI/p1.jpg' RETURNING 1")" "1"
  check "is_pristine_draft is not callable anonymously" "$("${PSQL[@]}" -d "$DB" -At -c "SET ROLE anon; SELECT public.is_pristine_draft('$SD')" 2>&1 | tail -1 | sed 's/^ERROR: *//')" "$DENIED"
  check "is_pristine_draft reveals nothing across units" "$(as $AB "SELECT public.is_pristine_draft('$SD')")" "f"

  local UP; UP=$(new_item $I1 'Upload cleanup')
  as $I1 "INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('evidence-photos', '$UP/orphan.jpg', '$I1'), ('evidence-photos', '$UP/used.jpg', '$I1') RETURNING 1" >/dev/null
  as $I1 "INSERT INTO evidences (item_id, evidence_date, file_path) VALUES ('$UP', current_date, '$UP/used.jpg') RETURNING 1" >/dev/null
  check "adding an evidence record is audited" "$(su_sql "SELECT count(*) FROM history WHERE item_id = '$UP' AND action = 'evidence_added' AND new_value = '$UP/used.jpg' AND by_user = '$I1' AND item_name IS NOT NULL")" "1"
  check "a viewer can't read or fake audit events through the trigger function" "$(as $V1 "SELECT public.audit_child_insert()")" "permission denied.*|.*trigger functions can only be called as triggers.*"
  check "a colleague cannot remove someone else's upload" "$(rows $I2 "DELETE FROM storage.objects WHERE name = '$UP/orphan.jpg' RETURNING 1")" "0"
  check "uploader removes their unreferenced upload (failed insert)" "$(rows $I1 "DELETE FROM storage.objects WHERE name = '$UP/orphan.jpg' RETURNING 1")" "1"
  check "...but not one an evidence uses" "$(rows $I1 "DELETE FROM storage.objects WHERE name = '$UP/used.jpg' RETURNING 1")" "0"

  echo " child deletions & draft sweep"
  local CI; CI=$(new_item $I1 'Hull plate')
  local RID; RID=$(as $I1 "INSERT INTO readings (item_id, reading_date, depth_mm, location) VALUES ('$CI', current_date, 1.2, 'FR-12') RETURNING id")
  check "inspector cannot delete a reading" "$(rows $I1 "DELETE FROM readings WHERE id = '$RID' RETURNING 1")" "0"
  rows $A1 "DELETE FROM readings WHERE id = '$RID' RETURNING 1" >/dev/null
  check "deleting a reading is audited" "$(su_sql "SELECT note FROM history WHERE item_ref = '$CI' AND action = 'reading_deleted'")" "Reading removed: 1\.200 mm on .* at FR-12"
  as $I1 "INSERT INTO evidences (item_id, evidence_date, description) VALUES ('$CI', current_date, 'photo') RETURNING 1" >/dev/null
  as $I1 "INSERT INTO readings (item_id, reading_date, depth_mm) VALUES ('$CI', current_date, 1.3) RETURNING 1" >/dev/null
  check "cascade on item delete doesn't double-log children" "$(rows $A1 "DELETE FROM items WHERE id = '$CI' RETURNING 1")/$(su_sql "SELECT count(*) FROM history WHERE item_ref = '$CI' AND action IN ('reading_deleted', 'evidence_deleted')")" "1/1"
  local OLDD; OLDD=$(new_item $I1 'Untitled'); local OLDD2; OLDD2=$(new_item $I2 'Untitled'); local OLDR; OLDR=$(new_item $I1 'Untitled')
  as $I1 "INSERT INTO readings (item_id, reading_date, depth_mm) VALUES ('$OLDR', current_date, 0.2) RETURNING 1" >/dev/null
  local YOUNG; YOUNG=$(new_item $I1 'Untitled')
  su_sql "UPDATE items SET created_at = now() - interval '2 hours' WHERE id = '$YOUNG'" >/dev/null
  su_sql "UPDATE items SET created_at = now() - interval '25 hours' WHERE id IN ('$OLDD', '$OLDD2', '$OLDR')" >/dev/null
  check "draft sweep discards only the caller's abandoned pristine drafts" "$(as $I1 "SELECT string_agg(x::text, ',') FROM discard_my_abandoned_drafts() x")" "$OLDD"
  check "...leaving colleagues' and non-empty drafts" "$(su_sql "SELECT count(*) FROM items WHERE id IN ('$OLDD2', '$OLDR')")" "2"
  check "...and drafts younger than a day (idle logout survivors)" "$(su_sql "SELECT count(*) FROM items WHERE id = '$YOUNG'")" "1"
  check "API roles cannot TRUNCATE" "$(as $A1 "TRUNCATE items")" "$DENIED"

  check "negative pit depth is rejected" "$(as $I1 "INSERT INTO readings (item_id, reading_date, depth_mm) VALUES ('$N0', current_date, -1)")" "new row .* violates check constraint .*readings_depth_nonneg.*"

  local FP; FP=$(new_item $I1 'File path check')
  check "evidence cannot point at another item's photo" "$(as $I1 "INSERT INTO evidences (item_id, evidence_date, file_path) VALUES ('$FP', current_date, '$N0/real.jpg')")" "new row .* violates check constraint .*evidences_file_in_item_folder.*"
  check "evidence in its own folder is fine" "$(rows $I1 "INSERT INTO evidences (item_id, evidence_date, file_path) VALUES ('$FP', current_date, '$FP/ok.jpg') RETURNING 1")" "1"

  echo " reference data"
  check "admin of another unit cannot edit IFS register" "$(as $AB "UPDATE ifs_objects SET sece = false WHERE id = 'OBJ-1'")" "$DENIED"
  check "IFS register readable" "$(as $I1 "SELECT count(*) FROM ifs_objects")" "1"
  check "zones catalog read-only" "$(rows $A1 "UPDATE zones SET name = 'x' RETURNING 1")" "0|$DENIED"

  echo " unit isolation"
  check "other unit's admin sees none of this unit's items" "$(as $AB "SELECT count(*) FROM items WHERE unit_id = '$U1'")" "0"
  check "other unit's admin cannot delete this unit's items" "$(rows $AB "DELETE FROM items WHERE unit_id = '$U1' RETURNING 1")" "0"

  echo " normal workflow"
  local N; N=$(new_item $I1 'Untitled')
  check "inspector names and saves a new item" "$(as $I1 "UPDATE items SET name = 'Flange F-7', prob = 3, cons = 4 WHERE id = '$N' RETURNING name")" "Flange F-7"
  check "inspector adds a reading" "$(rows $I1 "INSERT INTO readings (item_id, reading_date, depth_mm) VALUES ('$N', current_date, 0.5) RETURNING 1")" "1"
  check "inspector sees the item history" "$(as $I1 "SELECT count(*) > 0 FROM history WHERE item_id = '$N'")" "t"
  check "audit rows snapshot unit and name" "$(su_sql "SELECT count(*) FROM history WHERE unit_id IS NULL OR item_ref IS NULL OR item_name IS NULL")" "0"

  echo " shared rate limits"
  svc() { "${PSQL[@]}" -d "$DB" -At -c "SET ROLE service_role;" -c "$1" 2>&1 | tail -1 | sed 's/^ERROR: *//'; }
  check "authenticated can't call rate_limit_hit" "$(as $I1 "SELECT * FROM rate_limit_hit('k', 1, 60)")" "permission denied.*"
  check "authenticated can't read rate_limits" "$(as $I1 "SELECT count(*) FROM rate_limits")" "permission denied.*"
  check "anon can't call rate_limit_hit" "$("${PSQL[@]}" -d "$DB" -At -c "SET ROLE anon;" -c "SELECT * FROM rate_limit_hit('k', 1, 60)" 2>&1 | tail -1 | sed 's/^ERROR: *//')" "permission denied.*"
  check "1st hit within the limit" "$(svc "SELECT allowed || ',' || retry_after FROM rate_limit_hit('t:$DB', 2, 60)")" "true,0"
  check "2nd hit within the limit" "$(svc "SELECT allowed FROM rate_limit_hit('t:$DB', 2, 60)")" "t"
  check "3rd hit refused with a retry time" "$(svc "SELECT NOT allowed AND retry_after BETWEEN 1 AND 60 FROM rate_limit_hit('t:$DB', 2, 60)")" "t"
  check "keys are independent" "$(svc "SELECT allowed FROM rate_limit_hit('other:$DB', 2, 60)")" "t"
  su_sql "UPDATE rate_limits SET window_start = now() - interval '61 seconds' WHERE key = 't:$DB'" >/dev/null
  check "an expired window starts over" "$(svc "SELECT allowed FROM rate_limit_hit('t:$DB', 2, 60)")" "t"
  check "the new window counts from 1" "$(su_sql "SELECT count FROM rate_limits WHERE key = 't:$DB'")" "1"
  check "invalid arguments are rejected" "$("${PSQL[@]}" -d "$DB" -At -c "SET ROLE service_role;" -c "SELECT * FROM rate_limit_hit('k', 0, 60)" 2>&1 | grep -c 'invalid arguments')" "1"
}

scenario() { # scenario <name> <files...>
  DB="$1"; shift
  echo "== $DB"
  "${PSQL[@]}" -d postgres -c "CREATE DATABASE $DB" >/dev/null
  load "$HERE/supabase-stub.sql"
  for f in "$@"; do load "$ROOT/$f"; done
  load "$HERE/seed.sql"
  suite
}

# Every migration, in file-name (= timestamp) order.
MIGRATIONS=$(cd "$ROOT" && ls supabase/migrations/*.sql | sort)
# shellcheck disable=SC2086 # word-split on purpose: one file per word
scenario fresh $MIGRATIONS $MIGRATIONS
echo " demo seed"
REAL=$(as $I1 "INSERT INTO items (unit_id, zone_id, name, notes) VALUES ((SELECT id FROM units WHERE code = 'SS-75'), 'Z01', 'Imported', '[DEMO] imported by hand') RETURNING id")
before=$(su_sql "SELECT count(*) FROM history WHERE item_id IS NULL")
load "$ROOT/supabase/seed/demo.sql"; load "$ROOT/supabase/seed/demo.sql"
check "re-running the demo seed leaves no orphaned history" "$(su_sql "SELECT count(*) FROM history WHERE item_id IS NULL")" "$before"
check "demo seed loads its items" "$(su_sql "SELECT count(*) > 20 FROM items WHERE notes LIKE '[DEMO]%'")" "t"
check "demo seed never removes an unregistered item" "$(su_sql "SELECT count(*) FROM items WHERE id = '$REAL'")" "1"
check "rollback-v140 refuses to run under round 5" "$("${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/upgrades/rollback-v140.sql" 2>&1 | grep -c 'not compatible with security round 5')" "1"

scenario upgrade supabase/migrations/20260928000000_baseline.sql supabase/migrations/20260928000100_ifs_register.sql \
  supabase/upgrades/security-fixes.sql supabase/upgrades/hardening.sql supabase/upgrades/hardening-3.sql \
  supabase/upgrades/hardening-4.sql supabase/upgrades/hardening-5.sql supabase/upgrades/hardening-5.sql \
  supabase/upgrades/schema-v115.sql supabase/upgrades/schema-v115.sql \
  supabase/migrations/20260929000000_rate_limits.sql \
  supabase/migrations/20260929000100_active_reads_insert_audit.sql \
  supabase/upgrades/hardening-5.sql

echo "== no-ifs (upgrade file on a database without the IFS table)"
DB=noifs
"${PSQL[@]}" -d postgres -c "CREATE DATABASE $DB" >/dev/null
load "$HERE/supabase-stub.sql"
load "$ROOT/supabase/migrations/20260928000000_baseline.sql"
check "supabase/upgrades/hardening-5.sql applies without ifs_objects" \
  "$("${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/upgrades/hardening-5.sql" >/dev/null 2>&1 && echo applied)" "applied"

echo
echo "$PASSES passed, $FAILS failed"
[ "$FAILS" -eq 0 ]

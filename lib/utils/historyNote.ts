// History notes are written by the database, not the app: the triggers
// audit_child_insert() and audit_child_delete() store evidence events as
//   'Evidence added: <date> <long dash> <description>'
//   'Evidence removed: <date> <long dash> <description>'
// with a long dash between the date and the description (see
// supabase/migrations). The app shows no long dashes, so the History panel,
// the audit CSV and the XLSX Change Log pass notes through here.
//
// Why not change the functions: they are stored in production as applied;
// editing them in the repo would make it drift from the live schema, and
// rows written so far keep the dash anyway. A future migration could
// change the format itself; this stays harmless afterwards.
//
// Only the trigger's own separator is replaced. The description after it
// is text a user typed and is shown as typed.
const EVIDENCE_NOTE = /^(Evidence (?:added|removed): \S*) \u2014(?: ([\s\S]*))?$/;

export function historyNote(note: string | null | undefined): string {
  if (!note) return "";
  const m = EVIDENCE_NOTE.exec(note);
  if (!m) return note;
  // No description: the trigger leaves "<date> <long dash> " behind; drop it.
  return m[2] ? `${m[1]} - ${m[2]}` : m[1];
}

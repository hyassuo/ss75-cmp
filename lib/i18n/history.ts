// Audit history (the `history` table) shown in the UI language.
//
// The database triggers write every event in English: the action name
// (`reading_added`), the changed column (`depth_mm`), the old and new
// values as text, and a note ("Reading added: 0.700 mm on 2026-10-09 at
// P1"). Those rows stay as they are (the CSV and XLSX exports carry them
// verbatim); the History panel and the Audit Log screen rebuild them here.
// Anything not recognised is shown as stored.

import { translate, tOr, type DictKey, type Lang } from "@/lib/i18n/dict";
import { fmt, fmtDateTime } from "@/lib/utils/format";
import { historyNote } from "@/lib/utils/historyNote";

function tf(lang: Lang, key: DictKey, ...args: unknown[]): string {
  const v = translate(lang, key);
  return typeof v === "function"
    ? (v as (...a: unknown[]) => string)(...args)
    : String(v);
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}/;
// A timestamptz as Postgres writes it as text: "2026-10-09 23:30:00.123+00".
const PG_INSTANT = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2})(?:\.\d+)?)?([+-]\d{2})(?::?(\d{2}))?$/;

function day(v: string, lang: Lang): string {
  // An instant (resolved_at) is shown on the device's calendar day, with
  // its time: its first 10 characters are the UTC date, a day ahead of
  // Brazil every evening.
  const m = PG_INSTANT.exec(v);
  if (m) {
    // Rebuilt in the strict ISO form every browser parses (no microseconds).
    const ms = Date.parse(`${m[1]}T${m[2]}:${m[3] ?? "00"}${m[4]}:${m[5] ?? "00"}`);
    if (!isNaN(ms)) return fmtDateTime(ms, lang);
  }
  return ISO_DAY.test(v) ? fmt(v.slice(0, 10), lang) : v;
}

// "0.700" stays as stored in EN and gets the decimal comma in PT.
function decimal(v: string, lang: Lang): string {
  return lang === "pt" && /^-?\d+\.\d+$/.test(v) ? v.replace(".", ",") : v;
}

export function historyAction(action: string, lang: Lang): string {
  return tOr(lang, `hist.action.${action}`, action.replace(/_/g, " "));
}

export function historyField(field: string, lang: Lang): string {
  return tOr(lang, `hist.field.${field}`, field);
}

const BOOL_FIELDS = new Set(["sece", "drops_risk", "structural", "archived", "is_accessory"]);
const DATE_FIELDS = new Set(["next_insp", "last_insp", "action_due", "resolved_at"]);
// Columns holding one of the app's fixed lists: shown with its label.
const LIST_PREFIX: Record<string, string> = {
  priority: "priority",
  status: "statusItem",
  freq_insp: "freq",
  obs_source: "obsSrc",
  action_type: "actionType",
  action_status: "actionStatus",
  accessory_type: "accType",
  mechanism: "mech",
  protection: "prot",
};

// One old or new value of a changed field.
export function historyValue(
  field: string | null,
  value: string | null,
  lang: Lang
): string {
  if (value == null || value === "") return "-";
  const f = field ?? "";
  if (BOOL_FIELDS.has(f)) {
    if (value === "true") return tf(lang, "sece.yes");
    if (value === "false") return tf(lang, "sece.no");
    return value;
  }
  if (DATE_FIELDS.has(f)) return day(value, lang);
  if (LIST_PREFIX[f]) return tOr(lang, `${LIST_PREFIX[f]}.${value}`, value);
  if (f === "depth_mm") return decimal(value, lang);
  return value;
}

const FIXED: Record<string, DictKey> = {
  "Item created": "hnote.created",
  "Item marked as resolved": "hnote.resolved",
  "Item reopened": "hnote.reopened",
  "Item archived": "hnote.archived",
  "Item unarchived": "hnote.unarchived",
};
const DELETED = /^Item deleted \((\d+) readings, (\d+) evidences removed\)$/;
const READING =
  /^Reading (added|removed): (-?\d+(?:\.\d+)?) mm on (\d{4}-\d{2}-\d{2})(?: at ([\s\S]*))?$/;
// After historyNote() the evidence separator is always " - ".
const EVIDENCE = /^Evidence (added|removed): (\S*)(?: - ([\s\S]*))?$/;

// A trigger's note in the UI language. Dates follow the language too; the
// text a user typed (evidence description, reading location) stays as typed.
export function historyNoteText(note: string | null | undefined, lang: Lang): string {
  const n = historyNote(note);
  if (!n) return "";
  if (FIXED[n]) return tf(lang, FIXED[n]);
  let m = DELETED.exec(n);
  if (m) return tf(lang, "hnote.deleted", m[1], m[2]);
  m = READING.exec(n);
  if (m) {
    return tf(
      lang,
      m[1] === "added" ? "hnote.readingAdded" : "hnote.readingRemoved",
      decimal(m[2], lang),
      fmt(m[3], lang),
      m[4] ?? ""
    );
  }
  m = EVIDENCE.exec(n);
  if (m) {
    return tf(
      lang,
      m[1] === "added" ? "hnote.evidenceAdded" : "hnote.evidenceRemoved",
      day(m[2], lang),
      m[3] ?? ""
    );
  }
  return n;
}

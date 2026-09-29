import type { Lang } from "@/lib/i18n/dict";

// Dates and numbers follow the UI language: PT is pt-BR, EN is en-GB
// ("9 Oct 2026": day first like the rest of the crew's paperwork, and the
// month in letters so it reads the same to Brazilian, Norwegian and
// American users). The month tables are written out instead of calling
// Intl: the server (Node's ICU) and every browser then produce exactly the
// same text, so server-rendered pages hydrate without a mismatch.
const MONTHS: Record<Lang, string[]> = {
  pt: ["jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

function ymd(d: string): [string, number, number] | null {
  const parts = d.split("-");
  if (parts.length < 3) return null;
  const m = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (!(m >= 1 && m <= 12) || !(day >= 1)) return null;
  return [parts[0], m, day];
}

// Medium date for screens: "9 Oct 2026" (EN), "9 de out. de 2026" (PT,
// as iOS renders a pt-BR date input).
export function fmt(d: string | null | undefined, lang: Lang): string {
  if (!d) return "-";
  const p = ymd(d);
  if (!p) return d;
  const [y, m, day] = p;
  const mon = MONTHS[lang][m - 1];
  return lang === "pt" ? `${day} de ${mon} de ${y}` : `${day} ${mon} ${y}`;
}

// Compact form for tables and the PDF: "09-Oct-2026" (EN), "09-out-2026" (PT).
export function fmtCompact(d: string | null | undefined, lang: Lang): string {
  if (!d) return "-";
  const p = ymd(d);
  if (!p) return d;
  const [y, m, day] = p;
  const mon = MONTHS[lang][m - 1].replace(".", "");
  return `${String(day).padStart(2, "0")}-${mon}-${y}`;
}

// Date and time of a local instant (epoch ms), in the device's time zone:
// "9 Oct 2026, 14:05" / "9 de out. de 2026, 14:05".
export function fmtDateTime(ms: number, lang: Lang): string {
  const d = new Date(ms);
  if (isNaN(d.getTime())) return "-";
  const date = fmt(localYmd(d), lang);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${date}, ${hh}:${mm}`;
}

// A number for display: fixed decimals when `digits` is given, and the
// decimal comma in PT ("1,5"), the decimal point in EN ("1.5").
export function fmtNum(n: number, lang: Lang, digits?: number): string {
  const s = digits === undefined ? String(n) : n.toFixed(digits);
  return lang === "pt" ? s.replace(".", ",") : s;
}

function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Local calendar date. toISOString() would give the UTC date, which rolls
// to "tomorrow" at 21:00 for a UTC-3 crew and flagged items overdue hours
// early. isOverdue/daysUntil compare plain YYYY-MM-DD values, so the local
// date keeps every schedule comparison on the user's calendar day.
export function today(): string {
  return localYmd(new Date());
}

// "DD/MM/YYYY" short form for the top bar, where the medium form is too
// long on phones. Day first is right in both languages (pt-BR and en-GB).
export function fmtShort(d: string | null | undefined): string {
  if (!d) return "-";
  const parts = d.split("-");
  if (parts.length < 3) return d;
  const [y, m, day] = parts;
  return `${day.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
}

// Calendar arithmetic on plain YYYY-MM-DD values. Works entirely in UTC so
// the result never depends on the viewer's time zone: mixing a UTC parse
// with local setDate() lost a day across DST transitions (e.g. 2026-01-01
// + 91 days gave 2026-04-01 instead of 04-02 in New York / London / Oslo).
export function addDays(d: string, days: number): string | null {
  const t = Date.parse(d.length === 10 ? d + "T00:00:00Z" : d);
  if (isNaN(t)) return null;
  const x = new Date(t);
  x.setUTCDate(x.getUTCDate() + days);
  return x.toISOString().slice(0, 10);
}

export function isOverdue(d: string | null | undefined): boolean {
  return !!d && d < today();
}

export function daysUntil(d: string | null | undefined): number | null {
  if (!d) return null;
  return Math.round(
    (new Date(d).getTime() - new Date(today()).getTime()) / 86_400_000
  );
}

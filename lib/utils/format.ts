const MONTHS_PT = [
  "jan.", "fev.", "mar.", "abr.", "mai.", "jun.",
  "jul.", "ago.", "set.", "out.", "nov.", "dez.",
];
const MONTHS_EN_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Brazilian long-form date — matches iOS native date input rendering.
export function fmt(d: string | null | undefined): string {
  if (!d) return "-";
  const parts = d.split("-");
  if (parts.length < 3) return d;
  const [y, m, day] = parts;
  return `${parseInt(day, 10)} de ${MONTHS_PT[parseInt(m, 10) - 1]} de ${y}`;
}

// Compact English form for reports / tables: "22-Jun-2026".
export function fmtCompact(d: string | null | undefined): string {
  if (!d) return "-";
  const parts = d.split("-");
  if (parts.length < 3) return d;
  const [y, m, day] = parts;
  const dd = day.padStart(2, "0");
  return `${dd}-${MONTHS_EN_SHORT[parseInt(m, 10) - 1]}-${y}`;
}

// Local calendar date. toISOString() would give the UTC date, which rolls
// to "tomorrow" at 21:00 for a UTC-3 crew and flagged items overdue hours
// early. isOverdue/daysUntil compare plain YYYY-MM-DD values, so the local
// date keeps every schedule comparison on the user's calendar day.
export function today(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// "DD/MM/YYYY" short form for header chrome where the long Portuguese
// month form is too verbose.
export function fmtShort(d: string | null | undefined): string {
  if (!d) return "-";
  const parts = d.split("-");
  if (parts.length < 3) return d;
  const [y, m, day] = parts;
  return `${day.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
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

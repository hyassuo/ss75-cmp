const MONTHS_PT = [
  "jan.", "fev.", "mar.", "abr.", "mai.", "jun.",
  "jul.", "ago.", "set.", "out.", "nov.", "dez.",
];

// Brazilian long-form date — matches iOS native date input rendering.
export function fmt(d: string | null | undefined): string {
  if (!d) return "-";
  const parts = d.split("-");
  if (parts.length < 3) return d;
  const [y, m, day] = parts;
  return `${parseInt(day, 10)} de ${MONTHS_PT[parseInt(m, 10) - 1]} de ${y}`;
}

export function today(): string {
  return new Date().toISOString().split("T")[0];
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

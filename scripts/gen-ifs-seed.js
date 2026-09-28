// Regenerates supabase/seed/ifs-data.sql from an IFS "Objects" export.
// Usage: node scripts/gen-ifs-seed.js <path/to/Objects.xlsx>
const XLSX = require("@e965/xlsx"); // the SheetJS build the app already ships
const fs = require("fs");

const src = process.argv[2];
if (!src || !fs.existsSync(src)) {
  console.error("Usage: node scripts/gen-ifs-seed.js <path/to/Objects.xlsx>");
  process.exit(1);
}
const wb = XLSX.read(fs.readFileSync(src));
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
  defval: null,
});

const esc = (s) => String(s).replace(/'/g, "''");
const norm = (r) => ({
  id: String(r["Object  ID"] ?? "").trim(),
  desc: String(r["Object  Description"] ?? "").trim(),
  // Whole-value match: a substring test would read "No (1 pending)" as yes.
  sece:
    r["Safety Enviro Critical Elemnt"] === true ||
    /^(y|yes|true|1|sim)$/i.test(
      String(r["Safety Enviro Critical Elemnt"] ?? "").trim()
    ),
});

const items = rows.map(norm).filter((o) => o.id && o.id !== "null");
console.log("Valid rows:", items.length);
console.log("SECE count:", items.filter((i) => i.sece).length);

// Keep the first row per Object ID, but say so when duplicates disagree on
// SECE — that flag drives risk priority, so a silent pick is dangerous.
const seen = new Map();
const unique = items.filter((i) => {
  const prev = seen.get(i.id);
  if (prev) {
    if (prev.sece !== i.sece) {
      console.warn(`SECE conflict for ${i.id}: kept ${prev.sece}, dropped ${i.sece}`);
    }
    return false;
  }
  seen.set(i.id, i);
  return true;
});
console.log("Unique IDs:", unique.length);

const out = [];
out.push("-- =============================================================");
out.push("-- SS-75 CMP — IFS Equipment Register seed (idempotent)");
out.push("-- =============================================================");
out.push("-- Run AFTER supabase/migrations/20260928000100_ifs_register.sql. Safe to re-run: TRUNCATEs");
out.push("-- the table first.");
out.push("");
out.push("TRUNCATE TABLE public.ifs_objects;");
out.push("");

const BATCH = 500;
for (let i = 0; i < unique.length; i += BATCH) {
  const chunk = unique.slice(i, i + BATCH);
  out.push("INSERT INTO public.ifs_objects (id, description, sece) VALUES");
  chunk.forEach((o, idx) => {
    const last = idx === chunk.length - 1;
    out.push(
      `  ('${esc(o.id)}', '${esc(o.desc)}', ${o.sece ? "true" : "false"})${last ? ";" : ","}`
    );
  });
  out.push("");
}

fs.writeFileSync("supabase/seed/ifs-data.sql", out.join("\n"));
const size = fs.statSync("supabase/seed/ifs-data.sql").size;
console.log("Written supabase/seed/ifs-data.sql:", (size / 1024).toFixed(1), "KB");

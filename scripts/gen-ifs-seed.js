const XLSX = require("xlsx");
const fs = require("fs");

const wb = XLSX.readFile(
  "/root/.claude/uploads/33d25b6c-66c0-5419-87f8-4cec1a1b2164/f1243b43-Objects.xlsx"
);
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
  defval: null,
});

const esc = (s) => String(s).replace(/'/g, "''");
const norm = (r) => ({
  id: String(r["Object  ID"] ?? "").trim(),
  desc: String(r["Object  Description"] ?? "").trim(),
  sece:
    r["Safety Enviro Critical Elemnt"] === true ||
    /yes|true|1/i.test(String(r["Safety Enviro Critical Elemnt"] ?? "")),
});

const items = rows.map(norm).filter((o) => o.id && o.id !== "null");
console.log("Valid rows:", items.length);
console.log("SECE count:", items.filter((i) => i.sece).length);

const seen = new Set();
const unique = items.filter((i) => {
  if (seen.has(i.id)) return false;
  seen.add(i.id);
  return true;
});
console.log("Unique IDs:", unique.length);

const out = [];
out.push("-- =============================================================");
out.push("-- SS-75 CMP — IFS Equipment Register seed (idempotent)");
out.push("-- =============================================================");
out.push("-- Run AFTER supabase-ifs-schema.sql. Safe to re-run: TRUNCATEs");
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

fs.writeFileSync("supabase-ifs-data.sql", out.join("\n"));
const size = fs.statSync("supabase-ifs-data.sql").size;
console.log("Written supabase-ifs-data.sql:", (size / 1024).toFixed(1), "KB");

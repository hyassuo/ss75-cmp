#!/usr/bin/env node
// Downloads every object of the evidence-photos bucket into <outDir>,
// preserving the {item_id}/{file} layout. Used by scripts/backup.sh.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Node 20+ (global fetch).
import fs from "node:fs/promises";
import path from "node:path";

const [, , outDir] = process.argv;
const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "evidence-photos";
if (!outDir || !base || !key) {
  console.error("usage: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… backup-storage.mjs <outDir>");
  process.exit(2);
}
const headers = { apikey: key, Authorization: `Bearer ${key}` };

async function list(prefix) {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${base}/storage/v1/object/list/${BUCKET}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }),
    });
    if (!r.ok) throw new Error(`list ${prefix}: ${r.status} ${await r.text()}`);
    const page = await r.json();
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

let files = 0;
let bytes = 0;
// Top level holds one folder per item (entries without an id are folders).
for (const folder of await list("")) {
  if (folder.id) continue;
  for (const obj of await list(folder.name + "/")) {
    if (!obj.id) continue;
    const rel = `${folder.name}/${obj.name}`;
    const r = await fetch(
      `${base}/storage/v1/object/${BUCKET}/${rel.split("/").map(encodeURIComponent).join("/")}`,
      { headers }
    );
    if (!r.ok) throw new Error(`download ${rel}: ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const dest = path.join(outDir, rel);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, buf);
    files++;
    bytes += buf.length;
  }
}
console.log(`storage: ${files} files, ${(bytes / 1048576).toFixed(1)} MiB`);

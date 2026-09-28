#!/usr/bin/env node
// Uploads a backup's storage/ folder back into the evidence-photos bucket
// (upsert, same paths). Run after restoring data.sql.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Usage: restore-storage.mjs <storageDir>
import fs from "node:fs/promises";
import path from "node:path";

const [, , dir] = process.argv;
const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!dir || !base || !key) {
  console.error("usage: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… restore-storage.mjs <storageDir>");
  process.exit(2);
}
const TYPES = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".heic": "image/heic", ".pdf": "application/pdf" };
let n = 0;
async function walk(d) {
  for (const e of await fs.readdir(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { await walk(p); continue; }
    const rel = path.relative(dir, p).split(path.sep).map(encodeURIComponent).join("/");
    const r = await fetch(`${base}/storage/v1/object/evidence-photos/${rel}`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "x-upsert": "true",
        "Content-Type": TYPES[path.extname(p).toLowerCase()] ?? "application/octet-stream",
      },
      body: await fs.readFile(p),
    });
    if (!r.ok) throw new Error(`upload ${rel}: ${r.status} ${await r.text()}`);
    n++;
  }
}
await walk(dir);
console.log(`restored ${n} files`);

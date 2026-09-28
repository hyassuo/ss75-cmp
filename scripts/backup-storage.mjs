#!/usr/bin/env node
// Downloads every object of the evidence-photos bucket into <outDir>,
// preserving paths (normally {item_id}/{file}; any depth is handled).
// Used by scripts/backup.sh. Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
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

// Transient 5xx / network errors are retried; anything else fails the run.
async function withRetry(what, fn) {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fn();
      if (r.ok || (r.status < 500 && r.status !== 429)) return r;
      if (attempt >= 4) return r;
    } catch (e) {
      if (attempt >= 4) throw new Error(`${what}: ${e.message}`);
    }
    await new Promise((res) => setTimeout(res, 1000 * 2 ** attempt));
  }
}

async function list(prefix) {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await withRetry(`list ${prefix}`, () =>
      fetch(`${base}/storage/v1/object/list/${BUCKET}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }),
      })
    );
    if (!r.ok) throw new Error(`list ${prefix}: ${r.status} ${await r.text()}`);
    const page = await r.json();
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

let files = 0;
let bytes = 0;
// Entries without an id are folders: walk them recursively.
async function walk(prefix) {
  for (const e of await list(prefix)) {
    const rel = prefix + e.name;
    if (!e.id) {
      await walk(rel + "/");
      continue;
    }
    const r = await withRetry(`download ${rel}`, () =>
      fetch(`${base}/storage/v1/object/${BUCKET}/${rel.split("/").map(encodeURIComponent).join("/")}`, { headers })
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
await walk("");
console.log(`storage: ${files} files, ${(bytes / 1048576).toFixed(1)} MiB`);

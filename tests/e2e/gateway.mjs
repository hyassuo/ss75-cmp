// Fake Supabase API gateway for local E2E runs.
//
//   /rest/v1/*     -> proxied to PostgREST v12 (JWT passed through)
//   /auth/v1/*     -> minimal GoTrue: password + refresh_token grants, /user, /logout
//   /storage/v1/*  -> minimal Storage API. Every object row is written/read/
//                     deleted in Postgres AS THE CALLER (SET ROLE + JWT claims),
//                     so the schema's real storage.objects RLS policies decide.
//                     File bytes live on disk under $STORAGE_DIR.
//   /__ctl/*       -> test control: fault injection + request log
//
// Response shapes follow @supabase/auth-js and @supabase/storage-js v2.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";
import { sign, verify } from "./lib/jwt.mjs";

const PORT = Number(process.env.GW_PORT || 55435);
const PGRST = `http://127.0.0.1:${process.env.PGRST_PORT || 55434}`;
const SECRET = process.env.JWT_SECRET;
const PASSWORD = process.env.E2E_PASSWORD;
const STORAGE_DIR = process.env.STORAGE_DIR;
const LOG_FILE = process.env.GW_LOG || path.join(process.env.STATE_DIR || ".", "gateway.log");
const ACCESS_TTL = Number(process.env.ACCESS_TTL || 3600);
if (!SECRET || !PASSWORD || !STORAGE_DIR) throw new Error("JWT_SECRET, E2E_PASSWORD, STORAGE_DIR required");

const pool = new pg.Pool({
  host: path.join(process.env.PG_DIR, "sock"),
  port: Number(process.env.PG_PORT),
  user: "postgres",
  database: process.env.PG_DB,
  max: 10,
});

// ---------------------------------------------------------------- utilities
const logStream = fs.createWriteStream(LOG_FILE, { flags: "a" });
const recent = []; // ring buffer of {t, method, url, status, ms, note}
function record(entry) {
  recent.push(entry);
  if (recent.length > 2000) recent.shift();
  logStream.write(JSON.stringify(entry) + "\n");
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization,apikey,content-type,x-client-info,prefer,range,accept-profile,content-profile,x-supabase-api-version,x-upsert,cache-control,x-metadata,accept,accept-encoding",
  "Access-Control-Expose-Headers": "content-range,content-location,x-supabase-api-version,range-unit,preference-applied",
  "Access-Control-Max-Age": "600",
};

function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  const payload = body === undefined || body === null ? "" : isBuf ? body : JSON.stringify(body);
  res.writeHead(status, {
    ...CORS,
    ...(isBuf || payload === "" ? {} : { "Content-Type": "application/json" }),
    "x-supabase-api-version": "2024-01-01",
    ...headers,
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
const json = (buf) => {
  try {
    return buf.length ? JSON.parse(buf.toString("utf8")) : {};
  } catch {
    return {};
  }
};

function bearer(req) {
  const h = req.headers.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1] : req.headers.apikey || null;
}

// ------------------------------------------------------------ fault control
// faults: [{method, prefix, status, times, body}] — first match wins; times
// counts down (-1 = until cleared).
let faults = [];
function matchFault(method, url) {
  const f = faults.find(
    (x) => (!x.method || x.method === method) && url.startsWith(x.prefix) && x.times !== 0
  );
  if (!f) return null;
  if (f.times > 0) f.times -= 1;
  return f;
}

// --------------------------------------------------------------- auth (GoTrue)
const refreshTokens = new Map(); // token -> user id

async function userRow(where, value) {
  const { rows } = await pool.query(
    `SELECT id, email, raw_user_meta_data, created_at FROM auth.users WHERE ${where} = $1`,
    [value]
  );
  return rows[0] || null;
}

function userJson(u) {
  const ts = new Date(u.created_at || Date.now()).toISOString();
  return {
    id: u.id,
    aud: "authenticated",
    role: "authenticated",
    email: u.email,
    email_confirmed_at: ts,
    phone: "",
    confirmed_at: ts,
    last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: u.raw_user_meta_data || {},
    identities: [],
    created_at: ts,
    updated_at: ts,
    is_anonymous: false,
  };
}

function issueSession(u) {
  const now = Math.floor(Date.now() / 1000);
  const access_token = sign(
    {
      aud: "authenticated",
      exp: now + ACCESS_TTL,
      iat: now,
      iss: `http://localhost:${PORT}/auth/v1`,
      sub: u.id,
      email: u.email,
      phone: "",
      role: "authenticated",
      aal: "aal1",
      session_id: crypto.randomUUID(),
      is_anonymous: false,
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: u.raw_user_meta_data || {},
    },
    SECRET
  );
  const refresh_token = crypto.randomBytes(16).toString("hex");
  refreshTokens.set(refresh_token, u.id);
  return {
    access_token,
    token_type: "bearer",
    expires_in: ACCESS_TTL,
    expires_at: now + ACCESS_TTL,
    refresh_token,
    user: userJson(u),
  };
}

async function handleAuth(req, res, sub, query) {
  if (req.method === "POST" && sub === "/token") {
    const body = json(await readBody(req));
    const grant = query.get("grant_type");
    if (grant === "password") {
      const u = body.email ? await userRow("lower(email)", String(body.email).toLowerCase()) : null;
      if (!u || body.password !== PASSWORD) {
        return send(res, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
      }
      return send(res, 200, issueSession(u));
    }
    if (grant === "refresh_token") {
      const uid = refreshTokens.get(body.refresh_token);
      if (!uid) {
        return send(res, 400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token: Refresh Token Not Found" });
      }
      refreshTokens.delete(body.refresh_token);
      const u = await userRow("id", uid);
      if (!u) return send(res, 400, { code: 400, error_code: "user_not_found", msg: "User not found" });
      return send(res, 200, issueSession(u));
    }
    return send(res, 400, { code: 400, error_code: "unsupported_grant_type", msg: "Unsupported grant type" });
  }
  if (req.method === "GET" && sub === "/user") {
    const claims = verify(bearer(req), SECRET);
    if (!claims || !claims.sub) {
      return send(res, 403, { code: 403, error_code: "bad_jwt", msg: "invalid JWT: unable to parse or verify signature" });
    }
    const u = await userRow("id", claims.sub);
    if (!u) return send(res, 403, { code: 403, error_code: "user_not_found", msg: "User from sub claim in JWT does not exist" });
    return send(res, 200, userJson(u));
  }
  if (req.method === "POST" && sub === "/logout") {
    await readBody(req);
    return send(res, 204, null);
  }
  if (req.method === "GET" && (sub === "/settings" || sub === "/health")) {
    return send(res, 200, sub === "/health" ? { name: "fake-gotrue" } : { external: { email: true }, disable_signup: true });
  }
  return send(res, 404, { code: 404, error_code: "not_found", msg: `fake GoTrue: ${req.method} ${sub} not implemented` });
}

// ------------------------------------------------------------------ storage
// Run `fn(client)` inside a transaction as the JWT's role with its claims —
// exactly how Supabase Storage lets RLS decide.
async function asCaller(claims, fn) {
  const role = ["anon", "authenticated", "service_role"].includes(claims?.role) ? claims.role : "anon";
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(`SET LOCAL ROLE ${role}`);
    await c.query(
      "SELECT set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true), set_config('request.jwt.claim.role', $3, true)",
      [JSON.stringify(claims || { role: "anon" }), claims?.sub || "", role]
    );
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

function storageErr(res, httpStatus, statusCode, error, message) {
  return send(res, httpStatus, { statusCode: String(statusCode), error, message });
}
function pgToStorage(res, e) {
  if (e.code === "42501" || /row-level security/i.test(e.message)) {
    return storageErr(res, 400, 403, "Unauthorized", "new row violates row-level security policy");
  }
  if (e.code === "23505") return storageErr(res, 400, 409, "Duplicate", "The resource already exists");
  return storageErr(res, 500, 500, "internal", e.message);
}

const fileOf = (bucket, name) => {
  const p = path.join(STORAGE_DIR, bucket, name);
  if (!p.startsWith(path.join(STORAGE_DIR, bucket) + path.sep)) throw new Error("bad path");
  return p;
};

// Tiny multipart/form-data parser: returns [{name, filename, type, data}].
function parseMultipart(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
  if (!m) return [];
  const boundary = Buffer.from("--" + (m[1] || m[2]));
  const parts = [];
  let pos = buf.indexOf(boundary);
  while (pos !== -1) {
    const start = pos + boundary.length;
    if (buf.slice(start, start + 2).toString() === "--") break;
    const headEnd = buf.indexOf("\r\n\r\n", start);
    if (headEnd === -1) break;
    const head = buf.slice(start + 2, headEnd).toString("utf8");
    const next = buf.indexOf(boundary, headEnd + 4);
    if (next === -1) break;
    const data = buf.slice(headEnd + 4, next - 2); // strip trailing CRLF
    const name = /name="([^"]*)"/i.exec(head)?.[1] ?? "";
    const filename = /filename="([^"]*)"/i.exec(head)?.[1];
    const type = /content-type:\s*([^\r\n]+)/i.exec(head)?.[1]?.trim();
    parts.push({ name, filename, type, data });
    pos = next;
  }
  return parts;
}

async function handleStorage(req, res, sub, query) {
  const claims = verify(bearer(req), SECRET);
  const seg = sub.split("/").filter(Boolean).map(decodeURIComponent); // ["object", ...]
  if (seg[0] !== "object") {
    return storageErr(res, 404, 404, "not_found", `fake storage: ${req.method} ${sub} not implemented`);
  }

  // GET /object/sign/{bucket}/{path}?token=  — signed download (no auth header)
  if (req.method === "GET" && seg[1] === "sign") {
    const bucket = seg[2];
    const name = seg.slice(3).join("/");
    const tok = verify(query.get("token"), SECRET);
    if (!tok || tok.url !== `${bucket}/${name}`) {
      return storageErr(res, 400, 400, "InvalidSignature", "The signature is invalid or has expired");
    }
    const { rows } = await pool.query(
      "SELECT metadata FROM storage.objects WHERE bucket_id = $1 AND name = $2",
      [bucket, name]
    );
    let bytes;
    try {
      bytes = fs.readFileSync(fileOf(bucket, name));
    } catch {
      bytes = null;
    }
    if (!rows.length || !bytes) return storageErr(res, 400, 404, "not_found", "Object not found");
    return send(res, 200, bytes, {
      "Content-Type": rows[0].metadata?.mimetype || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
  }

  if (!claims) return storageErr(res, 400, 403, "Unauthorized", "Invalid JWT");

  // POST /object/sign/{bucket}             {expiresIn, paths}   (batch)
  // POST /object/sign/{bucket}/{path}      {expiresIn}
  if (req.method === "POST" && seg[1] === "sign") {
    const bucket = seg[2];
    const body = json(await readBody(req));
    const single = seg.length > 3 ? seg.slice(3).join("/") : null;
    const paths = single ? [single] : Array.isArray(body.paths) ? body.paths : [];
    const expiresIn = Number(body.expiresIn) || 60;
    const visible = await asCaller(claims, async (c) => {
      const { rows } = await c.query(
        "SELECT name FROM storage.objects WHERE bucket_id = $1 AND name = ANY($2)",
        [bucket, paths]
      );
      return new Set(rows.map((r) => r.name));
    }).catch((e) => e);
    if (visible instanceof Error) return pgToStorage(res, visible);
    const mk = (p) =>
      `/object/sign/${bucket}/${p}?token=${sign(
        { url: `${bucket}/${p}`, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + expiresIn },
        SECRET
      )}`;
    if (single) {
      if (!visible.has(single)) return storageErr(res, 400, 404, "not_found", "Object not found");
      return send(res, 200, { signedURL: mk(single) });
    }
    return send(
      res,
      200,
      paths.map((p) =>
        visible.has(p)
          ? { error: null, path: p, signedURL: mk(p) }
          : { error: "Either the object does not exist or you do not have access to it", path: p, signedURL: null }
      )
    );
  }

  // POST /object/list/{bucket}  {prefix, limit, offset, sortBy, search}
  if (req.method === "POST" && seg[1] === "list") {
    const bucket = seg[2];
    const body = json(await readBody(req));
    let prefix = String(body.prefix || "");
    if (prefix && !prefix.endsWith("/")) prefix += "/";
    const out = await asCaller(claims, async (c) => {
      const { rows } = await c.query(
        `SELECT id, name, created_at, updated_at, last_accessed_at, metadata
           FROM storage.objects WHERE bucket_id = $1 AND name LIKE $2 ORDER BY name`,
        [bucket, prefix.replace(/[%_\\]/g, "\\$&") + "%"]
      );
      return rows;
    }).catch((e) => e);
    if (out instanceof Error) return pgToStorage(res, out);
    const seen = new Set();
    const list = [];
    for (const r of out) {
      const rest = r.name.slice(prefix.length);
      const slash = rest.indexOf("/");
      if (slash >= 0) {
        const folder = rest.slice(0, slash);
        if (!seen.has(folder)) {
          seen.add(folder);
          list.push({ name: folder, id: null, updated_at: null, created_at: null, last_accessed_at: null, metadata: null });
        }
      } else {
        list.push({ ...r, name: rest });
      }
    }
    const off = Number(body.offset) || 0;
    const lim = Number(body.limit) || 100;
    return send(res, 200, list.slice(off, off + lim));
  }

  // DELETE /object/{bucket}  {prefixes}
  if (req.method === "DELETE" && seg.length === 2) {
    const bucket = seg[1];
    const body = json(await readBody(req));
    const prefixes = Array.isArray(body.prefixes) ? body.prefixes : [];
    const gone = await asCaller(claims, async (c) => {
      const { rows } = await c.query(
        `DELETE FROM storage.objects WHERE bucket_id = $1 AND name = ANY($2)
         RETURNING id, name, bucket_id, owner, owner_id, created_at, updated_at, last_accessed_at, metadata, version`,
        [bucket, prefixes]
      );
      return rows;
    }).catch((e) => e);
    if (gone instanceof Error) return pgToStorage(res, gone);
    for (const r of gone) {
      try {
        fs.unlinkSync(fileOf(bucket, r.name));
      } catch {
        /* already gone */
      }
    }
    record({ t: Date.now(), kind: "storage-delete", bucket, requested: prefixes, deleted: gone.map((r) => r.name) });
    return send(res, 200, gone);
  }

  // POST|PUT /object/{bucket}/{path}  (multipart or raw body)
  if ((req.method === "POST" || req.method === "PUT") && seg.length >= 3) {
    const bucket = seg[1];
    const name = seg.slice(2).join("/");
    const raw = await readBody(req);
    const ctype = req.headers["content-type"] || "";
    let data = raw;
    let mimetype = ctype;
    if (/^multipart\/form-data/i.test(ctype)) {
      const parts = parseMultipart(raw, ctype);
      const filePart = parts.find((p) => p.filename !== undefined) || parts.find((p) => p.name === "");
      if (!filePart) return storageErr(res, 400, 400, "InvalidRequest", "No file in form data");
      data = filePart.data;
      mimetype = filePart.type || "application/octet-stream";
    }
    const { rows: b } = await pool.query("SELECT file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = $1", [bucket]);
    if (!b.length) return storageErr(res, 400, 404, "Bucket not found", "Bucket not found");
    if (b[0].file_size_limit && data.length > Number(b[0].file_size_limit)) {
      return storageErr(res, 400, 413, "Payload too large", "The object exceeded the maximum allowed size");
    }
    if (b[0].allowed_mime_types?.length && !b[0].allowed_mime_types.includes(mimetype)) {
      return storageErr(res, 400, 415, "invalid_mime_type", `mime type ${mimetype} is not supported`);
    }
    const upsert = req.method === "PUT" || req.headers["x-upsert"] === "true";
    const meta = { mimetype, size: data.length, eTag: `"${crypto.createHash("md5").update(data).digest("hex")}"`, cacheControl: "max-age=3600" };
    const ins = await asCaller(claims, async (c) => {
      const q = upsert
        ? `INSERT INTO storage.objects (bucket_id, name, owner, owner_id, metadata) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (bucket_id, name) DO UPDATE SET metadata = EXCLUDED.metadata, updated_at = now() RETURNING id`
        : `INSERT INTO storage.objects (bucket_id, name, owner, owner_id, metadata) VALUES ($1, $2, $3, $4, $5) RETURNING id`;
      const { rows } = await c.query(q, [bucket, name, claims.sub || null, claims.sub || null, meta]);
      return rows[0];
    }).catch((e) => e);
    if (ins instanceof Error) return pgToStorage(res, ins);
    const file = fileOf(bucket, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
    return send(res, 200, { Id: ins.id, Key: `${bucket}/${name}` });
  }

  return storageErr(res, 404, 404, "not_found", `fake storage: ${req.method} ${sub} not implemented`);
}

// --------------------------------------------------------------- REST proxy
function proxyRest(req, res, sub, search) {
  const headers = { ...req.headers };
  delete headers.host;
  delete headers["accept-encoding"]; // keep bodies plain for the request log
  const up = http.request(
    `${PGRST}${sub}${search}`,
    { method: req.method, headers },
    (ur) => {
      const h = { ...ur.headers, ...CORS };
      delete h["access-control-allow-origin"];
      res.writeHead(ur.statusCode, { ...h, "Access-Control-Allow-Origin": "*" });
      ur.pipe(res);
      res.__status = ur.statusCode;
    }
  );
  up.on("error", (e) => {
    send(res, 503, { code: "PGRST000", message: `upstream unavailable: ${e.message}`, details: null, hint: null });
  });
  req.pipe(up);
}

// ------------------------------------------------------------------- server
const server = http.createServer(async (req, res) => {
  const t0 = Date.now();
  const u = new URL(req.url, `http://localhost:${PORT}`);
  const url = u.pathname;
  res.on("finish", () => {
    if (url.startsWith("/__ctl")) return;
    record({ t: t0, method: req.method, url: req.url, status: res.statusCode, ms: Date.now() - t0 });
  });
  try {
    if (req.method === "OPTIONS") return send(res, 204, null);

    if (url.startsWith("/__ctl")) {
      if (url === "/__ctl/fault" && req.method === "POST") {
        const f = json(await readBody(req));
        faults.push({ method: f.method, prefix: f.prefix || "/", status: f.status ?? 503, times: f.times ?? -1, body: f.body, mode: f.mode, delay: f.delay });
        return send(res, 200, { faults });
      }
      if (url === "/__ctl/fault" && req.method === "DELETE") {
        faults = [];
        return send(res, 200, { faults });
      }
      if (url === "/__ctl/log") {
        const since = Number(u.searchParams.get("since") || 0);
        return send(res, 200, recent.filter((r) => (r.t || 0) >= since));
      }
      if (url === "/__ctl/health") return send(res, 200, { ok: true });
      return send(res, 404, { error: "unknown ctl" });
    }

    const fault = matchFault(req.method, url);
    if (fault && fault.mode === "commitThenDrop") {
      // Forward to PostgREST (the write commits) but lose the response, like
      // a satellite link dropping after the server already applied it.
      const body = await readBody(req);
      const headers = { ...req.headers };
      delete headers.host;
      const up = http.request(`${PGRST}${url.slice("/rest/v1".length)}${u.search}`, { method: req.method, headers }, (ur) => {
        ur.resume();
        ur.on("end", () => {
          record({ t: Date.now(), kind: "commitThenDrop", method: req.method, url: req.url, upstreamStatus: ur.statusCode });
          req.socket.destroy();
        });
      });
      up.on("error", () => req.socket.destroy());
      up.end(body);
      return;
    }
    if (fault && fault.mode === "delay") {
      // Slow link: hold the request, then pass it through untouched.
      await new Promise((r) => setTimeout(r, fault.delay || 1500));
    } else if (fault) {
      await readBody(req);
      if (fault.status === 0) return req.socket.destroy(); // simulate a dropped link
      return send(res, fault.status, fault.body ?? { code: "E2E_FAULT", message: `Injected fault ${fault.status}`, details: null, hint: null });
    }

    if (url.startsWith("/rest/v1")) return proxyRest(req, res, url.slice("/rest/v1".length) || "/", u.search);
    if (url.startsWith("/auth/v1")) return await handleAuth(req, res, url.slice("/auth/v1".length), u.searchParams);
    if (url.startsWith("/storage/v1")) return await handleStorage(req, res, url.slice("/storage/v1".length), u.searchParams);
    return send(res, 404, { message: "not found" });
  } catch (e) {
    console.error("[gateway]", req.method, req.url, e);
    if (!res.headersSent) send(res, 500, { message: String(e?.message || e) });
  }
});

server.listen(PORT, () => {
  console.log(`[gateway] listening on http://localhost:${PORT} -> PostgREST ${PGRST}`);
});

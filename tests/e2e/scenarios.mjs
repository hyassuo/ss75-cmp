// End-to-end scenarios for the v1.15.0 data-integrity flows, driven with
// Playwright against the real Next.js build + the local fake Supabase.
// Run through run.sh (which starts everything); results land in
// $ARTIFACTS/results.json and screenshots in $ARTIFACTS/*.png.
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import zlib from "node:zlib";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "@e965/xlsx";

// Lets context.setOffline() reach service workers (Chromium) — only the
// csp3 scenario allows a service worker; every other context blocks them.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS ??= "1";

const APP = process.env.APP_URL;
const GW = process.env.SUPABASE_URL_LOCAL;
const PASSWORD = process.env.E2E_PASSWORD;
const ART = process.env.ARTIFACTS;
const STORAGE_DIR = process.env.STORAGE_DIR;
const ONLY = (process.env.ONLY || "").split(",").filter(Boolean);
const HEADED = process.env.HEADED === "1";
fs.mkdirSync(ART, { recursive: true });

const pool = new pg.Pool({
  host: path.join(process.env.PG_DIR, "sock"),
  port: Number(process.env.PG_PORT),
  user: "postgres",
  database: process.env.PG_DB,
});
const sql = async (q, p = []) => (await pool.query(q, p)).rows;
const one = async (q, p = []) => (await sql(q, p))[0];

const ID = {
  fail: "00000000-0000-0000-0000-0000000e2e01",
  conflict: "00000000-0000-0000-0000-0000000e2e02",
  reload: "00000000-0000-0000-0000-0000000e2e03",
  draft: "00000000-0000-0000-0000-0000000e2e04",
  cancel: "00000000-0000-0000-0000-0000000e2e05",
  reading: "00000000-0000-0000-0000-0000000e2e06",
  evidence: "00000000-0000-0000-0000-0000000e2e07",
  del: "00000000-0000-0000-0000-0000000e2e08",
  lost: "00000000-0000-0000-0000-0000000e2e09",
  gone: "00000000-0000-0000-0000-0000000e2e0a",
  draftConflict: "00000000-0000-0000-0000-0000000e2e0b",
  evFail: "00000000-0000-0000-0000-0000000e2e0c",
  rate: "00000000-0000-0000-0000-0000000e2e0d",
  nav: "00000000-0000-0000-0000-0000000e2e0e",
  a11y: "00000000-0000-0000-0000-0000000e2e0f",
};
const USERS = {
  admin1: "00000000-0000-0000-0000-00000000a001",
  insp1: "00000000-0000-0000-0000-00000000c001",
  insp2: "00000000-0000-0000-0000-00000000c002",
};

// A real 32x32 PNG (orange/rust gradient), built with zlib so it is valid
// and visible in screenshots; far below the 500 KB client-compression cutoff.
// tint makes distinct photos; a large size stored uncompressed (level 0)
// goes past the cutoff, so the app's client-side compression runs.
function tinyPng({ W = 32, H = 32, tint = 0, level } = {}) {
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const o = y * (W * 3 + 1) + 1 + x * 3;
      raw[o] = 200 + (x % 50); raw[o + 1] = 60 + y * 3; raw[o + 2] = 20 + tint;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcTable[(c ^ v) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level })), chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------- gateway ctl
const ctl = {
  fault: (f) => fetch(`${GW}/__ctl/fault`, { method: "POST", body: JSON.stringify(f) }),
  clear: () => fetch(`${GW}/__ctl/fault`, { method: "DELETE" }),
  log: async (since) => (await fetch(`${GW}/__ctl/log?since=${since}`)).json(),
};


// Stop / restart the real PostgREST process (scenario c).
const PGRST_PID = path.join(process.env.STATE_DIR, "pgrst.pid");
function stopPostgrest() {
  try { process.kill(Number(fs.readFileSync(PGRST_PID, "utf8")), "SIGTERM"); } catch {}
}
async function startPostgrest() {
  const out = fs.openSync(path.join(process.env.STATE_DIR, "pgrst.log"), "a");
  const child = spawn(path.join(process.env.E2E_DIR, ".bin", "postgrest"), [path.join(process.env.STATE_DIR, "pgrst.conf")], {
    detached: true, stdio: ["ignore", out, out],
  });
  child.unref();
  fs.writeFileSync(PGRST_PID, String(child.pid));
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`http://127.0.0.1:${process.env.PGRST_PORT}/`)).status < 500) return; } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("PostgREST did not come back");
}

async function apiAs(email) {
  const c = createClient(GW, process.env.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return c;
}

// Minimal RFC 4180 CSV parser (quoted fields, "" escapes, , or ; separator).
function parseCsv(text, sep = ",") {
  const rows = [];
  let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { f += '"'; i++; }
      else if (ch === '"') q = false;
      else f += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(f); f = ""; }
    else if (ch === "\n") { row.push(f); rows.push(row); row = []; f = ""; }
    else if (ch !== "\r") f += ch;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}

// The @supabase/ssr session cookie (sb-<ref>-auth-token, maybe chunked
// .0/.1, "base64-" + base64url JSON) -> {access_token, refresh_token, ...}.
async function sessionFromCookies(page) {
  const ck = (await page.context().cookies()).filter((k) => /^sb-.*-auth-token(\.\d+)?$/.test(k.name));
  ck.sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
  let v = ck.map((k) => k.value).join("");
  if (!v) return null;
  if (v.startsWith("base64-")) v = Buffer.from(v.slice(7), "base64url").toString("utf8");
  try { return JSON.parse(decodeURIComponent(v)); } catch { try { return JSON.parse(v); } catch { return null; } }
}

// ------------------------------------------------------------ test context
const results = [];
let browser;

class Check {
  constructor(id, title) {
    this.id = id;
    this.title = title;
    this.steps = [];
    this.failures = [];
    this.console = [];
    this.network = [];
    this.dialogs = [];
    this.native = [];
    this.shots = [];
    this.csp = []; // securitypolicyviolation events
    this.cspConsole = []; // "Refused to …" console reports
    this.t0 = Date.now();
  }
  step(msg) {
    this.steps.push(msg);
    console.log(`   · ${msg}`);
  }
  expect(cond, msg, detail) {
    if (cond) {
      this.steps.push(`OK  ${msg}`);
      console.log(`   ✓ ${msg}`);
    } else {
      const d = detail === undefined ? "" : ` — got: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`;
      this.failures.push(msg + d);
      console.log(`   ✗ ${msg}${d}`);
    }
    return cond;
  }
}

async function newPage(chk, label, opts = {}) {
  // The app's real Content-Security-Policy is enforced (no bypassCSP):
  // every violation, in any page of the context (popups included), fails
  // the scenario — see watchCsp and run().
  const ctx = await browser.newContext({
    serviceWorkers: "block",
    acceptDownloads: true,
    viewport: { width: 1440, height: 1000 },
    locale: "en-US",
    timezoneId: "America/Sao_Paulo",
    ...opts,
  });
  await watchCsp(ctx, chk, label);
  const page = await ctx.newPage();
  page.__label = label;
  page.__dialogPolicy = []; // queue of true/false answers; default accept
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") {
      chk.console.push(`[${label}] ${m.type()}: ${m.text()}`);
    }
  });
  page.on("pageerror", (e) => chk.console.push(`[${label}] pageerror: ${e.message}`));
  page.on("response", async (r) => {
    const u = r.url();
    if (!u.startsWith(GW)) return;
    if (r.status() >= 400) {
      let body = "";
      try {
        body = (await r.text()).slice(0, 300);
      } catch {}
      chk.network.push(`[${label}] ${r.request().method()} ${u.replace(GW, "")} -> ${r.status()} ${body}`);
    }
  });
  // v1.17 replaced window.confirm/alert with in-page dialogs; a native
  // dialog now is a regression.
  page.on("dialog", async (d) => {
    chk.native.push(`[${label}] NATIVE ${d.type()}: "${d.message()}"`);
    await d.dismiss().catch(() => {});
  });
  void autoRespond(page, chk, label);
  return page;
}

// CSP violations: a securitypolicyviolation listener installed before any
// page script (init script -> binding) plus Chromium's console report
// ("Refused to ... because it violates the following Content Security
// Policy directive") as a backstop for documents the init script misses
// (e.g. a popup's initial about:blank).
async function watchCsp(ctx, chk, label) {
  await ctx.exposeBinding("__e2eCspViolation", ({ page }, v) => {
    const where = page ? page.url() : "?";
    chk.csp.push(`[${label}] ${v.directive} blocked ${v.blocked || "(inline)"} on ${v.doc || where}` +
      (v.src ? ` (${v.src}:${v.line})` : "") + (v.sample ? ` sample="${v.sample}"` : ""));
  });
  await ctx.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      try {
        window.__e2eCspViolation({
          directive: e.effectiveDirective || e.violatedDirective,
          blocked: e.blockedURI, doc: e.documentURI, src: e.sourceFile,
          line: e.lineNumber, sample: e.sample,
        });
      } catch {}
    }, true);
  });
  ctx.on("console", (m) => {
    const t = m.text();
    if (/Content[- ]Security[- ]Policy/i.test(t) || /^Refused to /.test(t)) {
      // data: URIs can be huge: keep the head and the directive at the end.
      const short = t.replace(/(data:[^,'"\s]*,)[^'"\s]{40,}/g, (_, h) => `${h}…`);
      chk.cspConsole.push(`[${label}] ${m.type()}: ${short}`);
    }
  });
}

// Answers the app's confirmation dialog (role=alertdialog) the way the old
// native-dialog handler did: next answer from page.__dialogPolicy (default
// confirm). Scenarios that inspect the dialog themselves set
// page.__manualDialogs = true.
async function autoRespond(page, chk, label) {
  while (!page.isClosed()) {
    try {
      if (!page.__manualDialogs) {
        const dlg = page.locator('[role="alertdialog"]');
        if ((await dlg.count()) > 0 && (await dlg.isVisible())) {
          const info = await dlg.evaluate((el) => ({
            msg: document.getElementById(el.getAttribute("aria-describedby") || "")?.textContent || el.textContent,
            focus: document.activeElement?.textContent?.trim(),
            buttons: [...el.querySelectorAll("button")].map((b) => b.textContent.trim()),
          }));
          const ans = page.__dialogPolicy.length ? page.__dialogPolicy.shift() : true;
          chk.dialogs.push(`[${label}] alertdialog: "${info.msg}" [${info.buttons.join(" | ")}] focus="${info.focus}" -> ${ans ? "confirm" : "cancel"}`);
          await dlg.locator("button").nth(ans ? 1 : 0).click({ timeout: 3000 });
          await dlg.waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
        }
      }
    } catch {
      // page closing / navigating
    }
    await new Promise((r) => setTimeout(r, 80));
  }
}

async function shot(chk, page, name) {
  const file = `${chk.id}-${name}.png`;
  await page.screenshot({ path: path.join(ART, file), fullPage: false });
  chk.shots.push(file);
}

async function login(page, email) {
  await page.goto(`${APP}/login`);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /sign in|entrar/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30000 });
  await waitLoaded(page);
}

async function waitLoaded(page) {
  // DataContext finished loading when the skeleton (no text) is replaced by
  // real content — works for every tab and language.
  await page.waitForFunction(
    () => (document.querySelector("main.app-content")?.innerText || "").trim().length > 40,
    null,
    { timeout: 60000 }
  );
}

// The sidebar starts collapsed (icon-only buttons carry the label in title).
async function gotoTab(page, label) {
  await page.locator(`aside button[title="${label}"], nav button[title="${label}"], button[title="${label}"]`).first().click();
}

// The item modal (role=dialog); confirmations are role=alertdialog.
const modal = (page) => page.locator('.modal-card[role="dialog"]');
const confirmDlg = (page) => page.locator('[role="alertdialog"]');
const nameInput = (page) => modal(page).locator('div:has(> label:text-is("Item Name / Tag")) > input');
const notesArea = (page) => modal(page).locator('div:has(> div:text-is("NOTES")) textarea');
const ifsWoInput = (page) => modal(page).locator('div:has(> label:text-matches("IFS WO|Work Order", "i")) > input').first();


// Scroll whichever element actually scrolls the modal (card or overlay).
async function scrollModal(page, frac) {
  return page.evaluate((frac) => {
    const cands = [document.querySelector(".modal-overlay"), document.querySelector(".modal-card")];
    const el = cands.find((e) => e && /auto|scroll/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 10);
    if (!el) return null;
    el.scrollTop = (el.scrollHeight - el.clientHeight) * frac;
    return { cls: el.className, top: Math.round(el.scrollTop), max: el.scrollHeight - el.clientHeight };
  }, frac);
}

// Success/error toasts live in the role=status live region (v1.17).
async function toastSeen(page, text, timeout = 4000) {
  const t = page.getByRole("status").filter({ hasText: text });
  return t.first().waitFor({ timeout }).then(() => true).catch(() => false);
}

async function openItem(page, name) {
  await gotoTab(page, "Zones & Items");
  const card = page.getByText(name, { exact: true }).first();
  await card.scrollIntoViewIfNeeded();
  await card.click();
  await modal(page).waitFor();
  await page.waitForTimeout(300);
}

async function modalOpen(page) {
  return (await modal(page).count()) > 0 && (await modal(page).isVisible());
}

async function run(id, title, fn) {
  if (ONLY.length && !ONLY.includes(id)) return;
  console.log(`\n== ${id}: ${title}`);
  const chk = new Check(id, title);
  try {
    await fn(chk);
  } catch (e) {
    chk.failures.push(`exception: ${e.message.split("\n")[0]}`);
    console.log(`   ✗ exception: ${e.stack}`);
  }
  if (chk.native.length) chk.failures.push(`native browser dialog(s) shown: ${chk.native.join("; ")}`);
  // Bindings/console events of closing pages may still be in flight.
  await new Promise((r) => setTimeout(r, 200));
  for (const v of [...new Set(chk.csp)]) chk.failures.push(`CSP violation: ${v}`);
  for (const v of [...new Set(chk.cspConsole)]) chk.failures.push(`CSP console: ${v}`);
  chk.status = chk.failures.length ? "FAIL" : "PASS";
  chk.ms = Date.now() - chk.t0;
  console.log(`   => ${chk.status} (${chk.ms} ms)`);
  results.push(chk);
  await ctl.clear();
}

// ================================================================ scenarios
async function main() {
  browser = await chromium.launch({ headless: !HEADED });
  const visibleItems = Number((await one("SELECT count(*) FROM items")).count);

  await run("a", "Login as insp1; dashboard + zones show all >1000 items (paging)", async (c) => {
    const page = await newPage(c, "insp1");
    const t0 = Date.now();
    await login(page, "insp1@test.local");
    c.expect(visibleItems > 1000, `seeded more than 1000 items (${visibleItems})`);
    const kpi = await page.getByText(/\d+\/\d+ inspected/).first().textContent();
    c.expect(kpi.includes(`/${visibleItems} inspected`), `dashboard KPI counts all ${visibleItems} items`, kpi);
    await shot(c, page, "dashboard");
    await gotoTab(page, "Zones & Items");
    const hdr = await page.getByText(/· \d+ items/).first().textContent();
    c.expect(hdr.includes(`${visibleItems} items`), `Zones tab header counts ${visibleItems} items`, hdr);
    await shot(c, page, "zones");
    const log = await ctl.log(t0);
    const pages = log.filter((l) => l.method === "GET" && /\/rest\/v1\/items\?select=/.test(l.url));
    c.expect(pages.length >= 2, `items fetched in >= 2 pages (${pages.length} requests)`, pages.map((p) => p.url));
    await page.context().close();
  });

  await run("b", "New item -> name -> Save -> appears; history shows events", async (c) => {
    const page = await newPage(c, "insp1");
    await login(page, "insp1@test.local");
    await page.locator('button[title="+ New Item"]').first().click();
    await page.locator(".zone-picker").getByText("Main Deck", { exact: true }).click();
    await modal(page).waitFor();
    const newId = (await one(
      "SELECT id FROM items WHERE created_by = $1 AND name = 'Untitled' ORDER BY created_at DESC LIMIT 1",
      [USERS.insp1]
    ))?.id;
    c.expect(!!newId, "draft row created on open", newId);
    await nameInput(page).fill("E2E New Item B");
    await shot(c, page, "new-modal");
    await modal(page).getByRole("button", { name: "Create Item" }).click();
    c.expect(await toastSeen(page, "Item saved"), "success toast 'Item saved'");
    await modal(page).waitFor({ state: "detached", timeout: 15000 });
    const row = await one("SELECT name FROM items WHERE id = $1", [newId]);
    c.expect(row?.name === "E2E New Item B", "DB row renamed", row);
    await openItem(page, "E2E New Item B");
    await page.getByText("HISTORY", { exact: true }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    const histText = await modal(page).locator('div:has(> div:text-is("HISTORY"))').innerText();
    c.expect(/created/i.test(histText), "history panel shows 'created'", histText.slice(0, 300));
    c.expect(/renamed/i.test(histText), "history panel shows 'renamed'", histText.slice(0, 300));
    await shot(c, page, "history");
    const ev = await sql("SELECT action FROM history WHERE item_ref = $1 ORDER BY event_date", [newId]);
    c.step(`history rows: ${ev.map((e) => e.action).join(",")}`);
    await page.context().close();
  });

  await run("c", "Save while REST fails -> modal stays, inline error, input kept; restore -> saves", async (c) => {
    const page = await newPage(c, "insp1");
    await login(page, "insp1@test.local");
    await openItem(page, "E2E Fail Target");
    await notesArea(page).fill("typed during outage");
    // 1) PostgREST answers 503 on PATCH
    await ctl.fault({ method: "PATCH", prefix: "/rest/v1/items", status: 503, times: -1 });
    await modal(page).getByRole("button", { name: "Save", exact: true }).click();
    const alert = modal(page).getByText(/Not saved — your changes are still here/);
    await alert.waitFor({ timeout: 15000 }).catch(() => {});
    c.expect(await modalOpen(page), "modal stays open after failed save");
    c.expect(await alert.isVisible(), "inline 'Not saved' error shown", await modal(page).locator('[role="alert"]').allInnerTexts());
    c.expect((await notesArea(page).inputValue()) === "typed during outage", "typed value preserved", await notesArea(page).inputValue());
    await shot(c, page, "503-error");
    // 2) network-level failure: gateway drops the connection (fetch rejects)
    await ctl.clear();
    await ctl.fault({ method: "PATCH", prefix: "/rest/v1/items", status: 0, times: -1 });
    await modal(page).getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForTimeout(2500);
    c.expect(await modalOpen(page), "modal stays open after network error (connection reset)");
    c.expect((await notesArea(page).inputValue()) === "typed during outage", "typed value preserved after network error");
    const alerts2 = await modal(page).locator('[role="alert"]').allInnerTexts();
    c.expect(alerts2.some((t) => /Not saved/.test(t)), "inline error after network error", alerts2);
    await shot(c, page, "network-error");
    const dbMid = await one("SELECT notes FROM items WHERE id = $1", [ID.fail]);
    c.expect(dbMid.notes === "base note", "nothing written while failing", dbMid);
    // 3) PostgREST process actually down (gateway answers 503 from the proxy)
    await ctl.clear();
    stopPostgrest();
    await new Promise((r) => setTimeout(r, 500));
    await notesArea(page).fill("typed while PostgREST is down");
    await modal(page).getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForTimeout(2500);
    c.expect(await modalOpen(page), "modal stays open while PostgREST is stopped");
    c.expect((await notesArea(page).inputValue()) === "typed while PostgREST is down", "typed value preserved (PostgREST down)");
    const alerts3 = await modal(page).locator('[role="alert"]').allInnerTexts();
    c.expect(alerts3.some((t) => /Not saved/.test(t)), "inline error while PostgREST is down", alerts3);
    await shot(c, page, "postgrest-down");
    await startPostgrest();
    await notesArea(page).fill("typed during outage");
    // 4) restore
    await modal(page).getByRole("button", { name: "Save", exact: true }).click();
    await modal(page).waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
    c.expect(!(await modalOpen(page)), "modal closes after successful retry");
    const db = await one("SELECT notes FROM items WHERE id = $1", [ID.fail]);
    c.expect(db.notes === "typed during outage", "DB has the typed value after retry", db);
    await page.context().close();
  });

  await run("d1", "Conflict -> 'Save my changes on top' keeps the other user's field", async (c) => {
    const page = await newPage(c, "insp1");
    await login(page, "insp1@test.local");
    await openItem(page, "E2E Conflict Target");
    await notesArea(page).fill("mine-notes");
    const insp2 = await apiAs("insp2@test.local");
    const { data: upd, error } = await insp2
      .from("items")
      .update({ ifs_wo: "WO-THEIRS", mechanism: "Pitting Corrosion" })
      .eq("id", ID.conflict)
      .select("updated_at");
    c.expect(!error && upd?.length === 1, "insp2 updated the row via API meanwhile", error?.message);
    await modal(page).getByRole("button", { name: "Save", exact: true }).click();
    const banner = modal(page).getByText(/Someone else changed this item/);
    await banner.waitFor({ timeout: 15000 }).catch(() => {});
    c.expect(await banner.isVisible(), "conflict banner shown");
    let db = await one("SELECT notes, ifs_wo FROM items WHERE id = $1", [ID.conflict]);
    c.expect(db.notes === "base note", "nothing written on conflict", db);
    await shot(c, page, "banner");
    await modal(page).getByRole("button", { name: "Save my changes on top" }).click();
    await modal(page).waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
    c.expect(!(await modalOpen(page)), "modal closes after overwrite");
    db = await one("SELECT notes, ifs_wo, mechanism FROM items WHERE id = $1", [ID.conflict]);
    c.expect(db.notes === "mine-notes", "my field (notes) saved", db);
    c.expect(db.ifs_wo === "WO-THEIRS" && db.mechanism === "Pitting Corrosion", "their fields (ifs_wo, mechanism) preserved", db);
    await page.context().close();
  });

  await run("d2", "Conflict -> 'Discard mine and load theirs'", async (c) => {
    const page = await newPage(c, "insp1");
    await login(page, "insp1@test.local");
    await openItem(page, "E2E Reload Target");
    await notesArea(page).fill("mine-2");
    // Other user's write straight in SQL, as insp2 under RLS.
    const cli = await pool.connect();
    try {
      await cli.query("BEGIN");
      await cli.query("SET LOCAL ROLE authenticated");
      await cli.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [USERS.insp2]);
      const r = await cli.query("UPDATE items SET notes = 'theirs-2' WHERE id = $1 RETURNING 1", [ID.reload]);
      await cli.query("COMMIT");
      c.expect(r.rowCount === 1, "insp2 updated notes via SQL (RLS) meanwhile");
    } finally {
      cli.release();
    }
    await modal(page).getByRole("button", { name: "Save", exact: true }).click();
    const banner = modal(page).getByText(/Someone else changed this item/);
    await banner.waitFor({ timeout: 15000 }).catch(() => {});
    c.expect(await banner.isVisible(), "conflict banner shown");
    await modal(page).getByRole("button", { name: "Discard mine and load theirs" }).click();
    await page.waitForTimeout(300);
    c.expect((await notesArea(page).inputValue()) === "theirs-2", "form now shows their value", await notesArea(page).inputValue());
    c.expect(!(await banner.isVisible()), "banner cleared");
    await shot(c, page, "loaded-theirs");
    await modal(page).getByRole("button", { name: "Save", exact: true }).click();
    await modal(page).waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
    const db = await one("SELECT notes FROM items WHERE id = $1", [ID.reload]);
    c.expect(db.notes === "theirs-2", "DB keeps their value", db);
    await page.context().close();
  });

  await run("e", "Local draft survives a reload -> restore banner -> Restore", async (c) => {
    const page = await newPage(c, "insp1");
    await login(page, "insp1@test.local");
    await openItem(page, "E2E Draft Target");
    await notesArea(page).fill("draft-text-before-reload");
    await page.waitForTimeout(900); // debounce is 400 ms
    const ls = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes("itemDraft")));
    c.expect(ls.length >= 1, "draft mirrored to localStorage", ls);
    await page.reload();
    await waitLoaded(page);
    // v1.16: ?item= is in the URL, so F5 re-opens the modal by itself.
    await modal(page).waitFor({ timeout: 30000 });
    const banner = modal(page).getByText(/Unsaved changes from a previous session were found/);
    await banner.waitFor({ timeout: 5000 }).catch(() => {});
    c.expect(await banner.isVisible(), "restore banner shown");
    c.expect((await notesArea(page).inputValue()) === "base note", "form starts from DB value", await notesArea(page).inputValue());
    await shot(c, page, "banner");
    await modal(page).getByRole("button", { name: "Restore" }).click();
    c.expect((await notesArea(page).inputValue()) === "draft-text-before-reload", "value restored", await notesArea(page).inputValue());
    await modal(page).getByRole("button", { name: "Save", exact: true }).click();
    await modal(page).waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
    const db = await one("SELECT notes FROM items WHERE id = $1", [ID.draft]);
    c.expect(db.notes === "draft-text-before-reload", "restored draft saved", db);
    const left = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes("itemDraft")));
    c.expect(left.length === 0, "draft cleared after save", left);
    await page.context().close();
  });

  await run("f", "Cancel guards: existing item with changes; new item with a reading", async (c) => {
    const page = await newPage(c, "insp1");
    await login(page, "insp1@test.local");
    await openItem(page, "E2E Cancel Target");
    await notesArea(page).fill("will be discarded");
    page.__dialogPolicy = [false]; // first confirm: keep editing
    await modal(page).getByRole("button", { name: "Cancel", exact: true }).click();
    await page.waitForTimeout(300);
    c.expect(c.dialogs.some((d) => /Discard your unsaved changes/.test(d)), "confirm dialog on Cancel with changes", c.dialogs);
    c.expect(await modalOpen(page), "dismissing keeps the modal open");
    c.expect((await notesArea(page).inputValue()) === "will be discarded", "edits kept after dismiss");
    page.__dialogPolicy = [true];
    await modal(page).getByRole("button", { name: "Cancel", exact: true }).click();
    await modal(page).waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
    c.expect(!(await modalOpen(page)), "accepting closes the modal");
    const db = await one("SELECT notes FROM items WHERE id = $1", [ID.cancel]);
    c.expect(db.notes === "base note", "nothing saved", db);

    // New item + reading, then cancel.
    await page.locator('button[title="+ New Item"]').first().click();
    await page.locator(".zone-picker").getByText("Main Deck", { exact: true }).click();
    await modal(page).waitFor();
    const newId = (await one(
      "SELECT id FROM items WHERE created_by = $1 AND name = 'Untitled' ORDER BY created_at DESC LIMIT 1",
      [USERS.insp1]
    ))?.id;
    const depth = modal(page).locator('div:has(> label:text-is("Pit Depth (mm)")) > input');
    await depth.fill("0.4");
    await modal(page).getByRole("button", { name: "+ Reading" }).click();
    await modal(page).getByRole("cell", { name: "0.4", exact: true }).waitFor({ timeout: 10000 }).catch(() => {});
    const nReadings = (await one("SELECT count(*)::int n FROM readings WHERE item_id = $1", [newId])).n;
    c.expect(nReadings === 1, "reading stored on the draft", nReadings);
    await shot(c, page, "new-with-reading");
    const before = c.dialogs.length;
    page.__dialogPolicy = [true];
    await modal(page).getByRole("button", { name: "Cancel", exact: true }).click();
    await modal(page).waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
    c.expect(c.dialogs.slice(before).some((d) => /Discard this new item\? Photos and readings/.test(d)), "confirm dialog mentions attached readings", c.dialogs.slice(before));
    c.expect(!(await modalOpen(page)), "modal closed");
    const gone = await one("SELECT count(*)::int n FROM items WHERE id = $1", [newId]);
    c.expect(gone.n === 0, "draft item deleted", gone);
    const hist = await sql("SELECT action, note FROM history WHERE item_ref = $1", [newId]);
    c.expect(hist.some((h) => h.action === "deleted" && /1 readings/.test(h.note)), "'deleted' event (1 readings) in history", hist);
    c.newDraftId = newId;
    await page.context().close();
  });

  await run("g", "Reading validation: negative / future date rejected; '1,5' accepted as 1.5", async (c) => {
    const page = await newPage(c, "insp1");
    await login(page, "insp1@test.local");
    await openItem(page, "E2E Reading Target");
    const depth = modal(page).locator('div:has(> label:text-is("Pit Depth (mm)")) > input');
    const date = modal(page).locator('div:has(> label:text-is("Date")) > input[type="date"]').first();
    const add = modal(page).getByRole("button", { name: "+ Reading" });
    await depth.fill("-1");
    await add.click();
    c.expect(await modal(page).getByText("Enter a depth between 0 and 999.999 mm.").isVisible(), "negative depth -> validation message");
    await shot(c, page, "negative");
    const future = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    await date.fill(future);
    await depth.fill("1");
    await add.click();
    c.expect(await modal(page).getByText("The reading date cannot be in the future.").isVisible(), "future date -> validation message");
    await shot(c, page, "future");
    let n = (await one("SELECT count(*)::int n FROM readings WHERE item_id = $1", [ID.reading])).n;
    c.expect(n === 0, "no reading stored for invalid input", n);
    const today = await page.evaluate(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    });
    await date.fill(today);
    await depth.fill("1,5");
    await add.click();
    c.expect(await toastSeen(page, "Reading saved"), "success toast 'Reading saved'");
    await modal(page).getByRole("cell", { name: "1.5", exact: true }).waitFor({ timeout: 10000 }).catch(() => {});
    const r = await one("SELECT depth_mm::text d, reading_date::text rd FROM readings WHERE item_id = $1", [ID.reading]);
    c.expect(r?.d === "1.500", "'1,5' stored as 1.500 mm", r);
    c.expect(await modal(page).getByRole("cell", { name: "1.5", exact: true }).isVisible(), "reading row rendered as 1.5");
    await shot(c, page, "comma-ok");
    // Server-side backstop: the CHECK constraint rejects negatives via the API too.
    const api = await apiAs("insp1@test.local");
    const { error } = await api.from("readings").insert({ item_id: ID.reading, reading_date: today, depth_mm: -2 });
    c.expect(!!error && /readings_depth_nonneg/.test(error.message), "API insert of a negative depth rejected by DB", error?.message);
    await page.context().close();
  });

  await run("h", "Evidence photo upload (inspector) + thumbnail; admin deletes it", async (c) => {
    const page = await newPage(c, "insp1");
    await login(page, "insp1@test.local");
    await openItem(page, "E2E Evidence Target");
    const pngPath = path.join(ART, "..", ".state", "tiny.png");
    fs.writeFileSync(pngPath, tinyPng());
    await modal(page).locator('input[type="file"]:not([capture])').setInputFiles(pngPath);
    await modal(page).locator('div:has(> label:text-is("Finding / Description")) > textarea').fill("E2E rust bloom photo");
    await modal(page).getByRole("button", { name: "Save evidence record" }).click();
    c.expect(await toastSeen(page, "Evidence saved", 10000), "success toast 'Evidence saved'");
    const img = modal(page).locator('img[alt="tiny.png"]');
    await img.waitFor({ timeout: 15000 }).catch(() => {});
    c.expect(await img.isVisible(), "evidence thumbnail rendered");
    const nat = await img.evaluate((el) => el.complete && el.naturalWidth).catch(() => 0);
    c.expect(nat === 32, "thumbnail loaded through the signed URL (naturalWidth=32)", nat);
    const src = await img.getAttribute("src").catch(() => "");
    c.expect(/\/storage\/v1\/object\/sign\/evidence-photos\//.test(src || ""), "img src is a signed URL", src);
    await shot(c, page, "uploaded");
    const ev = await one("SELECT id, file_path FROM evidences WHERE item_id = $1", [ID.evidence]);
    c.expect(!!ev?.file_path, "evidence row stored with file_path", ev);
    const obj = await one("SELECT count(*)::int n FROM storage.objects WHERE name = $1", [ev?.file_path]);
    c.expect(obj.n === 1, "storage.objects row inserted under the inspector's RLS", obj);
    const file = path.join(STORAGE_DIR, "evidence-photos", ev?.file_path || "x");
    c.expect(fs.existsSync(file), "file bytes on disk", file);
    // Inspectors see no delete button.
    const evRow = (p) => modal(p).locator('div:has(img[alt="tiny.png"]):has(> button)');
    c.expect((await evRow(page).count()) === 0, "inspector has no evidence delete control");
    await page.context().close();

    const adm = await newPage(c, "admin1");
    await login(adm, "admin1@test.local");
    await openItem(adm, "E2E Evidence Target");
    await modal(adm).locator('img[alt="tiny.png"]').waitFor({ timeout: 15000 }).catch(() => {});
    adm.__dialogPolicy = [true];
    await evRow(adm).locator("> button").click();
    await modal(adm).locator('img[alt="tiny.png"]').waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
    c.expect(c.dialogs.some((d) => /Delete this evidence and its photo/.test(d)), "admin confirm dialog shown", c.dialogs);
    const evAfter = await one("SELECT count(*)::int n FROM evidences WHERE item_id = $1", [ID.evidence]);
    c.expect(evAfter.n === 0, "evidence row deleted", evAfter);
    const h = await sql("SELECT action, prev_value FROM history WHERE item_ref = $1 AND action = 'evidence_deleted'", [ID.evidence]);
    c.expect(h.length === 1 && h[0].prev_value === ev?.file_path, "'evidence_deleted' in history (with file path)", h);
    const objAfter = await one("SELECT count(*)::int n FROM storage.objects WHERE name = $1", [ev?.file_path]);
    c.expect(objAfter.n === 0, "storage.objects row removed", objAfter);
    c.expect(!fs.existsSync(file), "file removed from disk");
    await shot(c, adm, "admin-deleted");
    await adm.context().close();
  });

  await run("i", "Admin deletes an item that has a photo -> row, file gone; 'deleted' event", async (c) => {
    // Photo attached by the inspector through the API (same RLS as the UI path).
    const insp = await apiAs("insp1@test.local");
    const p = `${ID.del}/e2e_${Date.now()}_tiny.png`;
    const up = await insp.storage.from("evidence-photos").upload(p, new Blob([tinyPng()], { type: "image/png" }), { contentType: "image/png" });
    c.expect(!up.error, "inspector uploaded photo to the item folder", up.error?.message);
    const ins = await insp.from("evidences").insert({
      item_id: ID.del, evidence_date: new Date().toISOString().slice(0, 10), description: "to be deleted",
      file_path: p, file_name: "tiny.png", file_type: "image/png", file_size: 100,
    });
    c.expect(!ins.error, "evidence row inserted", ins.error?.message);
    const file = path.join(STORAGE_DIR, "evidence-photos", p);
    c.expect(fs.existsSync(file), "file on disk before delete");

    const adm = await newPage(c, "admin1");
    await login(adm, "admin1@test.local");
    await openItem(adm, "E2E Delete Target");
    await shot(c, adm, "before");
    adm.__dialogPolicy = [true];
    const t0 = Date.now();
    await modal(adm).getByRole("button", { name: "Delete", exact: true }).click();
    await modal(adm).waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
    c.expect(!(await modalOpen(adm)), "modal closed after delete");
    c.expect(c.dialogs.some((d) => /Delete this item\? This cannot be undone/.test(d)), "confirm shown");
    const n = await one("SELECT count(*)::int n FROM items WHERE id = $1", [ID.del]);
    c.expect(n.n === 0, "item row deleted", n);
    const h = await sql("SELECT action, note FROM history WHERE item_ref = $1 AND action = 'deleted'", [ID.del]);
    c.expect(h.length === 1 && /1 evidences/.test(h[0].note), "'deleted' event with evidence count", h);
    await new Promise((r) => setTimeout(r, 500));
    const obj = await one("SELECT count(*)::int n FROM storage.objects WHERE name = $1", [p]);
    c.expect(obj.n === 0, "storage.objects row removed (orphan policy)", obj);
    c.expect(!fs.existsSync(file), "file removed from disk");
    const log = (await ctl.log(t0)).filter((l) => l.kind === "storage-delete");
    c.step(`storage delete calls: ${JSON.stringify(log)}`);
    c.expect((await adm.getByText("E2E Delete Target", { exact: true }).count()) === 0, "item gone from the list");
    await shot(c, adm, "after");
    await adm.context().close();
  });

  await run("j", "Audit log: date filter + CSV export neutralises formulas", async (c) => {
    const adm = await newPage(c, "admin1");
    await login(adm, "admin1@test.local");
    await adm.goto(`${APP}/audit-log`);
    const title = adm.getByText(/^Audit Log \(\d+\)$/);
    await title.waitFor({ timeout: 30000 });
    await adm.getByText("Loading…").waitFor({ state: "detached", timeout: 30000 }).catch(() => {});
    const total = Number((await title.textContent()).match(/\((\d+)\)/)[1]);
    const dbTotal = Number((await one("SELECT count(*) FROM history")).count);
    c.expect(total === dbTotal, `unfiltered log shows all ${dbTotal} events (>1000, paged)`, total);
    await shot(c, adm, "all");
    const dates = adm.locator('input[type="date"]');
    const old = await one("SELECT (min(event_date) AT TIME ZONE 'America/Sao_Paulo')::date::text d FROM history");
    const expOld = Number((await one(
      "SELECT count(*) FROM history WHERE (event_date AT TIME ZONE 'America/Sao_Paulo')::date = $1::date", [old.d]
    )).count);
    await dates.nth(0).fill(old.d);
    await dates.nth(1).fill(old.d);
    await adm.waitForTimeout(1500);
    const f1 = Number((await title.textContent()).match(/\((\d+)\)/)[1]);
    c.expect(f1 === expOld, `date filter ${old.d}..${old.d} -> ${expOld} events`, f1);
    await shot(c, adm, "filtered");
    await dates.nth(0).fill("2020-01-01");
    await dates.nth(1).fill("2020-01-02");
    await adm.waitForTimeout(1500);
    const f0 = Number((await title.textContent()).match(/\((\d+)\)/)[1]);
    c.expect(f0 === 0, "empty range -> 0 events", f0);
    await adm.getByRole("button", { name: "Clear" }).click();
    await adm.waitForTimeout(2000);
    const [dl] = await Promise.all([
      adm.waitForEvent("download", { timeout: 20000 }),
      adm.getByRole("button", { name: "Export CSV" }).click(),
    ]);
    const csvPath = path.join(ART, "j-audit.csv");
    await dl.saveAs(csvPath);
    const csv = fs.readFileSync(csvPath, "utf8");
    const lines = csv.split("\n");
    c.expect(lines.length - 1 === dbTotal, `CSV has ${dbTotal} data rows`, lines.length - 1);
    const noteLine = lines.find((l) => l.includes("notes_changed") && l.includes("1+1"));
    c.expect(!!noteLine, "CSV contains the '=1+1' notes change", noteLine);
    c.expect(!!noteLine && noteLine.includes(",'=1+1,"), "'=1+1' neutralised as '=1+1 (apostrophe prefix)", noteLine);
    c.expect(!!noteLine && noteLine.includes(`"'=HYPERLINK(`), "=HYPERLINK(...) neutralised and quoted", noteLine);
    const cells = lines.flatMap((l) => l.split(","));
    const dangerous = cells.filter((x) => /^"?[=+@]/.test(x));
    c.expect(dangerous.length === 0, "no cell starts with = + @", dangerous.slice(0, 5));
    await adm.context().close();
  });

  await run("k", "Export tab: XLSX 'Change Log' includes a deleted item's events", async (c) => {
    const adm = await newPage(c, "admin1");
    await login(adm, "admin1@test.local");
    await gotoTab(adm, "Export");
    await adm.getByRole("button", { name: /Export XLSX/ }).first().waitFor();
    const [dl] = await Promise.all([
      adm.waitForEvent("download", { timeout: 60000 }),
      adm.getByRole("button", { name: /Export XLSX/ }).first().click(),
    ]);
    const x = path.join(ART, "k-export.xlsx");
    await dl.saveAs(x);
    await shot(c, adm, "export-tab");
    const wb = XLSX.read(fs.readFileSync(x));
    c.expect(wb.SheetNames.includes("Change Log"), "workbook has 'Change Log' sheet", wb.SheetNames);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets["Change Log"]);
    const del = rows.filter((r) => r.Item === "E2E Delete Target");
    c.step(`Change Log rows: ${rows.length}; rows for deleted item: ${del.map((r) => r.Action).join(",")}`);
    c.expect(del.some((r) => r.Action === "deleted"), "deleted item's 'deleted' event exported", del.map((r) => r.Action));
    c.expect(del.some((r) => r.Action === "created"), "deleted item's earlier events exported too", del.map((r) => r.Action));
    const dbCount = Number((await one("SELECT count(*) FROM history")).count);
    c.expect(rows.length === dbCount, `Change Log has all ${dbCount} events (paged past 1000)`, rows.length);
    const items = XLSX.utils.sheet_to_json(wb.Sheets["Items"]);
    c.expect(items.length === Number((await one("SELECT count(*) FROM items")).count), "Items sheet has every item", items.length);
    await adm.context().close();
  });


  // ---------------------------------------------------------- extra probes
  await run("b2", "Create Item with an empty name is refused inline", async (c) => {
    const page = await newPage(c, "insp1");
    await login(page, "insp1@test.local");
    await page.locator('button[title="+ New Item"]').first().click();
    await page.locator(".zone-picker").getByText("Main Deck", { exact: true }).click();
    await modal(page).waitFor();
    const id = (await one("SELECT id FROM items WHERE created_by = $1 AND name = 'Untitled' ORDER BY created_at DESC LIMIT 1", [USERS.insp1]))?.id;
    await modal(page).getByRole("button", { name: "Create Item" }).click();
    c.expect(await modal(page).getByText("Item name is required.").isVisible(), "'Item name is required.' shown");
    c.expect(await modalOpen(page), "modal stays open");
    await shot(c, page, "name-required");
    page.__dialogPolicy = [true];
    await modal(page).getByRole("button", { name: "Cancel", exact: true }).click();
    await modal(page).waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
    const left = await one("SELECT count(*)::int n FROM items WHERE id = $1", [id]);
    const hist = await one("SELECT count(*)::int n FROM history WHERE item_ref = $1", [id]);
    c.expect(left.n === 0 && hist.n === 0, "pristine draft discarded without audit noise", { left, hist });
    c.expect(c.dialogs.length === 0, "no confirm for an untouched new item", c.dialogs);
    await page.context().close();
  });

  await run("c2", "Save whose response is lost after the server committed, then retry", async (c) => {
    const page = await newPage(c, "insp1");
    await login(page, "insp1@test.local");
    await openItem(page, "E2E Lost Response Target");
    await notesArea(page).fill("committed but response lost");
    await ctl.fault({ method: "PATCH", prefix: "/rest/v1/items", mode: "commitThenDrop", times: 1 });
    await modal(page).getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForTimeout(2500);
    const db1 = await one("SELECT notes FROM items WHERE id = $1", [ID.lost]);
    c.expect(db1.notes === "committed but response lost", "server applied the save", db1);
    const log = (await ctl.log(0)).filter((l) => l.method === "PATCH" && l.url.includes(ID.lost));
    c.step(`PATCH attempts seen by the gateway: ${log.length}`);
    let conflictShown = await modal(page).getByText(/Someone else changed this item/).isVisible().catch(() => false);
    let open = await modalOpen(page);
    c.step(`after lost response: modalOpen=${open} conflictBanner=${conflictShown} alerts=${JSON.stringify(open ? await modal(page).locator('[role="alert"]').allInnerTexts() : [])}`);
    await shot(c, page, "after-lost-response");
    if (open && !conflictShown) {
      // Browser didn't auto-retry: the user retries by hand.
      await modal(page).getByRole("button", { name: "Save", exact: true }).click();
      await page.waitForTimeout(2500);
      conflictShown = await modal(page).getByText(/Someone else changed this item/).isVisible().catch(() => false);
      open = await modalOpen(page);
    }
    c.expect(!conflictShown, "no false 'someone else changed this item' for the user's own committed write");
    c.expect(!open, "save reported as success, modal closed");
    await page.context().close();
  });

  await run("d3", "Item deleted by an admin while an inspector edits it", async (c) => {
    const page = await newPage(c, "insp1");
    await login(page, "insp1@test.local");
    await openItem(page, "E2E Deleted Elsewhere Target");
    await notesArea(page).fill("edit on a vanished item");
    const admin = await apiAs("admin1@test.local");
    const { data } = await admin.from("items").delete().eq("id", ID.gone).select("id");
    c.expect(data?.length === 1, "admin deleted the item via API");
    await modal(page).getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForTimeout(2000);
    c.expect(await modalOpen(page), "modal stays open");
    const alerts = await modal(page).locator('[role="alert"]').allInnerTexts();
    c.expect(alerts.some((t) => /deleted by another user/.test(t)), "'deleted by another user' message", alerts);
    c.expect((await notesArea(page).inputValue()) === "edit on a vanished item", "typed text still on screen");
    await shot(c, page, "gone");
    page.__dialogPolicy = [true];
    await modal(page).getByRole("button", { name: "Cancel", exact: true }).click();
    await modal(page).waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
    const ghost = await page.getByText("E2E Deleted Elsewhere Target", { exact: true }).count();
    await shot(c, page, "after-close");
    c.expect(ghost === 0, "deleted item no longer listed after closing the modal",
      `card still listed (${ghost}) — the failed save put the stale copy back into the list`);
    await page.context().close();
  });

  await run("e2", "Restored draft whose base changed on the server -> conflict on Save", async (c) => {
    const page = await newPage(c, "insp1");
    await login(page, "insp1@test.local");
    await openItem(page, "E2E Draft Conflict Target");
    await notesArea(page).fill("stale draft text");
    await page.waitForTimeout(900);
    await page.reload();
    await waitLoaded(page);
    const insp2 = await apiAs("insp2@test.local");
    await insp2.from("items").update({ ifs_wo: "WO-AFTER-DRAFT" }).eq("id", ID.draftConflict);
    await modal(page).waitFor({ timeout: 30000 });
    await modal(page).getByRole("button", { name: "Restore" }).click();
    await modal(page).getByRole("button", { name: "Save", exact: true }).click();
    const banner = modal(page).getByText(/Someone else changed this item/);
    await banner.waitFor({ timeout: 10000 }).catch(() => {});
    c.expect(await banner.isVisible(), "conflict banner shown for a draft based on an older version");
    await shot(c, page, "draft-conflict");
    await modal(page).getByRole("button", { name: "Save my changes on top" }).click();
    await modal(page).waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
    const db = await one("SELECT notes, ifs_wo FROM items WHERE id = $1", [ID.draftConflict]);
    c.expect(db.notes === "stale draft text" && db.ifs_wo === "WO-AFTER-DRAFT", "merge keeps both changes", db);
    await page.context().close();
  });

  await run("f2", "Inspector cancels a new item that already has a photo", async (c) => {
    const page = await newPage(c, "insp1");
    await login(page, "insp1@test.local");
    await page.locator('button[title="+ New Item"]').first().click();
    await page.locator(".zone-picker").getByText("Main Deck", { exact: true }).click();
    await modal(page).waitFor();
    const id = (await one("SELECT id FROM items WHERE created_by = $1 AND name = 'Untitled' ORDER BY created_at DESC LIMIT 1", [USERS.insp1]))?.id;
    const pngPath = path.join(ART, "..", ".state", "tiny.png");
    fs.writeFileSync(pngPath, tinyPng());
    await modal(page).locator('input[type="file"]:not([capture])').setInputFiles(pngPath);
    await modal(page).locator('div:has(> label:text-is("Finding / Description")) > textarea').fill("photo on a draft");
    await modal(page).getByRole("button", { name: "Save evidence record" }).click();
    await modal(page).locator('img[alt="tiny.png"]').waitFor({ timeout: 15000 }).catch(() => {});
    const ev = await one("SELECT file_path FROM evidences WHERE item_id = $1", [id]);
    c.expect(!!ev?.file_path, "photo stored on the draft", ev);
    const file = path.join(STORAGE_DIR, "evidence-photos", ev?.file_path || "x");
    page.__dialogPolicy = [true];
    await modal(page).getByRole("button", { name: "Cancel", exact: true }).click();
    await modal(page).waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
    const n = await one("SELECT count(*)::int n FROM items WHERE id = $1", [id]);
    c.expect(n.n === 0, "draft deleted", n);
    const obj = await one("SELECT count(*)::int n FROM storage.objects WHERE name LIKE $1", [`${id}/%`]);
    c.expect(obj.n === 0 && !fs.existsSync(file), "photo removed (draft-creator storage policy)", obj);
    const h = await sql("SELECT action, note FROM history WHERE item_ref = $1", [id]);
    c.expect(h.some((x) => x.action === "deleted" && /1 evidences/.test(x.note)), "'deleted' event with 1 evidence", h);
    await page.context().close();
  });

  await run("g2", "Reading >= 1000 mm rejected in the form (numeric(6,3) range)", async (c) => {
    const page = await newPage(c, "insp1");
    await login(page, "insp1@test.local");
    await openItem(page, "E2E Reading Target");
    const depth = modal(page).locator('div:has(> label:text-is("Pit Depth (mm)")) > input');
    await depth.fill("1000");
    await modal(page).getByRole("button", { name: "+ Reading" }).click();
    await page.waitForTimeout(1500);
    const alerts = await modal(page).locator('[role="alert"]').allInnerTexts();
    c.expect(alerts.some((t) => /between 0 and 999\.999 mm/.test(t)), "client-side range message shown (v1.16: no raw DB error)", alerts);
    c.expect(c.network.length === 0, "no request reached the API", c.network);
    c.expect((await depth.inputValue()) === "1000", "typed value kept for correction");
    c.step(`message: ${JSON.stringify(alerts)}`);
    await shot(c, page, "overflow");
    await page.context().close();
  });

  await run("h2", "Evidence: upload fails -> no row; row insert fails after upload -> no orphan blob", async (c) => {
    const page = await newPage(c, "insp1");
    await login(page, "insp1@test.local");
    await openItem(page, "E2E Evidence Fail Target");
    const pngPath = path.join(ART, "..", ".state", "tiny.png");
    fs.writeFileSync(pngPath, tinyPng());
    const desc = modal(page).locator('div:has(> label:text-is("Finding / Description")) > textarea');
    await modal(page).locator('input[type="file"]:not([capture])').setInputFiles(pngPath);
    await desc.fill("upload will fail");
    await ctl.fault({ method: "POST", prefix: "/storage/v1/object/evidence-photos", status: 503, times: 1 });
    await modal(page).getByRole("button", { name: "Save evidence record" }).click();
    await page.waitForTimeout(1500);
    const t1 = await modal(page).innerText();
    c.expect(/upload failed|Upload failed|failed/i.test(t1), "upload failure surfaced", t1.match(/.{0,40}failed.{0,60}/i)?.[0]);
    let n = await one("SELECT count(*)::int n FROM evidences WHERE item_id = $1", [ID.evFail]);
    c.expect(n.n === 0, "no evidence row without a file", n);
    c.expect((await desc.inputValue()) === "upload will fail", "form kept for retry");
    await shot(c, page, "upload-failed");
    await ctl.clear();
    // Upload OK but the evidences INSERT fails -> app removes the blob again.
    await ctl.fault({ method: "POST", prefix: "/rest/v1/evidences", status: 503, times: 1 });
    await modal(page).getByRole("button", { name: "Save evidence record" }).click();
    await page.waitForTimeout(2000);
    n = await one("SELECT count(*)::int n FROM evidences WHERE item_id = $1", [ID.evFail]);
    c.expect(n.n === 0, "evidence row not stored", n);
    const objs = await sql("SELECT name FROM storage.objects WHERE name LIKE $1", [`${ID.evFail}/%`]);
    const t2 = await modal(page).innerText();
    c.step(`message: ${t2.match(/.{0,40}not saved.{0,80}/i)?.[0]}`);
    c.expect(objs.length === 0, "uploaded blob cleaned up after the failed row insert (inspector, non-draft item)",
      `orphan storage objects: ${objs.map((o) => o.name).join(", ")}`);
    await shot(c, page, "row-failed");
    await ctl.clear();
    await modal(page).getByRole("button", { name: "Save evidence record" }).click();
    await modal(page).locator('img[alt="tiny.png"]').waitFor({ timeout: 15000 }).catch(() => {});
    const total = await sql("SELECT name FROM storage.objects WHERE name LIKE $1", [`${ID.evFail}/%`]);
    c.step(`after successful retry: ${total.length} storage objects for 1 evidence row`);
    await page.context().close();
  });


  // =================================================== v1.16.0 (field UX)
  const q = (page) => new URL(page.url());
  const hasItemParam = (page) => q(page).searchParams.has("item");
  const dialog = (page) => page.getByRole("dialog").filter({ has: page.locator("h2") });
  const title = async (page) => (await modal(page).locator("h2").first().textContent())?.trim();
  const newDraftId = async () =>
    (await one("SELECT id FROM items WHERE created_by = $1 AND name = 'Untitled' ORDER BY created_at DESC LIMIT 1", [USERS.insp1]))?.id;
  async function newItemFromSidebar(page) {
    await page.locator('button[aria-label="+ New Item"], button[title="+ New Item"]').first().click();
    await page.locator(".zone-picker").getByText("Main Deck", { exact: true }).click();
    await modal(page).waitFor();
    await page.waitForTimeout(300);
    return newDraftId();
  }

  await run("n1", "URL navigation: tabs, ?item=, F5, deep link, unknown id, legacy routes", async (c) => {
    const page = await newPage(c, "insp1");
    await login(page, "insp1@test.local");
    for (const [label, want] of [["Zones & Items", "?tab=zones"], ["Risk Matrix", "?tab=risk"], ["Schedule", "?tab=schedule"], ["Export", "?tab=export"], ["Dashboard", ""]]) {
      await gotoTab(page, label);
      await page.waitForTimeout(300);
      c.expect(page.url() === `${APP}/dashboard${want}`, `tab '${label}' -> /dashboard${want}`, page.url());
    }
    await openItem(page, "E2E Nav Target");
    c.expect(q(page).searchParams.get("item") === ID.nav && q(page).searchParams.get("tab") === "zones", "opening an item pushes ?tab=zones&item=<id>", page.url());
    await page.reload();
    await waitLoaded(page);
    await modal(page).waitFor({ timeout: 10000 }).catch(() => {});
    c.expect((await modalOpen(page)) && (await title(page)) === "E2E Nav Target", "F5 re-opens the same item", await title(page).catch(() => null));
    await shot(c, page, "after-f5");
    const p2 = await page.context().newPage();
    await p2.goto(`${APP}/dashboard?tab=zones&item=${ID.nav}`);
    await modal(p2).waitFor({ timeout: 30000 }).catch(() => {});
    c.expect((await modalOpen(p2)) && (await title(p2)) === "E2E Nav Target", "deep link opens the item");
    await p2.goto(`${APP}/dashboard?tab=zones&item=00000000-0000-0000-0000-00000000dead`);
    await waitLoaded(p2);
    await p2.waitForTimeout(2000);
    c.expect(!hasItemParam(p2) && q(p2).searchParams.get("tab") === "zones", "unknown ?item= dropped from the URL (tab kept)", p2.url());
    c.expect(!(await modalOpen(p2)), "no modal for an unknown id");
    for (const [route, tab] of [["/zones", "zones"], ["/risk-matrix", "risk"], ["/schedule", "schedule"], ["/export", "export"]]) {
      await p2.goto(APP + route);
      await p2.waitForURL(/\/dashboard/, { timeout: 15000 }).catch(() => {});
      c.expect(q(p2).pathname === "/dashboard" && q(p2).searchParams.get("tab") === tab, `${route} redirects to ?tab=${tab}`, p2.url());
    }
    await p2.close();
    // `page` was reloaded with ?item= in the URL: one Cancel must close it.
    await modal(page).getByRole("button", { name: "Cancel", exact: true }).click();
    await page.waitForTimeout(1500);
    const stuck = await modalOpen(page);
    c.expect(!stuck, "after F5, a single Cancel closes the modal",
      `modal still open after Cancel (URL already ${page.url()}); a second Cancel is needed`);
    await shot(c, page, "cancel-after-f5");
    if (stuck) {
      await modal(page).getByRole("button", { name: "Cancel", exact: true }).click();
      await modal(page).waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
    }
    // New item URL carries &new=1
    const id = await newItemFromSidebar(page);
    c.expect(q(page).searchParams.get("item") === id && q(page).searchParams.get("new") === "1", "new item URL has ?item=<id>&new=1", page.url());
    await modal(page).getByRole("button", { name: "Cancel", exact: true }).click();
    await modal(page).waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
    c.expect(!hasItemParam(page), "Cancel removes ?item=", page.url());
    await page.context().close();
  });

  await run("n2", "Browser Back: closes modal; dirty -> confirm (decline keeps it); new draft discarded; fresh ?item= load", async (c) => {
    const page = await newPage(c, "insp1");
    await login(page, "insp1@test.local");
    await openItem(page, "E2E Nav Target");
    await page.goBack();
    await modal(page).waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
    c.expect(!(await modalOpen(page)) && page.url() === `${APP}/dashboard?tab=zones`, "Back closes a clean modal, stays on the tab", page.url());
    await openItem(page, "E2E Nav Target");
    await notesArea(page).fill("back-button edit");
    page.__dialogPolicy = [false];
    await page.goBack();
    await page.waitForTimeout(1200);
    c.expect(c.dialogs.some((d) => /Discard your unsaved changes/.test(d)), "Back with unsaved edits asks first", c.dialogs);
    c.expect(await modalOpen(page), "declining keeps the modal open");
    c.expect(q(page).searchParams.get("item") === ID.nav, "…and the URL still has ?item=", page.url());
    c.expect((await notesArea(page).inputValue()) === "back-button edit", "…with the edits");
    await shot(c, page, "declined");
    page.__dialogPolicy = [true];
    await page.goBack();
    await modal(page).waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
    c.expect(!(await modalOpen(page)) && !hasItemParam(page), "accepting closes it", page.url());
    c.expect(q(page).pathname === "/dashboard", "still inside the app", page.url());
    const db = await one("SELECT notes FROM items WHERE id = $1", [ID.nav]);
    c.expect(db.notes === "base note", "nothing saved", db);
    const before = c.dialogs.length;
    const id = await newItemFromSidebar(page);
    await page.goBack();
    await modal(page).waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1000);
    const n = await one("SELECT count(*)::int n FROM items WHERE id = $1", [id]);
    c.expect(n.n === 0, "Back on a brand-new item discards the draft row", n);
    c.expect(c.dialogs.length === before, "no confirm for an untouched draft", c.dialogs.slice(before));
    const p2 = await page.context().newPage();
    await p2.goto(`${APP}/dashboard?tab=zones&item=${ID.nav}`);
    await modal(p2).waitFor({ timeout: 30000 });
    await p2.goBack();
    await modal(p2).waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
    const st = await p2.evaluate(() => history.state);
    c.expect(!(await modalOpen(p2)), "fresh ?item= page: Back closes the modal",
      `modal still open while the URL is ${p2.url()} (history.state=${JSON.stringify(st)})`);
    if (await modalOpen(p2)) {
      await modal(p2).getByRole("button", { name: "Cancel", exact: true }).click();
      await p2.waitForTimeout(1500);
      c.step(`then Cancel -> ${p2.url()}`);
    }
    c.expect(p2.url() === `${APP}/dashboard?tab=zones`, "…and stays on /dashboard?tab=zones", p2.url());
    // Same in a brand-new tab (a shared link opened from chat/e-mail).
    const p3 = await page.context().newPage();
    await p3.goto(`${APP}/dashboard?tab=zones&item=${ID.nav}`);
    await modal(p3).waitFor({ timeout: 30000 });
    await p3.goBack().catch(() => {});
    await p3.waitForTimeout(1500);
    const open3 = await modalOpen(p3);
    if (open3) {
      await modal(p3).getByRole("button", { name: "Cancel", exact: true }).click().catch(() => {});
      await p3.waitForTimeout(1500);
    }
    c.expect(!open3 && p3.url().startsWith(`${APP}/dashboard`), "new tab via shared link: Back closes the modal and the app stays open",
      `modal open after Back=${open3}; after Cancel the tab is at ${p3.url()}`);
    await shot(c, p3, "shared-link-back");
    await page.context().close();
  });

  await run("n3", "Cancel racing Back never navigates twice", async (c) => {
    const page = await newPage(c, "insp1");
    await login(page, "insp1@test.local");
    // (1) Back first, Cancel a moment later.
    await openItem(page, "E2E Nav Target");
    await page.evaluate(() => {
      history.back();
      setTimeout(() => [...document.querySelectorAll(".modal-card button")].find((b) => b.textContent.trim() === "Cancel")?.click(), 30);
    });
    await page.waitForTimeout(1500);
    c.expect(page.url() === `${APP}/dashboard?tab=zones` && !(await modalOpen(page)), "Back then Cancel: one step back (zones tab)", page.url());
    // (2) Cancel of a NEW item (slow DELETE) and Back while it runs.
    await newItemFromSidebar(page);
    await ctl.fault({ method: "DELETE", prefix: "/rest/v1/items", mode: "delay", delay: 1500, times: 1 });
    await modal(page).getByRole("button", { name: "Cancel", exact: true }).click();
    await page.waitForTimeout(200);
    await page.goBack().catch(() => {});
    await page.waitForTimeout(3000);
    c.expect(page.url() === `${APP}/dashboard?tab=zones`, "Cancel (slow delete) + Back: still on the zones tab", page.url());
    c.expect(!(await modalOpen(page)), "modal closed");
    const alerts = await page.locator('[role="alert"]').allInnerTexts();
    c.step(`alerts after race: ${JSON.stringify(alerts)}`);
    // (3) Same-task Cancel + Back (worst case).
    await openItem(page, "E2E Nav Target");
    await page.evaluate(() => {
      [...document.querySelectorAll(".modal-card button")].find((b) => b.textContent.trim() === "Cancel")?.click();
      history.back();
    });
    await page.waitForTimeout(1500);
    c.expect(q(page).pathname === "/dashboard", "same-task Cancel + Back stays in /dashboard", page.url());
    c.expect(page.url() === `${APP}/dashboard?tab=zones`, "same-task Cancel + Back stays on the zones tab", page.url());
    await page.context().close();
  });

  await run("n4", "Saved item reached via Forward / &new=1 is never deleted on Escape/Cancel", async (c) => {
    const page = await newPage(c, "insp1");
    await login(page, "insp1@test.local");
    const id = await newItemFromSidebar(page);
    await nameInput(page).fill("E2E Forward Saved");
    await modal(page).getByRole("button", { name: "Create Item" }).click();
    await modal(page).waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
    await page.goForward();
    await modal(page).waitFor({ timeout: 10000 }).catch(() => {});
    c.expect(q(page).searchParams.get("new") === "1" && (await modalOpen(page)), "Forward re-opens the item with &new=1 in the URL", page.url());
    c.expect(!(await modal(page).getByRole("button", { name: "Create Item" }).count()), "modal treats it as an existing item (no 'Create Item')");
    await shot(c, page, "forward");
    await page.keyboard.press("Escape");
    await modal(page).waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(800);
    let n = await one("SELECT count(*)::int n FROM items WHERE id = $1", [id]);
    c.expect(n.n === 1, "item still in the DB after Escape", n);
    await page.goto(`${APP}/dashboard?item=${id}&new=1`);
    await modal(page).waitFor({ timeout: 30000 });
    await modal(page).getByRole("button", { name: "Cancel", exact: true }).click();
    await page.waitForTimeout(1000);
    n = await one("SELECT count(*)::int n FROM items WHERE id = $1", [id]);
    c.expect(n.n === 1, "item still in the DB after Cancel on a &new=1 link", n);
    await page.context().close();
  });

  await run("n5", "Deep link while logged out -> /login?next= -> item; open redirect blocked", async (c) => {
    const page = await newPage(c, "anon");
    await page.goto(`${APP}/dashboard?tab=zones&item=${ID.nav}`);
    await page.waitForURL(/\/login/, { timeout: 15000 });
    const next = q(page).searchParams.get("next");
    c.expect(next === `/dashboard?tab=zones&item=${ID.nav}`, "redirected to /login?next=<path+query>", page.url());
    await page.locator('input[type="email"]').fill("insp1@test.local");
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/item=/, { timeout: 30000 }).catch(() => {});
    await modal(page).waitFor({ timeout: 30000 }).catch(() => {});
    c.expect((await modalOpen(page)) && (await title(page)) === "E2E Nav Target", "after login the shared item is open", page.url());
    await shot(c, page, "landed");
    await page.context().close();
    for (const evil of ["https://evil.example", "//evil.example", "/\\evil.example"]) {
      const p = await newPage(c, "anon");
      await p.goto(`${APP}/login?next=${encodeURIComponent(evil)}`);
      await p.locator('input[type="email"]').fill("insp1@test.local");
      await p.locator('input[type="password"]').fill(PASSWORD);
      await p.getByRole("button", { name: /sign in/i }).click();
      await p.waitForTimeout(3000);
      c.expect(p.url().startsWith(`${APP}/dashboard`), `next=${evil} -> lands on /dashboard`, p.url());
      await p.context().close();
    }
  });

  await run("n6", "Modal a11y: dialog semantics, focus trap, Escape, focus return, inert; IFS combobox keys", async (c) => {
    const page = await newPage(c, "insp1");
    await login(page, "insp1@test.local");
    await gotoTab(page, "Zones & Items");
    const card = page.locator("[role=button]", { hasText: "E2E A11y Target" }).first();
    await card.scrollIntoViewIfNeeded();
    await card.focus();
    await page.keyboard.press("Enter");
    await modal(page).waitFor();
    await page.waitForTimeout(300);
    const dlg = page.locator('.modal-card[role="dialog"]');
    c.expect((await dlg.count()) === 1, "modal card has role=dialog");
    c.expect((await dlg.getAttribute("aria-modal")) === "true", "aria-modal=true");
    const lb = await dlg.getAttribute("aria-labelledby");
    const lbText = lb ? await page.evaluate((id) => document.getElementById(id)?.textContent, lb) : null;
    c.expect(lbText === "E2E A11y Target", "aria-labelledby points at the item title", lbText);
    const inDialog = () => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
    c.expect(await inDialog(), "focus moved into the dialog");
    c.expect(await page.evaluate(() => document.getElementById("app-root")?.hasAttribute("inert")), "#app-root is inert while open");
    let escaped = 0;
    for (let i = 0; i < 80; i++) {
      await page.keyboard.press("Tab");
      if (!(await inDialog())) escaped++;
    }
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press("Shift+Tab");
      if (!(await inDialog())) escaped++;
    }
    c.expect(escaped === 0, "Tab x80 / Shift+Tab x15 never leave the dialog", `${escaped} escapes`);
    await page.keyboard.press("Escape");
    await modal(page).waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
    c.expect(!(await modalOpen(page)), "Escape closes a clean modal");
    const focusBack = await page.evaluate(() => (document.activeElement?.textContent || "").includes("E2E A11y Target"));
    c.expect(focusBack, "focus returned to the opener card");
    c.expect(!(await page.evaluate(() => document.getElementById("app-root")?.hasAttribute("inert"))), "inert removed after close");
    await page.keyboard.press("Enter");
    await modal(page).waitFor();
    await notesArea(page).fill("dirty for escape");
    page.__dialogPolicy = [false];
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    c.expect(c.dialogs.some((d) => /Discard your unsaved changes/.test(d)) && (await modalOpen(page)), "Escape when dirty asks; declining keeps it open");
    // IFS combobox
    const combo = modal(page).locator('input[role="combobox"]');
    await combo.scrollIntoViewIfNeeded();
    await combo.fill("pump");
    const lbx = modal(page).getByRole("listbox");
    await lbx.waitFor({ timeout: 10000 }).catch(() => {});
    c.expect(await lbx.isVisible(), "typing opens the IFS listbox");
    await combo.press("ArrowDown");
    c.expect((await combo.getAttribute("aria-activedescendant")) !== null, "ArrowDown sets aria-activedescendant");
    await combo.press("Enter");
    await page.waitForTimeout(300);
    c.expect(!(await lbx.isVisible().catch(() => false)), "Enter closes the listbox");
    c.expect((await modal(page).getByText("OBJ-PUMP-101", { exact: true }).count()) > 0, "Enter picked OBJ-PUMP-101");
    await shot(c, page, "ifs-picked");
    await combo.fill("crane");
    await lbx.waitFor({ timeout: 10000 }).catch(() => {});
    await combo.press("Escape");
    await page.waitForTimeout(400);
    c.expect(!(await lbx.isVisible().catch(() => false)), "Escape closes only the listbox…");
    c.expect(await modalOpen(page), "…not the modal");
    page.__dialogPolicy = [true];
    await page.keyboard.press("Escape");
    await modal(page).waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
    c.expect(!(await modalOpen(page)), "second Escape (accept) closes the modal");
    const db = await one("SELECT ifs_obj_id, notes FROM items WHERE id = $1", [ID.a11y]);
    c.expect(db.ifs_obj_id === null && db.notes === "base note", "discarded edits not saved", db);
    await page.context().close();
  });

  await run("n7", "Mobile 390x844: bottom nav, drawer, 44px controls, sticky footer, name error focus, zone picker", async (c) => {
    const mob = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
    const page = await newPage(c, "insp1-mobile", mob);
    await login(page, "insp1@test.local");
    const bn = page.locator("nav.bottom-nav");
    c.expect(await bn.isVisible(), "bottom nav visible");
    const bnButtons = await bn.locator("button").allInnerTexts();
    c.expect(bnButtons.length === 6, "5 tabs + '+'", bnButtons);
    c.expect((await bn.locator('button[aria-label="+ New Item"]').count()) === 1, "'+' (new item) for inspector");
    c.expect(!(await page.locator(".app-sidebar").isVisible()), "sidebar hidden");
    await shot(c, page, "bottom-nav");
    await page.getByRole("button", { name: "Menu" }).click();
    const drawer = page.locator('.app-sidebar[data-collapsed="false"]');
    c.expect((await drawer.isVisible()) && (await page.locator(".sidebar-backdrop").isVisible()), "hamburger opens the drawer with a backdrop");
    await shot(c, page, "drawer");
    await drawer.getByRole("button", { name: /Zones & Items/ }).click();
    await page.waitForTimeout(400);
    c.expect(!(await page.locator(".app-sidebar").isVisible()) && q(page).searchParams.get("tab") === "zones", "picking a tab closes the drawer", page.url());
    await page.getByRole("button", { name: "Menu" }).click();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    c.expect(!(await page.locator(".app-sidebar").isVisible()), "Escape closes the drawer");
    await page.getByRole("button", { name: "Menu" }).click();
    await page.locator(".sidebar-backdrop").click({ position: { x: 370, y: 400 } });
    await page.waitForTimeout(300);
    c.expect(!(await page.locator(".app-sidebar").isVisible()), "tapping the backdrop closes the drawer");
    const card = page.getByText("E2E Nav Target", { exact: true }).first();
    await card.scrollIntoViewIfNeeded();
    await card.tap();
    await modal(page).waitFor();
    await page.waitForTimeout(400);
    const sizes = await page.evaluate(() => {
      const els = [...document.querySelectorAll(".modal-card input, .modal-card select, .modal-card textarea, .modal-card button")]
        .filter((e) => e.offsetParent !== null && !["file", "checkbox", "radio", "hidden"].includes(e.type));
      return els.map((e) => ({ tag: e.tagName, type: e.type || "", h: Math.round(e.getBoundingClientRect().height), label: (e.getAttribute("aria-label") || e.textContent || e.placeholder || "").trim().slice(0, 30) }));
    });
    const small = sizes.filter((s) => s.h < 44);
    c.expect(small.length === 0, `all ${sizes.length} visible modal controls >= 44px tall`, small.slice(0, 8));
    const save = modal(page).getByRole("button", { name: "Save", exact: true });
    const inView = async () => {
      const b = await save.boundingBox();
      return !!b && b.y >= 0 && b.y + b.height <= 844;
    };
    c.expect(await inView(), "Save visible without scrolling (sticky footer)");
    const sc = await scrollModal(page, 0.5);
    c.step(`scrolled modal container: ${JSON.stringify(sc)}`);
    c.expect(!!sc && sc.top > 200, "modal form actually scrolled to mid-form", sc);
    await page.waitForTimeout(300);
    c.expect(await inView(), "Save still visible mid-form");
    await shot(c, page, "modal-mid");
    await modal(page).getByRole("button", { name: "Cancel", exact: true }).click();
    await modal(page).waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
    await bn.locator('button[aria-label="+ New Item"]').tap();
    const picker = page.locator(".zone-picker");
    await picker.waitFor();
    const pb = await picker.boundingBox();
    c.expect(pb && pb.x >= 0 && pb.x + pb.width <= 390 && pb.y >= 0 && pb.y + pb.height <= 844, "zone picker fits the 390x844 screen", pb);
    await shot(c, page, "zone-picker");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    c.expect(!(await picker.isVisible().catch(() => false)), "Escape closes the zone picker");
    await bn.locator('button[aria-label="+ New Item"]').tap();
    await picker.getByText("Main Deck", { exact: true }).tap();
    await modal(page).waitFor();
    const sc2 = await scrollModal(page, 1);
    c.step(`scrolled to bottom before Create Item: ${JSON.stringify(sc2)}`);
    await page.waitForTimeout(300);
    await modal(page).getByRole("button", { name: "Create Item" }).tap();
    await page.waitForTimeout(900);
    const nameFocus = await page.evaluate(() => {
      const a = document.activeElement;
      const lbl = a?.id ? document.querySelector(`label[for="${CSS.escape(a.id)}"]`)?.textContent : null;
      const r = a?.getBoundingClientRect();
      return { lbl, top: r?.top, bottom: r?.bottom };
    });
    c.expect(nameFocus.lbl === "Item Name / Tag", "name-required focuses the name field", nameFocus);
    c.expect(nameFocus.top >= 0 && nameFocus.bottom <= 844, "…and scrolls it into view", nameFocus);
    c.expect(await modal(page).getByText("Item name is required.").isVisible(), "error text shown");
    await shot(c, page, "name-required");
    await modal(page).getByRole("button", { name: "Cancel", exact: true }).tap();
    await page.context().close();

    const land = await newPage(c, "landscape", { viewport: { width: 740, height: 340 }, hasTouch: true, isMobile: true });
    await land.goto(`${APP}/login`);
    const submit = land.locator('button[type="submit"]');
    const b0 = await submit.boundingBox();
    const scrollable = await land.evaluate(() => {
      const m = document.querySelector("main");
      return m ? { sh: m.scrollHeight, ch: m.clientHeight, oy: getComputedStyle(m).overflowY } : null;
    });
    c.step(`landscape login: submit initially at y=${b0?.y}..${b0 && b0.y + b0.height}, main ${JSON.stringify(scrollable)}`);
    await land.locator('input[type="email"]').fill("insp1@test.local");
    await land.locator('input[type="password"]').fill(PASSWORD);
    await land.locator("main").evaluate((m) => m.scrollTo(0, m.scrollHeight));
    await land.waitForTimeout(300);
    const b1 = await submit.boundingBox();
    c.expect(!!b1 && b1.y >= 0 && b1.y + b1.height <= 340, "landscape 740x340: login scrolls to the submit button", b1);
    await shot(c, land, "landscape-login");
    await submit.tap();
    await land.waitForURL(/\/dashboard/, { timeout: 30000 }).catch(() => {});
    c.expect(land.url().startsWith(`${APP}/dashboard`), "landscape login works");
    await land.context().close();
  });

  await run("n8", "Schedule rows and alert-bar entries open their item", async (c) => {
    const page = await newPage(c, "insp1");
    await login(page, "insp1@test.local");
    await gotoTab(page, "Schedule");
    const row = page.locator("main button", { hasText: "Bulk item" }).first();
    await row.waitFor();
    const rowText = await row.innerText();
    const name = rowText.match(/Bulk item \d{4}/)?.[0];
    await row.click();
    await modal(page).waitFor({ timeout: 5000 }).catch(() => {});
    c.expect((await modalOpen(page)) && (await title(page)) === name, `schedule row opens '${name}'`, await title(page).catch(() => null));
    await modal(page).getByRole("button", { name: "Cancel", exact: true }).click();
    await modal(page).waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
    await gotoTab(page, "Dashboard");
    const alert = page.locator("main button", { hasText: /inspection due in/ }).first();
    await alert.waitFor({ timeout: 10000 });
    const aName = (await alert.innerText()).match(/Bulk item \d{4}/)?.[0];
    await alert.click();
    await modal(page).waitFor({ timeout: 5000 }).catch(() => {});
    c.expect((await modalOpen(page)) && (await title(page)) === aName, `alert entry opens '${aName}'`, await title(page).catch(() => null));
    await shot(c, page, "from-alert");
    await page.context().close();
  });

  await run("n9", "Evidence: 'Take photo' (capture=environment) + 'Gallery / file'; preview thumbnail", async (c) => {
    const page = await newPage(c, "insp1");
    await login(page, "insp1@test.local");
    await openItem(page, "E2E Nav Target");
    const take = modal(page).getByRole("button", { name: /Take photo/ });
    const gal = modal(page).getByRole("button", { name: /Gallery \/ file/ });
    c.expect((await take.isVisible()) && (await gal.isVisible()), "both buttons shown");
    const pngPath = path.join(ART, "..", ".state", "tiny.png");
    fs.writeFileSync(pngPath, tinyPng());
    const [fcCam] = await Promise.all([page.waitForEvent("filechooser", { timeout: 5000 }), take.click()]);
    const camAttrs = await fcCam.element().evaluate((e) => ({ capture: e.getAttribute("capture"), accept: e.accept }));
    c.expect(camAttrs.capture === "environment" && camAttrs.accept === "image/*", "'Take photo' opens an input with capture=environment, accept=image/*", camAttrs);
    await fcCam.setFiles(pngPath);
    const prev = modal(page).locator('img[alt="Selected photo preview"]');
    await prev.waitFor({ timeout: 5000 }).catch(() => {});
    c.expect((await prev.evaluate((i) => i.complete && i.naturalWidth).catch(() => 0)) === 32, "camera pick shows a preview thumbnail");
    const [fcGal] = await Promise.all([page.waitForEvent("filechooser", { timeout: 5000 }), gal.click()]);
    const galAttrs = await fcGal.element().evaluate((e) => ({ capture: e.getAttribute("capture"), accept: e.accept }));
    c.expect(galAttrs.capture === null && /pdf/.test(galAttrs.accept), "'Gallery / file' has no capture and accepts PDF", galAttrs);
    await fcGal.setFiles(pngPath);
    await page.waitForTimeout(300);
    c.expect(await prev.isVisible(), "gallery pick shows the preview");
    await shot(c, page, "preview");
    page.__dialogPolicy = [true];
    await modal(page).getByRole("button", { name: "Cancel", exact: true }).click();
    await page.context().close();
  });

  await run("n10", "Offline: banner (role=status); tabs + open/close item work offline without reload", async (c) => {
    const page = await newPage(c, "insp1");
    await login(page, "insp1@test.local");
    // v1.17 loads each tab's code on first use: visit Zones and Schedule
    // online first (what a user normally does before losing the link).
    await gotoTab(page, "Zones & Items");
    await page.getByText(/· \d+ items/).first().waitFor({ timeout: 15000 });
    await gotoTab(page, "Schedule");
    await page.waitForTimeout(1500);
    await gotoTab(page, "Dashboard");
    await page.waitForTimeout(1000);
    await page.evaluate(() => (window.__marker = 42));
    await page.context().setOffline(true);
    const banner = page.getByRole("status").filter({ hasText: /Offline/ });
    await banner.waitFor({ timeout: 5000 }).catch(() => {});
    c.expect(await banner.isVisible(), "offline banner shown");
    await gotoTab(page, "Zones & Items");
    await page.waitForTimeout(500);
    c.expect(q(page).searchParams.get("tab") === "zones", "tab switch works offline", page.url());
    const card = page.getByText("E2E Nav Target", { exact: true }).first();
    await card.scrollIntoViewIfNeeded();
    await card.click();
    await modal(page).waitFor({ timeout: 5000 }).catch(() => {});
    c.expect(await modalOpen(page), "item opens offline");
    await shot(c, page, "offline-modal");
    await modal(page).getByRole("button", { name: "Cancel", exact: true }).click();
    await modal(page).waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
    c.expect(!(await modalOpen(page)) && !hasItemParam(page), "item closes offline");
    await gotoTab(page, "Schedule");
    await page.waitForTimeout(500);
    c.expect(q(page).searchParams.get("tab") === "schedule", "second tab switch offline", page.url());
    c.expect((await page.evaluate(() => window.__marker)) === 42, "no reload happened (window marker survived)");
    // A tab never opened in this session: its code chunk can't be fetched.
    await gotoTab(page, "Risk Matrix");
    await page.waitForTimeout(3000);
    const main = () => page.locator("main").innerText();
    const broke = /Something went wrong/.test(await main());
    await shot(c, page, "offline-unvisited-tab");
    c.expect(!broke, "offline: a tab not yet visited still opens (or shows an offline notice)",
      "error boundary 'Something went wrong' (ChunkLoadError for the lazy tab chunk)");
    await page.context().setOffline(false);
    await page.waitForTimeout(500);
    c.expect(!(await banner.isVisible().catch(() => false)), "banner hidden when back online");
    if (broke) {
      await gotoTab(page, "Dashboard");
      await page.waitForTimeout(1500);
      c.expect(!/Something went wrong/.test(await main()), "back online: other tabs render again without a reload",
        "error screen persists on the Dashboard tab until 'Try again'");
      const retry = page.getByRole("button", { name: "Try again" });
      if (await retry.count()) { await retry.click(); await page.waitForTimeout(2000); }
      await gotoTab(page, "Risk Matrix");
      await page.waitForTimeout(2500);
      if (await retry.count()) { await retry.click(); await page.waitForTimeout(2500); }
      const riskOk = !/Something went wrong/.test(await main());
      await shot(c, page, "online-retry-risk");
      c.expect(riskOk, "back online: the failed tab recovers with 'Try again'",
        "Risk Matrix stays on the error screen even after 'Try again' online (rejected lazy import is cached) — only a full reload helps");
    }
    await page.context().close();
  });

  await run("n11", "Idle: warning at 28 min, 'Stay signed in' keeps session, 30 min idle -> /login + cookie cleared", async (c) => {
    const page = await newPage(c, "insp1");
    await page.clock.install();
    await login(page, "insp1@test.local");
    await page.waitForTimeout(500);
    await page.clock.fastForward("28:05");
    const toast = page.getByRole("alert").filter({ hasText: "Stay signed in" });
    await toast.waitFor({ timeout: 5000 }).catch(() => {});
    c.expect(await toast.isVisible(), "warning toast at 28 min");
    await shot(c, page, "warning");
    await toast.getByRole("button", { name: "Stay signed in" }).click();
    await page.waitForTimeout(300);
    c.expect(!(await toast.isVisible().catch(() => false)), "toast dismissed");
    await page.clock.fastForward("05:00");
    await page.waitForTimeout(1000);
    c.expect(q(page).pathname === "/dashboard", "session kept 5 min after 'Stay signed in' (33 min since login)", page.url());
    const t0 = Date.now();
    await page.clock.fastForward("30:10");
    await page.waitForURL(/\/login/, { timeout: 20000 }).catch(() => {});
    c.expect(q(page).pathname === "/login", "30 min idle -> redirected to /login", page.url());
    const sb = (await page.context().cookies()).filter((k) => k.name.startsWith("sb-") && k.value);
    c.expect(sb.length === 0, "Supabase session cookie cleared", sb.map((k) => k.name));
    const lo = (await ctl.log(t0)).filter((l) => l.url.startsWith("/auth/v1/logout"));
    c.step(`logout calls: ${JSON.stringify(lo.map((l) => l.url))}`);
    c.expect(lo.every((l) => l.url.includes("scope=local")), "signOut used scope=local");
    await page.context().close();
  });

  await run("n12", "Language PT: <html lang>, cookie, SSR after reload, login in PT, CSV ';' + decimal comma", async (c) => {
    const page = await newPage(c, "admin1");
    await login(page, "admin1@test.local");
    await page.getByRole("button", { name: "PT", exact: true }).click();
    await page.waitForTimeout(500);
    c.expect((await page.evaluate(() => document.documentElement.lang)) === "pt-BR", "<html lang=pt-BR> after switching");
    const ck = (await page.context().cookies()).find((k) => k.name === "ss75-cmp.lang");
    c.expect(ck?.value === "pt", "cookie ss75-cmp.lang=pt", ck);
    const html = await (await page.request.get(`${APP}/dashboard`)).text();
    c.expect(/<html lang="pt-BR"/.test(html), "server renders <html lang=\"pt-BR\"> on reload");
    await page.reload();
    await waitLoaded(page);
    c.expect((await page.locator('button[aria-label="Zonas e Itens"]').count()) === 1, "UI still in PT after reload");
    await shot(c, page, "pt");
    await gotoTab(page, "Exportar");
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.getByRole("button", { name: /^Exportar CSV$/ }).click()]);
    const csvP = path.join(ART, "n12-export-pt.csv");
    await dl.saveAs(csvP);
    const lines = fs.readFileSync(csvP, "utf8").replace(/^﻿/, "").split("\n");
    c.expect(lines[0].split(";").length > 10 && !lines[0].includes(","), "header uses ';' delimiter", lines[0].slice(0, 120));
    const rateRow = lines.find((l) => l.includes("E2E Rate Target")) || "";
    c.expect(/;0,12\d;/.test(rateRow), "corrosion rate written as 0,12x (decimal comma)", rateRow);
    c.expect(!/;\d+\.\d+;/.test(rateRow), "no dot decimals in the row", rateRow);
    await page.goto(`${APP}/audit-log`);
    await page.getByRole("button", { name: /CSV/ }).waitFor();
    await page.waitForTimeout(3000);
    const [dl2] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.getByRole("button", { name: /CSV/ }).click()]);
    const aP = path.join(ART, "n12-audit-pt.csv");
    await dl2.saveAs(aP);
    const a0 = fs.readFileSync(aP, "utf8").replace(/^﻿/, "").split("\n")[0];
    c.expect(a0.split(";").length >= 8, "audit CSV in PT uses ';'", a0);
    await page.context().close();
    const lp = await newPage(c, "anon-pt");
    await lp.context().addCookies([{ name: "ss75-cmp.lang", value: "pt", url: APP }]);
    await lp.goto(`${APP}/login`);
    c.expect((await lp.evaluate(() => document.documentElement.lang)) === "pt-BR", "login page <html lang=pt-BR>");
    c.expect(await lp.getByRole("button", { name: "Entrar" }).isVisible(), "login page in PT ('Entrar')");
    await shot(c, lp, "login-pt");
    await lp.context().close();
  });

  await run("n13", "Contrast spot-check (text3 labels, badges, modal labels) >= 4.5:1", async (c) => {
    const page = await newPage(c, "insp1");
    await login(page, "insp1@test.local");
    const measure = (sel) =>
      page.evaluate((sel) => {
        const parse = (s) => { const m = s.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
        const over = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
        const bgOf = (el) => {
          const layers = [];
          for (let e = el; e; e = e.parentElement) {
            const c = parse(getComputedStyle(e).backgroundColor);
            if (c.a > 0) { layers.push(c); if (c.a >= 1) break; }
          }
          let acc = { r: 255, g: 255, b: 255, a: 1 };
          for (let i = layers.length - 1; i >= 0; i--) acc = over(layers[i], acc);
          return acc;
        };
        const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
        const out = [];
        for (const el of document.querySelectorAll(sel)) {
          if (!el.offsetParent || !(el.textContent || "").trim()) continue;
          const cs = getComputedStyle(el);
          const bg = bgOf(el);
          const fg = over(parse(cs.color), bg);
          const L1 = lum(fg), L2 = lum(bg);
          const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
          const size = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700;
          const large = size >= 24 || (bold && size >= 18.66);
          out.push({ text: el.textContent.trim().slice(0, 30), color: cs.color, ratio: Math.round(ratio * 100) / 100, need: large ? 3 : 4.5 });
          if (out.length >= 40) break;
        }
        return out;
      }, sel);
    const groups = {};
    await page.getByText(/\d+\/\d+ inspected/).first().waitFor({ timeout: 15000 });
    groups["text3 text (dashboard)"] = await measure('main [style*="color: rgb(79, 103, 127)"]');
    await gotoTab(page, "Zones & Items");
    await page.waitForTimeout(500);
    groups["item-card badges"] = await measure('main [role=button] span[style*="border-radius: 5px"]');
    groups["zone header text3"] = await measure('main [style*="color: rgb(79, 103, 127)"]');
    await openItem(page, "E2E Nav Target");
    groups["modal labels"] = await measure(".modal-card label");
    groups["modal section titles"] = await measure('.modal-card div[style*="text-transform: uppercase"]');
    groups["sidebar/topbar text"] = await measure('#app-root nav button, header span, #app-root [style*="color: rgb(157, 181, 204)"]');
    for (const [g, rows] of Object.entries(groups)) {
      const bad = rows.filter((r) => r.ratio < r.need);
      const min = rows.reduce((m, r) => Math.min(m, r.ratio), Infinity);
      c.step(`${g}: ${rows.length} samples, min ${min}`);
      c.expect(rows.length > 0 && bad.length === 0, `${g}: all >= 4.5:1 (3:1 large)`, bad.slice(0, 5));
    }
    await page.context().close();
  });


  // ================================================ v1.17.0 (in-page UI)
  await run("v1", "Confirm dialog (alertdialog) stacked over the item modal", async (c) => {
    const page = await newPage(c, "insp1");
    page.__manualDialogs = true;
    await login(page, "insp1@test.local");
    await openItem(page, "E2E A11y Target");
    await notesArea(page).fill("typed before the confirm");
    await modal(page).getByRole("button", { name: "Cancel", exact: true }).click();
    const dlg = confirmDlg(page);
    await dlg.waitFor({ timeout: 5000 });
    const a = await dlg.evaluate((el) => {
      const txt = (id) => (id ? document.getElementById(id)?.textContent : null);
      return {
        role: el.getAttribute("role"), modal: el.getAttribute("aria-modal"),
        name: txt(el.getAttribute("aria-labelledby")), desc: txt(el.getAttribute("aria-describedby")),
        focus: document.activeElement?.textContent?.trim(), focusInside: el.contains(document.activeElement),
        buttons: [...el.querySelectorAll("button")].map((b) => b.textContent.trim()),
      };
    });
    c.step(`alertdialog: ${JSON.stringify(a)}`);
    c.expect(a.role === "alertdialog" && a.modal === "true", "role=alertdialog, aria-modal=true", a);
    c.expect(a.name === "Confirm" && a.desc === "Discard your unsaved changes?", "accessible name = title, description = the message", a);
    c.expect(a.focusInside && a.focus === "Cancel", "focus starts on Cancel", a.focus);
    c.expect(JSON.stringify(a.buttons) === JSON.stringify(["Cancel", "Discard"]), "buttons Cancel / Discard", a.buttons);
    const onTop = await page.evaluate(() => {
      const b = [...document.querySelectorAll('[role="alertdialog"] button')][0];
      const r = b.getBoundingClientRect();
      return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === b;
    });
    c.expect(onTop, "dialog is painted above the item modal");
    await shot(c, page, "stacked");
    let out = 0;
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press(i % 3 === 2 ? "Shift+Tab" : "Tab");
      if (!(await dlg.evaluate((el) => el.contains(document.activeElement)))) out++;
    }
    c.expect(out === 0, "Tab / Shift+Tab stay inside the confirm dialog", `${out} escapes`);
    await page.keyboard.press("Escape");
    await dlg.waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
    c.expect(!(await dlg.count()), "Escape closes the confirm (= Cancel)");
    c.expect(await modalOpen(page), "…while the item modal behind stays open");
    c.expect((await notesArea(page).inputValue()) === "typed before the confirm", "…with the typed text");
    c.expect(await page.evaluate(() => document.getElementById("app-root")?.hasAttribute("inert")), "#app-root still inert (item modal open)");
    // Escape on the item modal opens the confirm; a 2nd Escape closes only the confirm.
    await notesArea(page).focus();
    await page.keyboard.press("Escape");
    await dlg.waitFor({ timeout: 3000 }).catch(() => {});
    c.expect((await dlg.count()) === 1, "Escape on the dirty item modal asks (alertdialog)");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    c.expect(!(await dlg.count()) && (await modalOpen(page)), "second Escape closes only the confirm");
    await modal(page).getByRole("button", { name: "Cancel", exact: true }).click();
    await dlg.waitFor({ timeout: 3000 });
    await dlg.getByRole("button", { name: "Discard" }).click();
    await modal(page).waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
    c.expect(!(await modalOpen(page)), "'Discard' closes the item modal");
    const db = await one("SELECT notes FROM items WHERE id = $1", [ID.a11y]);
    c.expect(db.notes === "base note", "nothing saved", db);
    // Destructive confirm (admin delete) is labelled 'Delete'.
    await page.context().close();
    const adm = await newPage(c, "admin1");
    adm.__manualDialogs = true;
    await login(adm, "admin1@test.local");
    await openItem(adm, "E2E A11y Target");
    await modal(adm).getByRole("button", { name: "Delete", exact: true }).click();
    const d2 = confirmDlg(adm);
    await d2.waitFor({ timeout: 5000 });
    const b2 = await d2.locator("button").allInnerTexts();
    c.expect(b2[1] === "Delete" && /cannot be undone/.test(await d2.innerText()), "delete confirm: message + 'Delete' button", b2);
    await adm.keyboard.press("Escape");
    await adm.waitForTimeout(500);
    const still = await one("SELECT count(*)::int n FROM items WHERE id = $1", [ID.a11y]);
    c.expect(still.n === 1 && (await modalOpen(adm)), "Escape on the delete confirm keeps the item (and the modal)");
    await adm.context().close();
  });

  await run("v2", "Success toasts: item / reading / evidence saved (role=status, polite)", async (c) => {
    const page = await newPage(c, "insp1");
    await login(page, "insp1@test.local");
    const live = await page.evaluate(() => [...document.querySelectorAll('[role="status"]')].map((e) => e.getAttribute("aria-live")));
    c.expect(live.includes("polite"), "a polite role=status live region exists", live);
    await openItem(page, "E2E Rate Target");
    await modal(page).locator('div:has(> label:text-is("Pit Depth (mm)")) > input').fill("1.2");
    await modal(page).getByRole("button", { name: "+ Reading" }).click();
    c.expect(await toastSeen(page, "Reading saved"), "'Reading saved'");
    await modal(page).locator('div:has(> label:text-is("Finding / Description")) > textarea').fill("toast evidence (no file)");
    await modal(page).getByRole("button", { name: "Save evidence record" }).click();
    c.expect(await toastSeen(page, "Evidence saved"), "'Evidence saved'");
    await notesArea(page).fill("toast check");
    await modal(page).getByRole("button", { name: "Save", exact: true }).click();
    c.expect(await toastSeen(page, "Item saved"), "'Item saved'");
    await shot(c, page, "toast");
    await page.waitForTimeout(5000);
    c.expect(!(await page.getByRole("status").filter({ hasText: "Item saved" }).count()), "toast disappears after ~4 s");
    await page.context().close();
  });

  await run("v3", "Export tab + SheetJS prefetched when idle (usable offline); failure -> error toast, no alert()", async (c) => {
    const page = await newPage(c, "admin1");
    const js = [];
    page.on("request", (r) => { if (r.url().includes("/_next/static/chunks/")) js.push({ t: Date.now(), u: r.url().replace(APP, "") }); });
    await login(page, "admin1@test.local");
    const tIdle = Date.now();
    await page.waitForTimeout(4000);
    const idleChunks = js.filter((x) => x.t >= tIdle).map((x) => x.u);
    c.step(`chunks prefetched after the first screen: ${idleChunks.length}`);
    c.expect(idleChunks.length > 0, "tab chunks + SheetJS are prefetched after the first screen", idleChunks);
    const t0 = Date.now();
    await gotoTab(page, "Export");
    const xbtn = page.getByRole("button", { name: /Export XLSX/ }).first();
    await xbtn.waitFor({ timeout: 15000 });
    const tabChunks = js.filter((x) => x.t >= t0).map((x) => x.u);
    c.step(`chunks loaded on opening Export: ${tabChunks.length}`);
    c.expect(tabChunks.length === 0, "opening Export needs no download (prefetched)", tabChunks);
    const t1 = Date.now();
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), xbtn.click()]);
    const x = path.join(ART, "v3-export.xlsx");
    await dl.saveAs(x);
    const clickChunks = js.filter((q2) => q2.t >= t1).map((q2) => q2.u);
    c.step(`chunks loaded on clicking Export XLSX: ${JSON.stringify(clickChunks)}`);
    c.expect(clickChunks.length === 0, "exporting needs no download (SheetJS prefetched)", clickChunks);
    const wb = XLSX.read(fs.readFileSync(x));
    c.expect(["Items", "Readings", "Evidences", "Change Log"].every((n) => wb.SheetNames.includes(n)), "workbook has all 4 sheets", wb.SheetNames);
    // Failure path: history query rejected -> error toast (was window.alert).
    await ctl.fault({ method: "GET", prefix: "/rest/v1/history", status: 400, times: 1, body: { code: "E2E", message: "history unavailable", details: null, hint: null } });
    await xbtn.click();
    c.expect(await toastSeen(page, /XLSX export failed/, 10000), "error toast 'XLSX export failed: …'");
    await shot(c, page, "xlsx-fail-toast");
    c.expect(c.native.length === 0, "no native alert()", c.native);
    await page.context().close();
  });

  // ------------------------------------------- batch 2 (C1, C2, B2, B3, D1)
  // Scenario ids name the change they cover (c2ban = C2, …); r1-r3 = C1.

  await run("b2ai", "B2: photo analysis API refuses viewers (403); inspectors pass the role gate", async (c) => {
    const role403 = "Photo analysis is available to admins and inspectors.";
    const post = (page) =>
      page.request.post(`${APP}/api/ai/analyze-photo`, {
        headers: { Origin: APP },
        data: { image: "data:image/png;base64," + tinyPng().toString("base64"), mimeType: "image/png" },
      });
    const v = await newPage(c, "viewer1");
    await login(v, "viewer1@test.local");
    const rv = await post(v);
    const bv = await rv.json().catch(() => ({}));
    c.expect(rv.status() === 403 && bv.error === role403, "viewer -> 403 with the role message", { status: rv.status(), body: bv });
    await v.context().close();
    const i = await newPage(c, "insp1");
    await login(i, "insp1@test.local");
    const ri = await post(i);
    const bi = await ri.json().catch(() => ({}));
    c.step(`inspector -> ${ri.status()} ${JSON.stringify(bi).slice(0, 200)}`);
    c.expect(ri.status() !== 403 && bi.error !== role403, "inspector is not refused by the role gate (no Gemini key here, so a later 4xx/5xx is fine)", { status: ri.status(), body: bi });
    await i.context().close();
  });

  await run("b3dept", "B3: department filter drives Risk Matrix, Schedule and Export (scope radios, file name, rows)", async (c) => {
    const DEPT = "Third Party";
    const deptZones = await sql("SELECT zid, name FROM zones WHERE system = $1", [DEPT]);
    const zids = new Set(deptZones.map((z) => z.zid));
    const znames = new Set(deptZones.map((z) => z.name));
    const cnt = async (where, p = []) => Number((await one(`SELECT count(*) FROM items i JOIN zones z ON z.zid = i.zone_id WHERE ${where}`, p)).count);
    const allActive = await cnt("NOT coalesce(i.archived, false)");
    const deptActive = await cnt("z.system = $1 AND NOT coalesce(i.archived, false)", [DEPT]);
    const deptAll = await cnt("z.system = $1", [DEPT]);
    const allItems = Number((await one("SELECT count(*) FROM items")).count);
    const deptSched = await cnt("z.system = $1 AND NOT coalesce(i.archived, false) AND i.next_insp IS NOT NULL AND i.next_insp <= current_date + 90", [DEPT]);
    c.step(`${DEPT}: zones ${[...zids].join(",")}; ${deptActive} active / ${deptAll} items; ${deptSched} in the 90-day schedule; all: ${allActive} active / ${allItems}`);

    const page = await newPage(c, "admin1");
    await login(page, "admin1@test.local");
    const pills = page.locator('[role="group"][aria-label="Department filter"] button');
    const assessed = async () => {
      const txt = await page.getByText(/\d+ of \d+ items assessed/).first().textContent();
      return Number(txt.match(/of (\d+) items/)[1]);
    };
    await gotoTab(page, "Risk Matrix");
    c.expect((await assessed()) === allActive, `Risk Matrix, All: ${allActive} items`, await assessed());

    await pills.filter({ hasText: DEPT }).click();
    await page.waitForTimeout(300);
    c.expect((await pills.filter({ hasText: DEPT }).getAttribute("aria-pressed")) === "true", `'${DEPT}' pressed in the top bar`);
    c.expect((await assessed()) === deptActive, `Risk Matrix, ${DEPT}: ${deptActive} items`, await assessed());
    const riskZones = await page.locator("main").evaluate((m) =>
      [...m.querySelectorAll("div")].filter((d) => !d.children.length).map((d) => d.textContent || "").filter((t) => / \| P:\d x C:\d$/.test(t)).map((t) => t.replace(/ \| P:.*$/, ""))
    );
    c.expect(riskZones.length > 0 && riskZones.every((z) => znames.has(z)), `high-risk list only has ${DEPT} zones (${riskZones.length} rows)`, [...new Set(riskZones)]);
    await shot(c, page, "risk");

    await gotoTab(page, "Schedule");
    await page.locator("main button", { hasText: " | " }).first().waitFor({ timeout: 10000 }).catch(() => {});
    const schedZids = await page.locator("main button", { hasText: " | " }).evaluateAll((bs) => bs.map((b) => (b.innerText.match(/\bZ\d{2}\b/) || ["?"])[0]));
    c.expect(schedZids.length === deptSched, `Schedule, ${DEPT}: ${deptSched} rows`, schedZids.length);
    c.expect(schedZids.every((z) => zids.has(z)), `Schedule rows only from ${[...zids].join(",")}`, [...new Set(schedZids)]);
    await shot(c, page, "schedule");

    await gotoTab(page, "Export");
    const onlyDept = page.getByRole("radio", { name: `Only ${DEPT}` });
    const allDept = page.getByRole("radio", { name: "All departments" });
    await onlyDept.waitFor({ timeout: 10000 }).catch(() => {});
    c.expect((await onlyDept.count()) === 1 && (await allDept.count()) === 1, "Export shows 'Only <dept>' / 'All departments' radios");
    c.expect((await onlyDept.isChecked().catch(() => false)) && !(await allDept.isChecked().catch(() => true)), "default is 'Only <dept>'");
    await shot(c, page, "export-scope");
    const csvRows = async (tag) => {
      const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.getByRole("button", { name: /^Export CSV$/ }).click()]);
      const f = path.join(ART, `b3dept-${tag}.csv`);
      await dl.saveAs(f);
      const rows = parseCsv(fs.readFileSync(f, "utf8").replace(/^\uFEFF/, ""));
      const head = rows.shift();
      return { name: dl.suggestedFilename(), zones: rows.map((r) => r[head.indexOf("Zone")]) };
    };
    const d = await csvRows("dept");
    c.expect(/^ss75-cmp_third-party_\d{4}-\d{2}-\d{2}\.csv$/.test(d.name), "CSV file name carries the department", d.name);
    c.expect(d.zones.length === deptAll && d.zones.every((z) => zids.has(z)), `CSV has only the ${deptAll} ${DEPT} rows`, { rows: d.zones.length, zones: [...new Set(d.zones)] });
    const xlsx = async (tag) => {
      const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.getByRole("button", { name: /Export XLSX/ }).first().click()]);
      const f = path.join(ART, `b3dept-${tag}.xlsx`);
      await dl.saveAs(f);
      const wb = XLSX.read(fs.readFileSync(f));
      return { name: dl.suggestedFilename(), items: XLSX.utils.sheet_to_json(wb.Sheets["Items"]), log: XLSX.utils.sheet_to_json(wb.Sheets["Change Log"]) };
    };
    const deptHist = Number((await one(
      "SELECT count(*) FROM history h JOIN items i ON i.id = h.item_id JOIN zones z ON z.zid = i.zone_id WHERE z.system = $1", [DEPT]
    )).count);
    const allHist = Number((await one("SELECT count(*) FROM history")).count);
    const orphanHist = Number((await one("SELECT count(*) FROM history WHERE item_id IS NULL")).count);
    const xd = await xlsx("dept");
    c.expect(/^ss75-cmp_third-party_\d{4}-\d{2}-\d{2}\.xlsx$/.test(xd.name), "XLSX file name carries the department", xd.name);
    c.expect(xd.items.length === deptAll, `XLSX Items sheet: ${deptAll} ${DEPT} rows`, xd.items.length);
    c.expect(xd.log.length === deptHist, `XLSX Change Log: only the ${deptHist} events of ${DEPT} items (no deleted-item events)`, { rows: xd.log.length, deleted: xd.log.filter((r) => r.Item === "E2E Delete Target").length });
    await allDept.check();
    const xa = await xlsx("all");
    c.expect(xa.log.length === allHist, `'All departments' XLSX Change Log keeps all ${allHist} events (incl. ${orphanHist} of deleted items)`, xa.log.length);
    const a = await csvRows("all");
    c.expect(/^ss75-cmp_\d{4}-\d{2}-\d{2}\.csv$/.test(a.name), "'All departments' -> plain file name", a.name);
    c.expect(a.zones.length === allItems && new Set(a.zones).size > zids.size, `'All departments' exports all ${allItems} rows`, a.zones.length);
    await pills.filter({ hasText: /^All$/ }).click();
    await page.waitForTimeout(300);
    c.expect((await page.getByRole("radio").count()) === 0, "with 'All' in the top bar the scope radios are hidden");
    await page.context().close();
  });

  await run("d1rate", "D1: corrosion rate needs 2 readings at the same point >= 90 days apart", async (c) => {
    const unit = (await one("SELECT id FROM units WHERE code = 'SS-75'")).id;
    const cases = [
      { id: "00000000-0000-0000-0000-0000000e2e10", name: "E2E Rate 30 Days", r: [[30, 1.0, "P1"], [0, 1.1, "P1"]], rate: null },
      { id: "00000000-0000-0000-0000-0000000e2e11", name: "E2E Rate 120 Days", r: [[120, 1.0, "P1"], [0, 1.2, "P1"]], rate: "0.608" },
      { id: "00000000-0000-0000-0000-0000000e2e12", name: "E2E Rate Two Points", r: [[200, 1.0, "P1"], [0, 1.3, "P2"]], rate: null },
      { id: "00000000-0000-0000-0000-0000000e2e13", name: "E2E Rate Same Point Spelling", r: [[100, 1.0, "Frame 7"], [0, 1.1, " frame  7 "]], rate: "0.365" },
    ];
    for (const k of cases) {
      await sql(
        `INSERT INTO items (id, unit_id, zone_id, name, status, prob, cons, created_by)
         VALUES ($1, $2, 'Z13', $3, 'Attention', 2, 2, $4) ON CONFLICT (id) DO NOTHING`,
        [k.id, unit, k.name, USERS.insp2]
      );
      for (const [ago, mm, loc] of k.r) {
        await sql("INSERT INTO readings (item_id, reading_date, depth_mm, location) VALUES ($1, current_date - $2::int, $3, $4)", [k.id, ago, mm, loc]);
      }
    }
    const page = await newPage(c, "insp1");
    await login(page, "insp1@test.local");
    for (const k of cases) {
      await openItem(page, k.name);
      const hint = modal(page).getByText(/^Corrosion rate: not enough data yet/);
      const rateBox = modal(page).getByText("Pit Growth Rate", { exact: true });
      await modal(page).getByRole("cell", { name: String(k.r[1][1].toFixed(1)), exact: true }).first().waitFor({ timeout: 10000 }).catch(() => {});
      if (k.rate === null) {
        c.expect((await hint.count()) === 1 && (await rateBox.count()) === 0, `'${k.name}': 'not enough data' hint, no rate`, { hint: await hint.count(), rate: await rateBox.count() });
      } else {
        const shown = new RegExp(k.rate.replace(".", "\\.") + "\\s*mm/yr").test(await modal(page).innerText());
        c.expect((await hint.count()) === 0 && (await rateBox.count()) === 1 && shown, `'${k.name}': rate ${k.rate} mm/yr shown, no hint`, { hint: await hint.count(), rate: await rateBox.count(), shown });
      }
      await shot(c, page, k.id.slice(-2));
      await modal(page).getByRole("button", { name: "Cancel", exact: true }).click();
      await modal(page).waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
    }
    await page.context().close();
  });

  // C1 helpers: the fake GoTrue keeps "sent" emails; per-user passwords and
  // bans live in auth.users and are put back after each scenario.
  const mailsSince = async (t) => (await fetch(`${GW}/__ctl/mail?since=${t}`)).json();
  const signInApi = async (email, password) => {
    const cl = createClient(GW, process.env.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    return (await cl.auth.signInWithPassword({ email, password })).error;
  };
  const resetForm = (page) => page.getByLabel("New password", { exact: true });
  const invalidMsg = (page) => page.getByText(/This reset link is invalid/);

  await run("r2", "C1: /auth/reset without tokens (even signed in) refuses; expired link on /login is forwarded; Site-URL fallback forwarded", async (c) => {
    const anon = await newPage(c, "anon");
    await anon.goto(`${APP}/auth/reset`);
    await invalidMsg(anon).waitFor({ timeout: 15000 }).catch(() => {});
    c.expect(await invalidMsg(anon).isVisible(), "no tokens -> invalid-link message");
    c.expect((await anon.locator('input[type="password"]').count()) === 0, "no password form");
    await anon.context().close();

    const insp = await newPage(c, "insp1");
    await login(insp, "insp1@test.local");
    await insp.goto(`${APP}/auth/reset`);
    await invalidMsg(insp).waitFor({ timeout: 15000 }).catch(() => {});
    c.expect(await invalidMsg(insp).isVisible() && (await insp.locator('input[type="password"]').count()) === 0, "signed in, no tokens -> still invalid, no form");
    await shot(c, insp, "signed-in-no-token");
    await insp.goto(`${APP}/auth/reset?code=${crypto.randomUUID()}`);
    await invalidMsg(insp).waitFor({ timeout: 15000 }).catch(() => {});
    c.expect(await invalidMsg(insp).isVisible() && (await insp.locator('input[type="password"]').count()) === 0, "?code= (PKCE) is not accepted -> invalid, no form");
    // Someone else's recovery link opened on this signed-in device, landing
    // on /dashboard: forwarded to /auth/reset, tokens gone from the URL.
    const tr = Date.now();
    await fetch(`${GW}/auth/v1/recover?redirect_to=${encodeURIComponent(`${APP}/auth/reset`)}`, {
      method: "POST", headers: { apikey: process.env.ANON_KEY, "content-type": "application/json" }, body: JSON.stringify({ email: "viewer1@test.local" }),
    });
    const [vm] = await mailsSince(tr);
    const loc = (await fetch(vm.action_link, { redirect: "manual" })).headers.get("location") || "";
    const frag = loc.slice(loc.indexOf("#"));
    c.expect(/type=recovery/.test(frag) && /access_token=/.test(frag), "recovery fragment obtained from the email link", loc.slice(0, 80));
    await insp.goto(`${APP}/dashboard${frag}`);
    await insp.waitForURL(/\/auth\/reset/, { timeout: 20000 }).catch(() => {});
    await resetForm(insp).waitFor({ timeout: 20000 }).catch(() => {});
    c.expect(q(insp).pathname === "/auth/reset" && (await resetForm(insp).isVisible()), "recovery hash on /dashboard (other user signed in) -> forwarded, form shown", insp.url());
    c.expect(!/access_token|refresh_token|type=recovery/.test(insp.url()), "tokens gone from the URL", insp.url());
    const who = (await sessionFromCookies(insp))?.user?.email;
    c.step(`session in this browser after the forward: ${who}`);
    c.expect(who === "viewer1@test.local", "the browser's session is now the link's user (viewer1), not insp1", who);
    await shot(c, insp, "dashboard-forwarded");
    await insp.context().close();

    const exp = await newPage(c, "anon-expired");
    await exp.goto(`${APP}/login#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`);
    await exp.waitForURL(/\/auth\/reset/, { timeout: 15000 }).catch(() => {});
    await invalidMsg(exp).waitFor({ timeout: 15000 }).catch(() => {});
    c.expect(q(exp).pathname === "/auth/reset", "/login forwards the error fragment to /auth/reset", exp.url());
    c.expect(await invalidMsg(exp).isVisible() && (await exp.locator('input[type="password"]').count()) === 0, "expired link -> invalid message, no form");
    c.expect(!/error_code|otp_expired/.test(exp.url()), "error params stripped from the URL", exp.url());
    await shot(c, exp, "expired");
    await exp.context().close();

    // A redirect_to outside the allow list falls back to the Site URL (the
    // app root) with the tokens in the fragment -> / -> /login -> /auth/reset.
    const t0 = Date.now();
    const rr = await fetch(`${GW}/auth/v1/recover?redirect_to=${encodeURIComponent("https://elsewhere.example/auth/reset")}`, {
      method: "POST", headers: { apikey: process.env.ANON_KEY, "content-type": "application/json" }, body: JSON.stringify({ email: "insp2@test.local" }),
    });
    const [m] = (await mailsSince(t0)).filter((x) => x.email === "insp2@test.local");
    c.expect(rr.status === 200 && m?.redirect_to === APP, "not-allowed redirect -> link falls back to the Site URL", m);
    const fb = await newPage(c, "insp2-mail");
    await fb.goto(m.action_link);
    await resetForm(fb).waitFor({ timeout: 20000 }).catch(() => {});
    c.expect(q(fb).pathname === "/auth/reset" && (await resetForm(fb).isVisible()), "Site-URL link is forwarded to /auth/reset and the form is ready", fb.url());
    c.expect(!/access_token|refresh_token/.test(fb.url()), "tokens not left in the URL", fb.url());
    await shot(c, fb, "site-url-fallback");
    await fb.context().close();
  });

  await run("r3", "C1: 'Forgot password?' — empty email hint; neutral confirmation; mail only for active accounts; link works on any device", async (c) => {
    const page = await newPage(c, "anon");
    await page.goto(`${APP}/login`);
    const forgot = page.getByRole("button", { name: "Forgot password?" });
    const email = page.locator('input[type="email"]');
    await forgot.click();
    const hint = page.getByRole("alert").filter({ hasText: "Type your email above" });
    await hint.waitFor({ timeout: 5000 }).catch(() => {});
    c.expect(await hint.isVisible(), "empty email -> hint to type the email first");
    const sentTxt = "If this email has an active account, a reset link is on its way.";
    const sent = page.getByRole("status").filter({ hasText: sentTxt });
    const ask = async (addr) => {
      const t = Date.now();
      await email.fill(addr);
      const [resp] = await Promise.all([
        page.waitForResponse((r) => r.url().endsWith("/api/auth/forgot"), { timeout: 15000 }),
        forgot.click(),
      ]);
      await sent.waitFor({ timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(300);
      return { status: resp.status(), shown: await sent.isVisible(), mails: await mailsSince(t) };
    };
    try {
      const unknown = await ask("nobody@test.local");
      c.expect(unknown.status === 200 && unknown.shown, "unknown email -> neutral confirmation", unknown);
      c.expect(!(await hint.isVisible().catch(() => false)), "hint cleared");
      c.expect(unknown.mails.length === 0, "no email for an unknown address", unknown.mails);
      await sql("UPDATE profiles SET active = false WHERE email = 'viewer1@test.local'");
      const inactive = await ask("viewer1@test.local");
      c.expect(inactive.status === 200 && inactive.shown, "inactive account -> the same neutral confirmation", inactive);
      c.expect(inactive.mails.length === 0, "no email for an inactive account", inactive.mails);
      const active = await ask("Insp1@Test.local");
      c.expect(active.status === 200 && active.shown, "active account (mixed case) -> neutral confirmation", active);
      const m = active.mails[0];
      c.expect(active.mails.length === 1 && m.email === "insp1@test.local", "one email for the active account", active.mails);
      c.expect(m?.requested_redirect_to === `${APP}/auth/reset`, `redirect requested: ${APP}/auth/reset`, m?.requested_redirect_to);
      await shot(c, page, "sent");
      // Implicit flow: the link works in another browser (e.g. the Mail app's).
      const other = await newPage(c, "other-device");
      await other.goto(m.action_link);
      await resetForm(other).waitFor({ timeout: 20000 }).catch(() => {});
      c.expect(q(other).pathname === "/auth/reset" && (await resetForm(other).isVisible()), "link opened in another browser -> new-password form", other.url());
      c.expect(!/access_token|refresh_token/.test(other.url()), "tokens removed from the URL", other.url());
      await shot(c, other, "other-device");
      await other.context().close();
    } finally {
      await sql("UPDATE profiles SET active = true WHERE email = 'viewer1@test.local'");
    }
    await page.context().close();
  });

  await run("r1", "C1: admin 'Reset PW' -> email to /auth/reset -> new password (validation) -> dashboard; old password refused", async (c) => {
    const EMAIL = "viewer1@test.local";
    const NEWPW = "N3w-Passw0rd!";
    try {
      const adm = await newPage(c, "admin1");
      await login(adm, "admin1@test.local");
      await adm.goto(`${APP}/users`);
      const row = adm.locator("tr", { hasText: EMAIL });
      await row.waitFor({ timeout: 30000 });
      const t0 = Date.now();
      await row.getByRole("button", { name: "Reset PW" }).click();
      await adm.getByText("Password reset email sent.").waitFor({ timeout: 15000 }).catch(() => {});
      c.expect(await adm.getByText("Password reset email sent.").isVisible(), "'Password reset email sent.' shown");
      const mails = (await mailsSince(t0)).filter((m) => m.email === EMAIL);
      c.expect(mails.length === 1, "one recovery email sent", mails);
      const m = mails[0];
      c.expect(m?.requested_redirect_to === `${APP}/auth/reset`, `redirect requested: ${APP}/auth/reset`, m?.requested_redirect_to);
      await shot(c, adm, "users");
      await adm.context().close();

      const u = await newPage(c, "viewer1-mail");
      await u.goto(m.action_link);
      await resetForm(u).waitFor({ timeout: 20000 }).catch(() => {});
      c.expect(q(u).pathname === "/auth/reset" && (await resetForm(u).isVisible()), "link opens /auth/reset with the form", u.url());
      c.expect(!/access_token|refresh_token|type=recovery/.test(u.url()), "tokens removed from the URL", u.url());
      const pw2 = u.getByLabel("Repeat the new password");
      const save = u.getByRole("button", { name: "Save new password" });
      const alert = u.locator('form [role="alert"]');
      await resetForm(u).fill("short1");
      await pw2.fill("short1");
      await save.click();
      c.expect(/at least 8 characters/.test(await alert.innerText().catch(() => "")), "too short -> 'at least 8 characters'", await alert.allInnerTexts());
      await resetForm(u).fill(NEWPW);
      await pw2.fill(NEWPW + "x");
      await save.click();
      c.expect(/don't match/.test(await alert.innerText().catch(() => "")), "mismatch -> 'don't match'", await alert.allInnerTexts());
      await resetForm(u).fill(PASSWORD);
      await pw2.fill(PASSWORD);
      await save.click();
      await alert.filter({ hasText: /different from the current/ }).waitFor({ timeout: 10000 }).catch(() => {});
      c.expect(/Choose a password different from the current one/.test(await alert.innerText().catch(() => "")), "same as the current password -> translated 'same_password' message", await alert.allInnerTexts());
      const pre = await one("SELECT encrypted_password FROM auth.users WHERE email = $1", [EMAIL]);
      c.expect(pre.encrypted_password === null, "nothing changed server-side on invalid input");
      await shot(c, u, "mismatch");
      await resetForm(u).fill(NEWPW);
      await pw2.fill(NEWPW);
      await save.click();
      await u.getByText("Password changed. Opening the app…").waitFor({ timeout: 10000 }).catch(() => {});
      c.expect(await u.getByText("Password changed. Opening the app…").isVisible().catch(() => false), "'Password changed' shown");
      await u.waitForURL(/\/dashboard/, { timeout: 20000 }).catch(() => {});
      c.expect(q(u).pathname === "/dashboard", "lands on /dashboard", u.url());
      await waitLoaded(u).catch(() => {});
      c.expect(!/access_token|refresh_token/.test(u.url()), "no tokens in the final URL", u.url());
      const hist = await u.evaluate(() => history.length);
      c.step(`history entries in the reset tab: ${hist}`);
      await shot(c, u, "dashboard");
      await u.context().close();

      const oldErr = await signInApi(EMAIL, PASSWORD);
      c.expect(!!oldErr && /Invalid login credentials/.test(oldErr.message), "old password refused", oldErr?.message);
      const newErr = await signInApi(EMAIL, NEWPW);
      c.expect(!newErr, "new password works", newErr?.message);
      const again = await newPage(c, "viewer1-again");
      await again.goto(m.action_link);
      await invalidMsg(again).waitFor({ timeout: 15000 }).catch(() => {});
      c.expect(await invalidMsg(again).isVisible(), "the email link works only once (second use -> invalid)", again.url());
      await again.context().close();
    } finally {
      await sql("UPDATE auth.users SET encrypted_password = NULL WHERE email = $1", [EMAIL]);
    }
  });

  await run("c2ban", "C2: deactivating a signed-in inspector ends the session (no refresh, no sign-in); reactivating allows sign-in", async (c) => {
    const EMAIL = "insp2@test.local";
    try {
      const insp = await newPage(c, "insp2");
      await login(insp, EMAIL);
      const adm = await newPage(c, "admin1");
      await login(adm, "admin1@test.local");
      await adm.goto(`${APP}/users`);
      const row = adm.locator("tr", { hasText: EMAIL });
      await row.waitFor({ timeout: 30000 });
      // Ban call fails -> 502, nothing changed, same action offered again.
      await ctl.fault({ method: "PUT", prefix: "/auth/v1/admin/users/", status: 500, times: 1, body: { code: 500, error_code: "unexpected_failure", msg: "Unexpected failure" } });
      await row.getByRole("button", { name: "Deactivate" }).click();
      const failMsg = adm.getByText("Could not update the user's sign-in access. Try again.");
      await failMsg.waitFor({ timeout: 15000 }).catch(() => {});
      c.expect(await failMsg.isVisible(), "ban failure -> 'Could not update the user's sign-in access' shown");
      const st0 = await one("SELECT p.active, u.banned_until FROM profiles p JOIN auth.users u ON u.id = p.id WHERE p.email = $1", [EMAIL]);
      c.expect(st0.active === true && st0.banned_until === null, "ban failure -> profile unchanged (still active, not banned)", st0);
      await row.getByRole("button", { name: "Deactivate" }).waitFor({ timeout: 5000 }).catch(() => {});
      c.expect((await row.getByRole("button", { name: "Deactivate" }).count()) === 1, "row still offers 'Deactivate' (retry)");
      await shot(c, adm, "ban-failed");
      await ctl.clear();
      await row.getByRole("button", { name: "Deactivate" }).click();
      await adm.getByText("User deactivated.").waitFor({ timeout: 15000 }).catch(() => {});
      c.expect(await adm.getByText("User deactivated.").isVisible(), "'User deactivated.' shown", await adm.locator("main").innerText().then((t) => t.slice(0, 300)));
      const st = await one("SELECT p.active, u.banned_until > now() + interval '10 years' AS banned FROM profiles p JOIN auth.users u ON u.id = p.id WHERE p.email = $1", [EMAIL]);
      c.expect(st.active === false && st.banned === true, "profile inactive and auth user banned", st);
      await shot(c, adm, "deactivated");

      // The inspector's browser still holds a session: its tokens are refused.
      const sess = await sessionFromCookies(insp);
      c.expect(!!sess?.refresh_token, "inspector's session cookie read");
      const rf = await fetch(`${GW}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST", headers: { apikey: process.env.ANON_KEY, "content-type": "application/json" }, body: JSON.stringify({ refresh_token: sess?.refresh_token }),
      });
      const rfb = await rf.json().catch(() => ({}));
      c.expect(rf.status === 400 && rfb.error_code === "user_banned", "token refresh refused (user_banned)", { status: rf.status, body: rfb });
      const items = await fetch(`${GW}/rest/v1/items?select=id&limit=5`, { headers: { apikey: process.env.ANON_KEY, Authorization: `Bearer ${sess?.access_token}` } });
      const rows = await items.json().catch(() => null);
      c.expect(Array.isArray(rows) && rows.length === 0, "REST with the old access token returns no rows (RLS: inactive)", { status: items.status, rows });
      await insp.reload();
      await insp.waitForURL(/\/login/, { timeout: 20000 }).catch(() => {});
      c.expect(q(insp).pathname === "/login", "inspector's next page load -> /login", insp.url());
      await shot(c, insp, "kicked-out");
      await insp.locator('input[type="email"]').fill(EMAIL);
      await insp.locator('input[type="password"]').fill(PASSWORD);
      await insp.getByRole("button", { name: /sign in/i }).click();
      // The login form's own alert: Next's route announcer is also an
      // (empty) role=alert, so an unscoped locator can resolve before the
      // sign-in answer arrives.
      const err = insp.locator('form [role="alert"]');
      await err.filter({ hasText: /\S/ }).first().waitFor({ timeout: 10000 }).catch(() => {});
      const errText = (await err.allInnerTexts()).join(" | ");
      c.step(`sign-in error shown: "${errText}"`);
      c.expect(/This account is deactivated\. Contact your administrator\./.test(errText) && q(insp).pathname === "/login", "new sign-in refused: 'This account is deactivated…', stays on /login", { errText, url: insp.url() });
      await shot(c, insp, "signin-refused");

      await row.getByRole("button", { name: "Activate" }).click();
      await adm.getByText("User activated.").waitFor({ timeout: 15000 }).catch(() => {});
      const st2 = await one("SELECT p.active, u.banned_until FROM profiles p JOIN auth.users u ON u.id = p.id WHERE p.email = $1", [EMAIL]);
      c.expect(st2.active === true && st2.banned_until === null, "reactivated: profile active, ban lifted", st2);
      await adm.context().close();
      await insp.getByRole("button", { name: /sign in/i }).click();
      await insp.waitForURL(/\/dashboard/, { timeout: 30000 }).catch(() => {});
      c.expect(q(insp).pathname === "/dashboard", "sign-in works again after reactivation", insp.url());
      await waitLoaded(insp).catch(() => {});
      await insp.getByText(/\d+\/\d+ inspected/).first().waitFor({ timeout: 15000 }).catch(() => {});
      await shot(c, insp, "signed-in-again");
      c.expect((await insp.getByText(/\d+\/\d+ inspected/).count()) > 0, "data visible again", await insp.locator("main").innerText().catch(() => "").then((t) => t.slice(0, 200)));
      await insp.context().close();
    } finally {
      await sql("UPDATE profiles SET active = true WHERE email = $1", [EMAIL]);
      await sql("UPDATE auth.users SET banned_until = NULL WHERE email = $1", [EMAIL]);
    }
  });

  // ------------------------------------------------- C3: Content-Security-Policy
  // Every scenario above already runs under the enforced CSP and fails on
  // any violation; these check the policy itself, the PDF export (wasm,
  // photos, blob: tab) and the static offline page / service worker.

  const cspOf = (h) => h["content-security-policy"] || "";
  const directive = (csp, name) => (csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(name + " ")) || "");
  const nonceOf = (csp) => (directive(csp, "script-src").match(/'nonce-([^']+)'/) || [])[1] || null;

  await run("csp1", "C3: pages get a per-request nonce CSP; every server-rendered script carries it; all tabs render with no violation", async (c) => {
    const page = await newPage(c, "admin1");
    const lr = await page.goto(`${APP}/login`);
    const lcsp = cspOf(lr.headers());
    c.expect(!!nonceOf(lcsp) && /'strict-dynamic'/.test(lcsp), "/login response: CSP with a nonce + 'strict-dynamic'", lcsp);
    // What the middleware skips (API, images, their 404 pages) gets the
    // locked-down static policy — exactly one CSP header, never none.
    for (const path of ["/api/does-not-exist", "/nope.png", "/icon.svg"]) {
      const res = await fetch(`${APP}${path}`);
      const policy = res.headers.get("content-security-policy") ?? "";
      c.expect(/^default-src 'none'/.test(policy), `${path}: locked CSP`, policy);
    }
    // The service worker's own CSP must let it fetch the app (same origin).
    const swPolicy = (await fetch(`${APP}/sw.js`)).headers.get("content-security-policy");
    c.expect(swPolicy === "default-src 'self'", "/sw.js: same-origin CSP", swPolicy);
    await login(page, "admin1@test.local");
    const r1 = await page.request.get(`${APP}/dashboard`);
    const r2 = await page.request.get(`${APP}/dashboard`);
    const csp1 = cspOf(r1.headers()), csp2 = cspOf(r2.headers());
    const n1 = nonceOf(csp1), n2 = nonceOf(csp2);
    c.step(`CSP: ${csp1}`);
    const ss = directive(csp1, "script-src");
    c.expect(!!n1 && !!n2 && n1 !== n2, "a fresh nonce per response", { n1, n2 });
    c.expect(!/'unsafe-inline'|'unsafe-eval'/.test(ss), "script-src has no 'unsafe-inline' / 'unsafe-eval'", ss);
    c.expect(directive(csp1, "connect-src").includes(GW) && directive(csp1, "img-src").includes(GW), "connect-src / img-src list the project's Supabase origin", csp1);
    const html = await r1.text();
    const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
    const bad = scripts.filter((t) => !t.includes(`nonce="${n1}"`));
    c.step(`${scripts.length} <script> tags in the SSR HTML`);
    c.expect(scripts.length > 0 && bad.length === 0, "every <script> in the HTML carries the response's nonce", bad.slice(0, 5));
    const preloads = [...html.matchAll(/<link\b[^>]*rel="(?:preload|modulepreload)"[^>]*as="script"[^>]*>/g)].map((m) => m[0]);
    const badPre = preloads.filter((t) => !t.includes(`nonce="${n1}"`));
    c.step(`${preloads.length} script preloads; without nonce: ${badPre.length}`);
    // Anonymous responses: the auth redirect and the static offline page.
    const red = await fetch(`${APP}/dashboard`, { redirect: "manual" });
    c.expect(red.status === 307 && !!nonceOf(red.headers.get("content-security-policy") || ""), "auth redirect (307) also carries the CSP", { status: red.status, csp: red.headers.get("content-security-policy") });
    const off = await fetch(`${APP}/offline.html`);
    const offCsp = off.headers.get("content-security-policy") || "";
    c.expect(/script-src 'none'/.test(offCsp), "/offline.html gets its own script-free CSP", offCsp);
    for (const u of ["/api/does-not-exist", "/nope.png"]) {
      const r = await fetch(`${APP}${u}`);
      const ct = r.headers.get("content-type") || "";
      c.step(`${u} -> ${r.status} ${ct.split(";")[0]}; CSP: ${r.headers.get("content-security-policy") ? "yes" : "NONE"}`);
    }
    // Client-side: every tab (chunks loaded by the nonced bootstrap under
    // 'strict-dynamic') and an item modal; the init-script listener fails
    // the scenario on any violation.
    for (const t of ["Zones & Items", "Risk Matrix", "Schedule", "Export", "Dashboard"]) {
      await gotoTab(page, t);
      await page.waitForTimeout(1200);
      await waitLoaded(page).catch(() => {});
    }
    await openItem(page, "E2E Evidence Target");
    await page.keyboard.press("Escape");
    // Admin pages (links, not tabs), the reset page, a 404 and an RSC
    // (client-side) navigation back to the dashboard.
    for (const u of ["/users", "/audit-log", "/auth/reset", "/no-such-page"]) {
      const r = await page.goto(`${APP}${u}`);
      c.expect(!!nonceOf(cspOf(r.headers())), `${u} (${r.status()}) has the nonce CSP`, cspOf(r.headers()));
      await page.waitForTimeout(1500);
    }
    await page.goto(`${APP}/users`);
    await page.locator('a[href="/dashboard"], a[href^="/dashboard?"]').first().click().catch(() => {});
    await page.waitForURL(/\/dashboard/, { timeout: 15000 }).catch(() => {});
    await page.goto(`${APP}/dashboard`);
    await waitLoaded(page);
    const nonceDom = await page.evaluate(() => [...document.scripts].filter((s) => !s.nonce && !s.src.includes("/_next/static/")).length);
    c.expect(nonceDom === 0, "no inline script without a nonce in the live DOM", nonceDom);
    await shot(c, page, "dashboard");
    c.expect(c.csp.length === 0 && c.cspConsole.length === 0, "no CSP violation while browsing every tab", [...c.csp, ...c.cspConsole].slice(0, 5));
    await page.context().close();
  });

  await run("csp2", "C3: PDF export with a photo under the real CSP (wasm layout, signed-URL download, blob: tab)", async (c) => {
    const page = await newPage(c, "insp1");
    const info = [];
    page.context().on("console", (m) => { if (/\[pdf\]/.test(m.text())) info.push(m.text()); });
    // Keep the PDF blob the app hands to URL.createObjectURL for inspection.
    await page.context().addInitScript(() => {
      const orig = URL.createObjectURL;
      URL.createObjectURL = function (b) {
        if (b && b.type === "application/pdf") window.__e2ePdf = b;
        return orig.call(URL, b);
      };
    });
    await login(page, "insp1@test.local");
    await openItem(page, "E2E Evidence Target");
    const pngPath = path.join(ART, "..", ".state", "tiny.png");
    fs.writeFileSync(pngPath, tinyPng());
    await modal(page).locator('input[type="file"]:not([capture])').setInputFiles(pngPath);
    const prev = modal(page).locator('img[src^="blob:"]');
    await prev.first().waitFor({ timeout: 10000 }).catch(() => {});
    c.expect(await prev.first().evaluate((el) => el.complete && el.naturalWidth === 32).catch(() => false), "blob: preview of the picked photo renders");
    await modal(page).locator('div:has(> label:text-is("Finding / Description")) > textarea').fill("E2E CSP photo");
    await modal(page).getByRole("button", { name: "Save evidence record" }).click();
    c.expect(await toastSeen(page, "Evidence saved", 10000), "evidence saved");
    const img = modal(page).locator('img[alt="tiny.png"]');
    await img.waitFor({ timeout: 15000 }).catch(() => {});
    c.expect(await img.evaluate((el) => el.complete && el.naturalWidth === 32).catch(() => false), "signed Supabase storage URL image loads (img-src)");
    await page.keyboard.press("Escape");
    await modal(page).waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
    await gotoTab(page, "Export");
    const pbtn = page.getByRole("button", { name: /Export PDF/ }).first();
    await pbtn.waitFor({ timeout: 15000 });
    const [popup] = await Promise.all([page.waitForEvent("popup", { timeout: 15000 }), pbtn.click()]);
    const dlP = popup.waitForEvent("download", { timeout: 240000 }).catch(() => null);
    const pdfInfo = await page.waitForFunction(() => window.__e2ePdf, null, { timeout: 240000, polling: 500 })
      .then(() => page.evaluate(async () => {
        const b = window.__e2ePdf;
        const u8 = new Uint8Array(await b.arrayBuffer());
        let bin = ""; for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
        return { size: b.size, b64: btoa(bin) };
      }))
      .catch((e) => ({ error: e.message.split("\n")[0] }));
    if (pdfInfo.b64) {
      const buf = Buffer.from(pdfInfo.b64, "base64");
      fs.writeFileSync(path.join(ART, "csp2-export.pdf"), buf);
      const txt = buf.toString("latin1");
      c.expect(txt.startsWith("%PDF-"), "PDF blob produced (%PDF- header)", { size: pdfInfo.size });
      c.expect(/\/Subtype\s*\/Image/.test(txt), "the PDF embeds an image (the evidence photo)");
    } else {
      c.expect(false, "PDF blob produced", pdfInfo);
    }
    c.step(`console: ${info.join(" | ")}`);
    c.expect(info.some((t) => /rendering \d+ items, [1-9]\d* photos/.test(t)), "at least one photo loaded into the PDF", info);
    // Headless Chromium has no PDF viewer: the tab's navigation to the
    // blob: URL becomes a download (headed: the tab shows the PDF).
    const dl = await Promise.race([dlP, new Promise((r) => setTimeout(() => r(null), 15000))]);
    const popUrl = popup.isClosed() ? "(closed)" : popup.url();
    c.step(`popup url: ${popUrl}; download: ${dl ? dl.url().slice(0, 60) : "none"}`);
    c.expect((dl && dl.url().startsWith("blob:")) || popUrl.startsWith("blob:"), "the export tab was sent to the blob: PDF (viewer or download)", { popUrl, dl: dl && dl.url() });
    c.expect(!(await toastSeen(page, /PDF export failed/, 500)), "no 'PDF export failed' toast");
    await page.waitForTimeout(1500);
    await shot(c, page, "exported");
    await page.context().close();
    await sql("DELETE FROM evidences WHERE item_id = $1", [ID.evidence]).catch(() => {});
  });

  await run("csp3", "C3: /offline.html directly — script-free CSP, no violation, 'Retry' reloads", async (c) => {
    const page = await newPage(c, "anon");
    // A query string must survive 'Retry' (deep links like ?item=).
    const r = await page.goto(`${APP}/offline.html?keep=1`);
    const h = r.headers();
    c.step(`CSP: ${cspOf(h)}`);
    c.expect(/script-src 'none'/.test(cspOf(h)) && !/nonce-/.test(cspOf(h)), "offline CSP (script-src 'none')", cspOf(h));
    await page.getByRole("heading", { name: "Sem conexão" }).waitFor({ timeout: 5000 });
    await page.evaluate(() => { window.__e2eMarker = 1; }).catch(() => {}); // script-src 'none' doesn't bind evaluate
    const nav = page.waitForEvent("framenavigated", { timeout: 10000 });
    await page.getByRole("link", { name: /Retry/ }).click();
    await nav;
    await page.getByRole("heading", { name: "Sem conexão" }).waitFor({ timeout: 5000 });
    const marker = await page.evaluate(() => window.__e2eMarker ?? null);
    c.expect(marker === null, "'Retry' reloaded the page (a fresh document)", marker);
    c.step(`after retry: ${page.url()}`);
    c.expect(new URL(page.url()).pathname === "/offline.html", "reloaded the same path", page.url());
    c.expect(new URL(page.url()).search === "?keep=1", "kept the query string", page.url());
    await shot(c, page, "offline");
    await page.context().close();

    // Served by the service worker as the navigation fallback: SW
    // registration under worker-src 'self', the cached copy keeps its CSP,
    // and 'Retry' reloads the URL the user was on.
    const sw = await newPage(c, "anon-sw", { serviceWorkers: "allow" });
    await sw.goto(`${APP}/login`);
    const reg = await sw.evaluate(() => Promise.race([
      navigator.serviceWorker.ready.then((r) => (r.active ? r.active.state : "no-active")),
      new Promise((res) => setTimeout(() => res("timeout"), 15000)),
    ]));
    c.expect(reg === "activated" || reg === "activating", "service worker registered and active", reg);
    await sw.reload();
    const controlled = await sw.evaluate(() => !!navigator.serviceWorker.controller);
    c.expect(controlled, "page controlled by the service worker");
    const cached = await sw.evaluate(async () => {
      const r = await caches.match("/offline.html");
      return r ? { csp: r.headers.get("content-security-policy") || "", html: (await r.text()).includes('<a class="retry" href="">') } : null;
    });
    c.expect(!!cached && /script-src 'none'/.test(cached.csp) && cached.html, "SW precached /offline.html with its script-free CSP", cached);
    // Offline, including the SW's own fetch (see the env flag at the top).
    const target = `${APP}/login?next=%2Fzones`;
    await sw.context().setOffline(true);
    const res = await sw.goto(target).catch((e) => ({ err: e.message.split("\n")[0] }));
    if (res && res.err) {
      c.step(`offline navigation not served by the SW in this browser: ${res.err}`);
    } else {
      const shown = await sw.getByRole("heading", { name: "Sem conexão" }).isVisible().catch(() => false);
      c.expect(shown, "offline fallback page served by the SW", await sw.locator("body").innerText().catch(() => ""));
      c.expect(/script-src 'none'/.test(cspOf(res.headers())), "fallback response keeps the offline CSP", cspOf(res.headers()));
      await shot(c, sw, "sw-offline");
      await sw.context().setOffline(false);
      await Promise.all([sw.waitForEvent("framenavigated", { timeout: 15000 }), sw.getByRole("link", { name: /Retry/ }).click()]);
      await sw.locator('input[type="email"]').waitFor({ timeout: 15000 }).catch(() => {});
      c.expect(await sw.locator('input[type="email"]').isVisible(), "'Retry' back online loads the app page", sw.url());
      const u = new URL(sw.url());
      c.step(`after retry: ${sw.url()}`);
      c.expect(u.pathname === "/login", "retry stays on the path the user was on", sw.url());
      if (u.searchParams.get("next") !== "/zones") c.step(`NOTE: the GET form dropped the query string (was ?next=%2Fzones, now '${u.search}')`);
    }
    await sw.context().setOffline(false);
    await sw.context().close();
  });

  // ------------------------------------------------------------------ C4
  await run("c4rl", "C4: shared rate limits in Postgres (429 + Retry-After), daily photo quotas, memory fallback when the RPC fails", async (c) => {
    const uid = USERS.insp2;
    const day = new Date().toISOString().slice(0, 10);
    const K = { min: `photo:${uid}`, mine: `photo-day:${uid}:${day}`, all: `photo-day:all:${day}` };
    const count = async (k) => Number((await one("SELECT count FROM rate_limits WHERE key = $1", [k]))?.count ?? 0);
    const seed = (k, n) =>
      sql("INSERT INTO rate_limits (key, window_start, count) VALUES ($1, now(), $2) ON CONFLICT (key) DO UPDATE SET window_start = now(), count = $2", [k, n]);
    const reset = () => sql("DELETE FROM rate_limits WHERE key LIKE 'photo%' OR key LIKE 'forgot-%'");
    const page = await newPage(c, "insp2");
    await login(page, "insp2@test.local");
    // A 1x1 PNG: past the limits the route calls the gateway's Gemini
    // stand-in (200). postEmpty() sends no image (400 before the quotas).
    const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const call = async (data) => {
      const r = await page.request.post(`${APP}/api/ai/analyze-photo`, { headers: { Origin: APP }, data });
      return { status: r.status(), retry: Number(r.headers()["retry-after"] || 0), body: await r.json().catch(() => ({})) };
    };
    const post = () => call({ base64: PNG, mediaType: "image/png" });
    const postEmpty = () => call({});
    const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");
    try {
      await reset();
      // Per-minute burst limit: the counter lives in the database.
      await seed(K.min, 10);
      const burst = await post();
      c.expect(burst.status === 429 && burst.retry >= 1 && burst.retry <= 60, "per-minute counter in Postgres -> 429 with Retry-After 1..60", burst);
      c.expect((await count(K.mine)) === 0, "a request refused per minute doesn't touch the daily quota");
      await sql("DELETE FROM rate_limits WHERE key = $1", [K.min]);
      const ok = await post();
      c.expect(ok.status === 200 && (await count(K.min)) === 1, "counter cleared in the database -> allowed again (stand-in analysis)", ok);
      c.expect((await count(K.mine)) === 1 && (await count(K.all)) === 1, "an analysis spends one unit of each daily quota");
      const bad = await postEmpty();
      c.expect(bad.status === 400 && (await count(K.mine)) === 1 && (await count(K.all)) === 1, "a bad request (no image) doesn't spend daily quota", { bad, mine: await count(K.mine) });

      // Daily quota per user.
      await seed(K.mine, 60);
      const allBefore = await count(K.all);
      const mine = await post();
      c.expect(mine.status === 429 && /Daily photo-analysis limit/.test(mine.body.error || ""), "61st photo of the day for one user -> 429 daily limit", mine);
      const toMidnight = Math.ceil((Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 1) - Date.now()) / 1000);
      c.expect(Math.abs(mine.retry - toMidnight) <= 5, "daily 429: Retry-After = seconds to the next UTC midnight", { retry: mine.retry, toMidnight });
      c.expect((await count(K.all)) === allBefore, "a request refused by the per-user quota doesn't count toward the app-wide quota");

      // Daily quota for the whole app.
      await sql("DELETE FROM rate_limits WHERE key = $1 OR key = $2", [K.mine, K.min]);
      await seed(K.all, 500);
      const all = await post();
      c.expect(all.status === 429 && /Daily photo-analysis limit/.test(all.body.error || ""), "501st photo of the day for the app -> 429 daily limit", all);
      c.step(`per-user daily counter after an app-wide refusal: ${await count(K.mine)}`);

      // RPC failing (e.g. migration not applied): per-instance memory limit.
      await sql("DELETE FROM rate_limits WHERE key LIKE 'photo%'");
      await ctl.fault({ method: "POST", prefix: "/rest/v1/rpc/rate_limit_hit", status: 404, times: -1,
        body: { code: "PGRST202", message: "Could not find the function public.rate_limit_hit", details: null, hint: null } });
      const fb = [];
      for (let n = 0; n < 11; n++) fb.push((await post()).status);
      await ctl.clear();
      c.expect(fb.slice(0, 10).every((s) => s === 200) && fb[10] === 429, "RPC down -> memory fallback still allows 10/min then 429 (no 500s)", fb.join(","));
      c.expect((await count(K.min)) === 0, "nothing written to the database while the RPC fails");

      // Forgot password (public): per-address limit, shared.
      const anon = await newPage(c, "anon-c4");
      const forgot = async (email) => (await anon.request.post(`${APP}/api/auth/forgot`, { headers: { Origin: APP }, data: { email } })).status();
      const f = [];
      for (let n = 0; n < 4; n++) f.push(await forgot("c4-nobody@test.local"));
      c.expect(f.join(",") === "200,200,200,429", "forgot: 3 per address per hour, then 429", f.join(","));
      c.expect((await count(`forgot-email:${sha("c4-nobody@test.local")}`)) === 4, "forgot counter lives in Postgres, keyed by the address's hash");
      c.expect((await one("SELECT count(*)::int AS n FROM rate_limits WHERE key LIKE '%@%'")).n === 0, "no email address stored in rate_limits");
      await sql("UPDATE rate_limits SET count = 5 WHERE key LIKE 'forgot-ip:%'");
      const ipBlocked = await forgot("c4-other@test.local");
      c.expect(ipBlocked === 429, "forgot: per-client limit -> 429", ipBlocked);
      c.expect((await count(`forgot-email:${sha("c4-other@test.local")}`)) === 0, "a refused client doesn't touch per-address counters");
      await anon.context().close();
    } finally {
      await ctl.clear();
      await reset();
    }
    await page.context().close();
  });

  // ------------------------------------------ C6 / D2 (migration 20260929000100)
  await run("c6d2", "C6: a deactivated session reads no units/zones/IFS objects; D2: added readings/evidence show in the item history", async (c) => {
    const EMAIL = "insp2@test.local";
    const count = async (api, table) => {
      const { data, error } = await api.from(table).select("*");
      return error ? `error: ${error.message}` : data.length;
    };
    const AUDIT = "00000000-0000-0000-0000-0000000e2ec6"; // fixed ids e2e10..e2e13 belong to d1rate
    try {
      // C6 — REST, as PostgREST sees the caller.
      const api = await apiAs(EMAIL);
      const before = [await count(api, "units"), await count(api, "zones"), await count(api, "ifs_objects")];
      c.expect(before[0] >= 1 && before[1] === 14 && before[2] >= 4, "active inspector reads units, 14 zones and IFS objects", before);
      await sql("UPDATE profiles SET active = false WHERE email = $1", [EMAIL]);
      const after = [await count(api, "units"), await count(api, "zones"), await count(api, "ifs_objects")];
      c.expect(after.every((n) => n === 0), "same token after deactivation: 0 units, 0 zones, 0 IFS objects (no error)", after);
      const anon = await fetch(`${GW}/rest/v1/zones?select=zid`, { headers: { apikey: process.env.ANON_KEY } });
      const anonRows = await anon.json().catch(() => null);
      c.expect(Array.isArray(anonRows) && anonRows.length === 0, "anon key reads no zones", { status: anon.status, anonRows });
    } finally {
      await sql("UPDATE profiles SET active = true WHERE email = $1", [EMAIL]);
    }

    // D2 — UI: add a reading and an evidence record, reopen, read History.
    await sql(`INSERT INTO items (id, unit_id, zone_id, name, status, notes, created_by)
               SELECT $1, id, 'Z13', 'E2E Audit Target', 'Attention', 'base note', $2 FROM units WHERE code = 'SS-75'
               `, [AUDIT, USERS.insp2]);
    const page = await newPage(c, "insp1");
    await login(page, "insp1@test.local");
    await openItem(page, "E2E Audit Target");
    await modal(page).locator('div:has(> label:text-is("Pit Depth (mm)")) > input').fill("0.7");
    await modal(page).getByRole("button", { name: "+ Reading" }).click();
    c.expect(await toastSeen(page, "Reading saved"), "'Reading saved'");
    await modal(page).locator('div:has(> label:text-is("Finding / Description")) > textarea').fill("audit evidence (no file)");
    await modal(page).getByRole("button", { name: "Save evidence record" }).click();
    c.expect(await toastSeen(page, "Evidence saved"), "'Evidence saved'");
    const ev = await sql("SELECT action, by_user::text, by_user_email, new_value, item_name FROM history WHERE item_id = $1 ORDER BY event_date, action", [AUDIT]);
    const added = ev.filter((h) => h.action === "reading_added" || h.action === "evidence_added");
    c.expect(added.length === 2 && added.every((h) => h.by_user === USERS.insp1 && h.by_user_email === "insp1@test.local" && h.item_name === "E2E Audit Target"),
      "DB: reading_added + evidence_added, attributed to insp1, item name snapshotted", ev);
    c.expect(added.some((h) => h.action === "reading_added" && h.new_value === "0.700"), "reading_added keeps the depth (0.700)", added);
    await page.keyboard.press("Escape");
    await modal(page).waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
    await openItem(page, "E2E Audit Target");
    const hist = modal(page).locator('div:has(> div:text-is("HISTORY"))');
    await hist.getByText(/reading added/).first().waitFor({ timeout: 10000 }).catch(() => {});
    const txt = await hist.innerText().catch(() => "");
    c.expect(/reading added · depth_mm/.test(txt) && /Reading added: 0\.700 mm/.test(txt), "History panel shows 'reading added · depth_mm' with its note", txt.slice(0, 400));
    c.expect(/evidence added/.test(txt) && /Evidence added: .*audit evidence \(no file\)/.test(txt), "History panel shows 'evidence added' with its note", txt.slice(0, 400));
    c.expect(/by insp1@test\.local/.test(txt), "…attributed to insp1", txt.slice(0, 400));
    await shot(c, page, "history");
    await page.keyboard.press("Escape");
    await page.context().close();
  });

  // ------------------------------------------------------------ E1 / E2
  // Fixtures for the top-bar search: an accented name with IFS codes and an
  // archived twin (inserted before login, removed afterwards).
  const S = { live: "00000000-0000-0000-0000-0000000e1501", old: "00000000-0000-0000-0000-0000000e1502" };
  const seedSearch = () => sql(
    `INSERT INTO items (id, unit_id, zone_id, name, status, ifs_obj_id, ifs_wo, archived, created_by, created_at)
     SELECT v.id::uuid, u.id, 'Z05', v.name, 'OK', v.obj, v.wo, v.arch, '00000000-0000-0000-0000-00000000c002', now() - interval '3 days'
       FROM units u, (VALUES ($1, 'E2E Ação Valve Search', 'OBJ-HULL-3', 'WO-777123', false),
                             ($2, 'E2E Ação Archived Search', NULL, NULL, true)) AS v(id, name, obj, wo, arch)
      WHERE u.code = 'SS-75' ON CONFLICT (id) DO NOTHING`, [S.live, S.old]);
  const unseedSearch = () => sql("DELETE FROM items WHERE id = ANY($1::uuid[])", [[S.live, S.old]]);
  // The top-bar search (the item modal's IFS picker is also a combobox).
  const tbSearch = (page) => page.locator('#app-root input[role="combobox"][type="search"]');
  const searchState = (page) => page.evaluate(() => {
    const inp = document.querySelector('#app-root input[role="combobox"][type="search"]');
    const lb = document.getElementById(inp.getAttribute("aria-controls"));
    const opts = lb ? [...lb.querySelectorAll('[role="option"]')] : [];
    return {
      value: inp.value, focused: document.activeElement === inp,
      expanded: inp.getAttribute("aria-expanded"), ad: inp.getAttribute("aria-activedescendant"),
      label: inp.getAttribute("aria-label"), placeholder: inp.placeholder,
      listbox: lb ? { role: lb.getAttribute("role"), label: lb.getAttribute("aria-label"),
        childRoles: [...lb.children].map((ch) => ch.getAttribute("role")) } : null,
      opts: opts.map((o) => ({ id: o.id, sel: o.getAttribute("aria-selected"), text: o.innerText.replace(/\s+/g, " ").trim() })),
      // The live region sits next to the listbox (a listbox may only hold options).
      status: document.querySelector('#app-root .tb-search [role="status"]')?.textContent || null,
    };
  });

  await run("e1search", "E1: top-bar item search — name/IFS/WO, accents, archived last, cap, keys, '/', Escape, mouse, no results, PT, users/audit, 390px", async (c) => {
    await seedSearch();
    try {
      const page = await newPage(c, "insp1");
      await login(page, "insp1@test.local");
      const box = tbSearch(page);
      c.expect((await box.count()) === 1, "one search combobox in the top bar");

      // '/' from the page focuses it without typing '/'; Ctrl+/ and modified keys are left alone.
      await page.evaluate(() => document.activeElement?.blur());
      await page.keyboard.press("/");
      let st = await searchState(page);
      c.expect(st.focused && st.value === "", "'/' focuses the search (no '/' typed)", st);
      const prevented = await page.evaluate(() => {
        document.activeElement?.blur();
        const ev = (o) => { const e = new KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true, ...o }); document.body.dispatchEvent(e); return e.defaultPrevented; };
        return { ctrl: ev({ ctrlKey: true }), meta: ev({ metaKey: true }), alt: ev({ altKey: true }), plain: ev({}) };
      });
      c.expect(!prevented.ctrl && !prevented.meta && !prevented.alt && prevented.plain, "only a plain '/' is taken (Ctrl/Cmd/Alt+/ and Ctrl+F untouched)", prevented);
      c.expect(st.label === "Search items" && /Search items/.test(st.placeholder), "EN label + placeholder", st);
      c.expect(st.expanded === "false" && st.listbox === null, "collapsed while empty (aria-expanded=false)", st);
      const ph = await page.evaluate(() => {
        const i = document.querySelector('#app-root input[role="combobox"][type="search"]'), cs = getComputedStyle(i);
        const ctx = document.createElement("canvas").getContext("2d");
        ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        return { text: Math.round(ctx.measureText(i.placeholder).width), room: Math.round(i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) };
      });
      c.step(`NOTE: 1440px placeholder needs ${ph.text}px, field has ${ph.room}px -> the '/' hint is ${ph.text > ph.room ? "cut off" : "visible"}`);
      // The input closes its list 150 ms after a blur; that timer isn't
      // cancelled when focus comes back (documented, not failed).
      await box.focus();
      await page.keyboard.type("acao");
      await page.evaluate(() => document.activeElement?.blur());
      await box.focus();
      await page.waitForTimeout(300);
      st = await searchState(page);
      c.step(`NOTE: blur + refocus within 150 ms -> list ${st.listbox ? "still open" : "closed while the field has focus (stale blur timer)"} (focused=${st.focused}, expanded=${st.expanded})`);
      await page.keyboard.press("Escape");
      await page.evaluate(() => document.activeElement?.blur());
      await page.waitForTimeout(300);

      // One character: nothing yet.
      await box.focus();
      await page.keyboard.type("E");
      st = await searchState(page);
      c.expect(st.listbox === null && st.expanded === "false", "1 character -> no list", st);
      await page.keyboard.press("Escape");

      // Accent-insensitive, archived last, combobox wiring.
      await page.keyboard.type("acao");
      await page.locator('[role="listbox"]').waitFor({ timeout: 5000 });
      st = await searchState(page);
      c.step(`'acao' -> ${st.opts.map((o) => o.text).join(" | ")}`);
      c.expect(st.opts.length === 2 && /E2E Ação Valve Search/.test(st.opts[0].text) && /E2E Ação Archived Search.*archived/.test(st.opts[1].text),
        "'acao' finds 'Ação' (accents ignored); archived one last, marked 'archived'", st.opts);
      c.expect(st.expanded === "true" && st.listbox?.role === "listbox" && st.listbox.label === "Search items", "aria-expanded=true, listbox labelled", st.listbox);
      c.expect(st.opts.every((o) => o.id) && new Set(st.opts.map((o) => o.id)).size === st.opts.length, "options have unique ids");
      c.expect(st.ad === st.opts[0].id && st.opts[0].sel === "true", "aria-activedescendant -> first option (aria-selected)", st);
      await page.keyboard.press("ArrowDown");
      st = await searchState(page);
      c.expect(st.ad === st.opts[1].id && st.opts[1].sel === "true" && st.opts[0].sel === "false", "ArrowDown moves the active option", st);
      await page.keyboard.press("ArrowDown");
      st = await searchState(page);
      c.expect(st.ad === st.opts[0].id, "ArrowDown wraps to the first", st.ad);
      await page.keyboard.press("ArrowUp");
      st = await searchState(page);
      c.expect(st.ad === st.opts[1].id, "ArrowUp wraps to the last", st.ad);
      await page.keyboard.press("ArrowUp");
      await shot(c, page, "list");
      await page.keyboard.press("Enter");
      await modal(page).waitFor({ timeout: 5000 });
      c.expect(q(page).searchParams.get("item") === S.live, "Enter opens the highlighted item (?item=)", page.url());
      const title = await page.evaluate(() => { const d = document.querySelector('.modal-card[role="dialog"]'); return document.getElementById(d.getAttribute("aria-labelledby"))?.textContent; });
      c.expect(title === "E2E Ação Valve Search", "modal shows the picked item", title);
      st = await searchState(page);
      c.expect(st.value === "" && st.listbox === null, "search cleared after picking", st);

      // '/' while the modal is open does nothing (page behind is inert).
      await page.keyboard.press("/");
      const inDlg = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
      st = await searchState(page);
      c.expect(inDlg && !st.focused && st.value === "", "'/' with the item modal open: focus stays in the dialog", { inDlg, st });
      await page.keyboard.press("Escape");
      await modal(page).waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
      c.expect(!(await modalOpen(page)), "Escape closes the item modal (not swallowed by the search)");
      const focusAfter = await page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName}${a.getAttribute("role") ? "[role=" + a.getAttribute("role") + "]" : ""}` : "none"; });
      c.step(`NOTE: focus after closing an item opened from the search: ${focusAfter}`);

      // IFS object / work order.
      await box.focus();
      await page.keyboard.type("obj-hull");
      await page.locator('[role="listbox"]').waitFor({ timeout: 5000 });
      st = await searchState(page);
      c.expect(st.opts.length === 1 && /OBJ-HULL-3/.test(st.opts[0].text), "IFS object id 'obj-hull' finds the item (code shown)", st.opts);
      await box.fill("");
      await page.keyboard.type("WO-777123");
      st = await searchState(page);
      c.expect(st.opts.length === 1 && /E2E Ação Valve/.test(st.opts[0].text), "work order 'WO-777123' finds the item", st.opts);
      // Escape clears.
      await page.keyboard.press("Escape");
      st = await searchState(page);
      c.expect(st.value === "" && st.listbox === null && st.expanded === "false" && st.focused, "Escape clears the query and closes the list (focus stays)", st);
      // Cap at 20.
      await page.keyboard.type("bulk");
      st = await searchState(page);
      c.expect(st.opts.length === 20, "results capped at 20", st.opts.length);
      // No results.
      await box.fill("");
      await page.keyboard.type("zzqqxx");
      st = await searchState(page);
      c.expect(st.opts.length === 0 && st.status === "No items found." && !st.ad, "no match -> 'No items found.' (role=status), no activedescendant", st);
      c.step(`NOTE: listbox children roles with no results: ${JSON.stringify(st.listbox?.childRoles)}`);
      // Mouse: mousedown on an option opens it (before the input blurs).
      await box.fill("");
      await page.keyboard.type("ação valve");
      await page.locator('[role="option"]').first().click();
      await modal(page).waitFor({ timeout: 5000 });
      c.expect(q(page).searchParams.get("item") === S.live, "clicking an option opens the item", page.url());
      await page.keyboard.press("Escape");
      await modal(page).waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
      // Blur closes the list.
      await box.fill("");
      await page.keyboard.type("acao");
      await page.locator("main").click({ position: { x: 5, y: 5 } });
      await page.waitForTimeout(400);
      st = await searchState(page);
      c.expect(st.listbox === null, "clicking elsewhere closes the list", st);
      await box.fill("");

      // Responsiveness with the full data set (1200+ items).
      await page.evaluate(() => {
        window.__lt = [];
        try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)); }).observe({ type: "longtask", buffered: false }); } catch {}
      });
      await box.focus();
      const t0 = Date.now();
      await page.keyboard.type("bulk item 01", { delay: 40 });
      await page.waitForTimeout(300);
      const lt = await page.evaluate(() => window.__lt);
      c.step(`typing 12 chars over ${visibleItems}+ items: ${Date.now() - t0} ms, long tasks: ${JSON.stringify(lt)}`);
      c.expect(!lt.length || Math.max(...lt) < 250, "no keystroke blocks the main thread >= 250 ms", lt);
      await page.keyboard.press("Escape");

      // Tablet widths: the bottom band wraps instead of overflowing.
      for (const w of [1024, 800]) {
        await page.setViewportSize({ width: w, height: 900 });
        await page.waitForTimeout(200);
        const m = await page.evaluate(() => {
          const band = document.querySelector(".tb-band-bottom"), s = document.querySelector(".tb-search").getBoundingClientRect(), p = document.querySelector(".tb-pills").getBoundingClientRect();
          return { overflow: band.scrollWidth - band.clientWidth, doc: document.documentElement.scrollWidth - innerWidth, ownRow: s.top >= p.bottom - 1, sw: Math.round(s.width) };
        });
        c.expect(m.overflow <= 0 && m.doc <= 0, `${w}px: no horizontal overflow in the top bar`, m);
        c.step(`${w}px: search ${m.ownRow ? "on its own row" : "beside the pills"} (${m.sw}px)`);
      }
      await page.context().close();

      // Users / Audit log: '/' leaves form fields alone; the search opens the item on /dashboard.
      const adm = await newPage(c, "admin1");
      await login(adm, "admin1@test.local");
      await adm.goto(`${APP}/users`);
      await adm.getByText("Create User").waitFor({ timeout: 20000 });
      const email = adm.locator('input[type="email"]').first();
      await email.click();
      await adm.keyboard.type("a/b");
      c.expect((await email.inputValue()) === "a/b" && (await email.evaluate((e) => e === document.activeElement)), "'/' typed in a text field stays in the field (Users)");
      await adm.goto(`${APP}/audit-log`);
      await adm.locator("main select").first().waitFor({ timeout: 20000 });
      await adm.locator("main select").first().focus();
      await adm.keyboard.press("/");
      c.expect(await adm.evaluate(() => document.activeElement?.tagName === "SELECT"), "'/' on a focused <select> doesn't steal focus (Audit log)");
      const ce = await adm.evaluate(() => {
        const d = document.createElement("div"); d.contentEditable = "true"; d.id = "e2e-ce"; document.querySelector("main").prepend(d); d.focus();
        const e = new KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true }); d.dispatchEvent(e);
        const r = { prevented: e.defaultPrevented, focus: document.activeElement === d }; d.remove(); return r;
      });
      c.expect(!ce.prevented && ce.focus, "'/' in a contenteditable is left alone", ce);
      await adm.evaluate(() => document.activeElement?.blur());
      await adm.keyboard.press("/");
      await adm.keyboard.type("acao valve");
      await adm.locator('[role="option"]').first().waitFor({ timeout: 5000 });
      await adm.keyboard.press("Enter");
      await adm.waitForURL(/\/dashboard\?.*item=/, { timeout: 20000 });
      await modal(adm).waitFor({ timeout: 20000 });
      c.expect(new URL(adm.url()).searchParams.get("item") === S.live, "from /audit-log the search opens /dashboard?item=<id>", adm.url());
      await adm.keyboard.press("Escape");
      await modal(adm).waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
      await adm.goto(`${APP}/users`);
      await adm.getByText("Create User").waitFor({ timeout: 20000 });
      await tbSearch(adm).click();
      await adm.keyboard.type("obj-hull");
      await adm.locator('[role="option"]').first().click();
      await adm.waitForURL(/\/dashboard\?.*item=/, { timeout: 20000 });
      await modal(adm).waitFor({ timeout: 20000 });
      c.expect(new URL(adm.url()).searchParams.get("item") === S.live, "from /users a click on a result opens the item", adm.url());
      await adm.keyboard.press("Escape");
      await modal(adm).waitFor({ state: "detached", timeout: 5000 }).catch(() => {});

      // Portuguese.
      await adm.getByRole("button", { name: "PT", exact: true }).click();
      await adm.waitForTimeout(500);
      await tbSearch(adm).click();
      await adm.keyboard.type("acao");
      await adm.locator('[role="listbox"]').waitFor({ timeout: 5000 });
      st = await searchState(adm);
      c.expect(st.label === "Buscar itens" && /^Buscar itens \(nome, IFS, OS, zona…\)/.test(st.placeholder) && st.listbox?.label === "Buscar itens", "PT label, placeholder and listbox label", st);
      c.expect(/arquivado/.test(st.opts[1]?.text || "") && /SAUDÁVEL|OK|ATENÇÃO|CRÍTICO|PENDENTE/i.test(st.opts[0]?.text || ""), "PT 'arquivado' tag and status", st.opts);
      await tbSearch(adm).fill("");
      await adm.keyboard.type("zzqqxx");
      st = await searchState(adm);
      c.expect(st.status === "Nenhum item encontrado.", "PT no-results text", st.status);
      await shot(c, adm, "pt");
      await adm.context().close();

      // Phone 390x844.
      const mob = await newPage(c, "insp1-mobile", { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      await login(mob, "insp1@test.local");
      const lay = await mob.evaluate(() => {
        const band = document.querySelector(".tb-band-bottom"), bar = band.parentElement;
        const s = document.querySelector(".tb-search").getBoundingClientRect(), p = document.querySelector(".tb-pills").getBoundingClientRect();
        const inp = document.querySelector(".tb-search input").getBoundingClientRect();
        const cs = getComputedStyle(band);
        return { ownRow: s.top >= p.bottom - 1, sLeft: Math.round(s.left), sRight: Math.round(s.right),
          inner: Math.round(band.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)), sw: Math.round(s.width),
          barOverflow: bar.scrollWidth - bar.clientWidth, bandOverflow: band.scrollWidth - band.clientWidth,
          docOverflow: document.documentElement.scrollWidth - innerWidth, inputH: Math.round(inp.height),
          fontSize: getComputedStyle(document.querySelector(".tb-search input")).fontSize };
      });
      c.expect(lay.ownRow && Math.abs(lay.sw - lay.inner) <= 1, "390px: search on its own full-width row", lay);
      c.expect(lay.barOverflow <= 0 && lay.bandOverflow <= 0 && lay.docOverflow <= 0, "390px: no horizontal overflow (top bar, page)", lay);
      c.expect(lay.fontSize === "16px", "390px: 16px font (no iOS zoom on focus)", lay.fontSize);
      c.step(`NOTE: 390px search input height ${lay.inputH}px (44px touch-target guideline)`);
      await tbSearch(mob).tap();
      await mob.keyboard.type("acao");
      await mob.locator('[role="option"]').first().waitFor({ timeout: 5000 });
      const optm = await mob.evaluate(() => {
        const lb = document.querySelector('#app-root [role="listbox"]').getBoundingClientRect();
        const os = [...document.querySelectorAll('#app-root [role="option"]')].map((o) => {
          const r = o.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return { h: Math.round(r.height), onTop: hit?.closest('[role="option"]') === o };
        });
        return { lbLeft: Math.round(lb.left), lbRight: Math.round(lb.right), os, docOverflow: document.documentElement.scrollWidth - innerWidth };
      });
      c.expect(optm.os.length === 2 && optm.os.every((o) => o.h >= 44), "390px: result rows >= 44px", optm.os);
      c.expect(optm.os.every((o) => o.onTop), "390px: the list is drawn above the page content", optm.os);
      c.expect(optm.lbLeft >= 0 && optm.lbRight <= 390 && optm.docOverflow <= 0, "390px: the list fits the screen", optm);
      await shot(c, mob, "mobile-list");
      await mob.locator('[role="option"]').first().tap();
      await modal(mob).waitFor({ timeout: 5000 });
      c.expect(q(mob).searchParams.get("item") === S.live, "390px: tapping a result opens the item", mob.url());
      await mob.context().close();
    } finally {
      await unseedSearch();
    }
  });

  await run("e2glyphs", "E2: risk matrix — shape per level in every cell, sr-only level, tooltip, translated legend, fonts, 390px", async (c) => {
    const LV = { Low: "○", Medium: "◇", High: "△", Critical: "▲" };
    const lvOf = (v) => (v >= 15 ? "Critical" : v >= 8 ? "High" : v >= 4 ? "Medium" : "Low");
    const readMatrix = (page) => page.evaluate(() => {
      const rows = [...document.querySelectorAll("main table tbody tr")];
      return rows.map((tr) => [...tr.children].slice(1).map((td) => {
        const box = td.firstElementChild, head = box.firstElementChild, sp = [...head.children];
        const sr = head.querySelector(".sr-only");
        const cs = sr ? getComputedStyle(sr) : null;
        const hr = head.getBoundingClientRect(), br = box.getBoundingClientRect();
        const g = sp[1]?.getBoundingClientRect(), n = sp[0]?.getBoundingClientRect();
        return {
          rpn: sp[0]?.textContent, glyph: sp[1]?.textContent, glyphHidden: sp[1]?.getAttribute("aria-hidden"),
          sr: sr?.textContent, srHidden: cs ? cs.position === "absolute" && parseFloat(cs.width) <= 1 && (cs.clip !== "auto" || cs.clipPath !== "none") && cs.overflow === "hidden" : false,
          title: head.getAttribute("title"), items: box.querySelectorAll("[role=button]").length,
          fits: !!g && g.right <= br.right + 0.5 && n.right <= g.left, headW: Math.round(hr.width),
        };
      }));
    });
    const readLegend = (page) => page.evaluate(() => {
      const t = document.querySelector("main table");
      let el = t.parentElement.nextElementSibling;
      return [...el.children].map((d) => ({ glyph: d.children[0]?.textContent, hidden: d.children[0]?.getAttribute("aria-hidden"), text: d.children[1]?.textContent }));
    });
    const page = await newPage(c, "insp1");
    await login(page, "insp1@test.local");
    await gotoTab(page, "Risk Matrix");
    await page.locator("main table tbody tr").first().waitFor({ timeout: 20000 });
    const m = await readMatrix(page);
    const bad = [], seen = {};
    m.forEach((row, i) => row.forEach((cell, j) => {
      const p = 5 - i, cc = j + 1, v = p * cc, lv = lvOf(v);
      if (cell.items) seen[lv] = (seen[lv] || 0) + cell.items;
      if (cell.rpn !== String(v) || cell.glyph !== LV[lv] || cell.glyphHidden !== "true" || cell.sr !== `${lv} risk` || !cell.srHidden || cell.title !== `${lv} risk · RPN ${v}`)
        bad.push({ p, c: cc, cell });
    }));
    c.expect(m.length === 5 && m.every((r) => r.length === 5), "5x5 matrix");
    c.expect(bad.length === 0, "every cell: RPN, level glyph (aria-hidden), sr-only level name (visually hidden), tooltip 'Level · RPN n'", bad.slice(0, 4));
    c.step(`items per level: ${JSON.stringify(seen)}`);
    c.expect(["Low", "Medium", "High", "Critical"].every((l) => seen[l] > 0), "all four levels have items (non-empty) and show their glyph", seen);
    const lg = await readLegend(page);
    c.expect(JSON.stringify(lg) === JSON.stringify([
      { glyph: LV.Low, hidden: "true", text: "Low risk (RPN ≤ 3)" }, { glyph: LV.Medium, hidden: "true", text: "Medium risk (RPN 4–7)" },
      { glyph: LV.High, hidden: "true", text: "High risk (RPN 8–14)" }, { glyph: LV.Critical, hidden: "true", text: "Critical risk (RPN ≥ 15)" }]), "legend: 4 entries, glyph + level + range (EN)", lg);
    // Which font actually draws the glyphs (Inter / Plex are latin-subset webfonts).
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
    await page.evaluate(() => {
      document.querySelector("main table tbody tr td:nth-child(2) > div > div > span[aria-hidden]")?.setAttribute("data-e2e-g", "cell");
      const t = document.querySelector("main table").parentElement.nextElementSibling;
      t.querySelectorAll('span[aria-hidden="true"]').forEach((s, i) => s.setAttribute("data-e2e-g", "legend" + i));
      document.querySelectorAll("main table tbody tr").forEach((tr, i) => tr.querySelectorAll('span[aria-hidden="true"]').forEach((s, j) => s.setAttribute("data-e2e-g", `c${i}${j}`)));
    });
    const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
    const { nodeIds } = await cdp.send("DOM.querySelectorAll", { nodeId: root.nodeId, selector: "[data-e2e-g]" });
    const fonts = {};
    for (const nid of nodeIds) {
      const { attributes } = await cdp.send("DOM.getAttributes", { nodeId: nid });
      const tag = attributes[attributes.indexOf("data-e2e-g") + 1];
      const { fonts: f } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId: nid });
      fonts[tag] = f.map((x) => `${x.familyName}${x.isCustomFont ? "*" : ""}:${x.glyphCount}`).join(",");
    }
    const uniq = [...new Set(Object.values(fonts))];
    c.step(`glyph fonts (family:glyphs, *=webfont): ${JSON.stringify(uniq)}`);
    c.expect(Object.values(fonts).every((f) => f && !/LastResort|^$/.test(f) && /:\d+/.test(f)), "every glyph is drawn by a real font (no tofu)", fonts);
    await shot(c, page, "matrix-en");

    // Portuguese.
    await page.getByRole("button", { name: "PT", exact: true }).click();
    await page.waitForTimeout(500);
    const lgPt = await readLegend(page);
    c.expect(JSON.stringify(lgPt.map((l) => l.text)) === JSON.stringify(["Risco baixo (RPN ≤ 3)", "Risco médio (RPN 4–7)", "Risco alto (RPN 8–14)", "Risco crítico (RPN ≥ 15)"]), "legend translated (PT)", lgPt);
    const mPt = await readMatrix(page);
    c.expect(mPt[0][4].sr === "Risco crítico" && mPt[0][4].title === "Risco crítico · RPN 25" && mPt[4][0].sr === "Risco baixo", "sr-only text and tooltip translated (PT)", [mPt[0][4], mPt[4][0]]);
    await shot(c, page, "matrix-pt");
    await page.context().close();

    // Phone: narrow cells.
    const mob = await newPage(c, "insp1-mobile", { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await login(mob, "insp1@test.local");
    await mob.goto(`${APP}/dashboard?tab=risk`);
    await mob.locator("main table tbody tr").first().waitFor({ timeout: 20000 });
    const mm = await readMatrix(mob);
    const lay = await mob.evaluate(() => {
      const t = document.querySelector("main table"), wrap = t.parentElement;
      return { wrapOverflow: wrap.scrollWidth - wrap.clientWidth, docOverflow: document.documentElement.scrollWidth - innerWidth, mainOverflow: (() => { const m = document.querySelector("main"); return m.scrollWidth - m.clientWidth; })() };
    });
    const cramped = mm.flat().filter((x) => !x.fits);
    c.step(`390px: cell header width ${Math.min(...mm.flat().map((x) => x.headW))}-${Math.max(...mm.flat().map((x) => x.headW))}px`);
    c.expect(cramped.length === 0, "390px: RPN and glyph fit side by side in every cell", cramped.slice(0, 3));
    c.expect(lay.wrapOverflow <= 0 && lay.docOverflow <= 0 && lay.mainOverflow <= 0, "390px: matrix causes no horizontal overflow", lay);
    await shot(c, mob, "matrix-390");
    await mob.context().close();
  });

  await run("e3photos", "E3: several photos at once from the gallery — preview + '+N more', AI on the first only, one row each, progress, 10 limit, partial failure + retry, PT, 390px", async (c) => {
    const unit = (await one("SELECT id FROM units WHERE code = 'SS-75'")).id;
    const IT = { en: "00000000-0000-0000-0000-0000000e2e14", pt: "00000000-0000-0000-0000-0000000e2e15" };
    for (const [id, name] of [[IT.en, "E2E Multi Photo Target"], [IT.pt, "E2E Multi Photo Mobile"]]) {
      await sql(
        `INSERT INTO items (id, unit_id, zone_id, name, status, prob, cons, created_by)
         VALUES ($1, $2, 'Z13', $3, 'Attention', 2, 2, $4) ON CONFLICT (id) DO NOTHING`,
        [id, unit, name, USERS.insp1]
      );
    }
    await sql("DELETE FROM rate_limits WHERE key LIKE 'photo%'");
    const small = (name, tint) => ({ name, mimeType: "image/png", buffer: tinyPng({ tint }) });
    // 512x512 stored uncompressed: ~770 KB each, past the compression cutoff.
    const big = (n) => Array.from({ length: n }, (_, i) => ({
      name: `e3-big-${String(i + 1).padStart(2, "0")}.png`, mimeType: "image/png", buffer: tinyPng({ W: 512, H: 512, tint: i * 9, level: 0 }),
    }));
    const rows = (id) => sql("SELECT description, file_name, file_path, ai_analysis FROM evidences WHERE item_id = $1 ORDER BY created_at, file_name", [id]);
    const blobs = async (id) => (await one("SELECT count(*)::int n FROM storage.objects WHERE bucket_id = 'evidence-photos' AND name LIKE $1", [`${id}/%`])).n;
    const gallery = (page) => modal(page).locator('input[type="file"]:not([capture])');
    const descBox = (page, label) => modal(page).locator(`div:has(> label:text-is("${label}")) > textarea`);
    // Every state the form goes through (live-region texts, the Save
    // button's batch label, whether the pick buttons are disabled), so
    // brief states are checked without racing them.
    const watch = (page) => page.evaluate(() => {
      window.__e3 = [];
      const card = document.querySelector(".modal-card");
      const rec = () => {
        const btns = [...card.querySelectorAll("button")];
        const st = {
          status: [...card.querySelectorAll('[role="status"]')].map((e) => e.textContent).filter(Boolean).join(" | "),
          label: btns.find((b) => /^(Saving|Salvando) \d+ (of|de) \d+/.test(b.textContent))?.textContent || "",
          picksDisabled: btns.filter((b) => /Take photo|Gallery|Tirar foto|Galeria/.test(b.textContent)).every((b) => b.disabled),
        };
        const last = window.__e3[window.__e3.length - 1];
        if (!last || JSON.stringify(last) !== JSON.stringify(st)) window.__e3.push(st);
      };
      new MutationObserver(rec).observe(card, { subtree: true, childList: true, characterData: true, attributes: true });
    });
    const seen = (page) => page.evaluate(() => window.__e3);
    // The base64 each AI request carried (to know which photo was analysed).
    const aiSent = [];
    const onAi = (r) => {
      if (r.url().endsWith("/api/ai/analyze-photo") && r.method() === "POST") aiSent.push(JSON.parse(r.postData() || "{}").base64);
    };
    const geminiCalls = async () => (await (await fetch(`${GW}/__ctl/gemini`)).json()).calls;
    const failSecondUpload = () => ctl.fault({ method: "POST", prefix: "/storage/v1/object/evidence-photos/", status: 503, skip: 1, times: 1 });

    // ---- EN, desktop: 3 photos in one pick
    const page = await newPage(c, "insp1");
    page.on("request", onAi);
    await login(page, "insp1@test.local");
    await page.goto(`${APP}/dashboard?tab=zones&item=${IT.en}`);
    await modal(page).waitFor({ timeout: 30000 });
    const attrs = await modal(page).locator('input[type="file"]').evaluateAll((els) => els.map((e) => ({ capture: e.getAttribute("capture"), multiple: e.multiple })));
    c.expect(attrs.length === 2 && attrs.some((a) => a.capture === "environment" && !a.multiple) && attrs.some((a) => a.capture === null && a.multiple),
      "'Gallery / file' input is multiple; the camera input is not", attrs);
    await watch(page);
    const A = [small("e3-a.png", 0), small("e3-b.png", 60), small("e3-c.png", 120)];
    await gallery(page).setInputFiles(A);
    const prev = modal(page).locator('img[alt="Selected photo preview"]');
    await prev.waitFor({ timeout: 5000 }).catch(() => {});
    c.expect((await prev.evaluate((i) => i.complete && i.naturalWidth).catch(() => 0)) === 32, "preview of the first photo shown");
    const fileRow = prev.locator("xpath=..");
    const rowText = await fileRow.innerText().catch(() => "");
    c.expect(/e3-a\.png/.test(rowText) && /\+2 more/.test(rowText), "file row: first photo's name + '+2 more'", rowText);
    c.expect((await gallery(page).evaluate((e) => e.value)) === "", "input value cleared after the pick (same files can be picked again)");
    const saveBtn = modal(page).getByRole("button", { name: /^(Save \d+ evidence records|Save evidence record)$/ });
    c.expect((await saveBtn.textContent()) === "Save 3 evidence records", "Save button names the batch", await saveBtn.textContent());
    await descBox(page, "Finding / Description").fill("E3 batch: three flange photos");
    const g0 = await geminiCalls();
    await modal(page).getByRole("button", { name: /Analyse with AI/ }).click();
    await modal(page).getByText("E2E stand-in: surface rust on the flange bolts.").first().waitFor({ timeout: 20000 }).catch(() => {});
    c.expect((await geminiCalls()) === g0 + 1, "one AI analysis (gateway stand-in called once)", { before: g0, after: await geminiCalls() });
    c.expect(aiSent.length === 1 && aiSent[0] === A[0].buffer.toString("base64"), "the AI got the first (previewed) photo", aiSent.map((b) => b?.slice(0, 24)));
    c.expect((await descBox(page, "Finding / Description").inputValue()) === "E3 batch: three flange photos", "typed description kept (AI does not overwrite it)");
    await shot(c, page, "picked-3");
    await saveBtn.click();
    c.expect(await toastSeen(page, "3 evidence records saved", 15000), "toast '3 evidence records saved'");
    let st = await seen(page);
    const labels = [...new Set(st.map((x) => x.label).filter(Boolean))];
    c.expect(JSON.stringify(labels) === JSON.stringify(["Saving 1 of 3…", "Saving 2 of 3…", "Saving 3 of 3…"]), "Save button shows 'Saving i of 3…' in turn", labels);
    c.expect(st.filter((x) => x.label).every((x) => x.picksDisabled), "pick buttons disabled while the batch saves");
    c.expect(st.some((x) => /Saving 2 of 3…/.test(x.status)), "progress announced in a role=status region", st.map((x) => x.status));
    let r = await rows(IT.en);
    c.expect(r.length === 3 && r.every((x) => x.description === "E3 batch: three flange photos"), "3 evidence rows, same description", r.map((x) => [x.file_name, x.description]));
    c.expect(JSON.stringify(r.map((x) => x.file_name).sort()) === JSON.stringify(["e3-a.png", "e3-b.png", "e3-c.png"]), "one row per photo", r.map((x) => x.file_name));
    const withAi = r.filter((x) => x.ai_analysis);
    c.expect(withAi.length === 1 && withAi[0].file_name === "e3-a.png", "only the first photo's row carries the AI analysis", withAi.map((x) => x.file_name));
    c.expect((await blobs(IT.en)) === 3, "3 blobs stored", await blobs(IT.en));
    for (const n of ["e3-a.png", "e3-b.png", "e3-c.png"]) await modal(page).locator(`img[alt="${n}"]`).waitFor({ timeout: 15000 }).catch(() => {});
    c.expect((await modal(page).locator('img[alt^="e3-"]').count()) === 3, "3 thumbnails in the evidence list");
    c.expect(!(await prev.count()) && (await saveBtn.textContent()) === "Save evidence record" && (await descBox(page, "Finding / Description").inputValue()) === "",
      "form reset after the batch (no preview, single-record label, empty description)");
    c.expect(!(await modal(page).getByText("E2E stand-in: surface rust on the flange bolts.").count()), "AI result card gone after its photo was saved");

    // ---- 11 photos: only 10 kept; large ones are compressed first
    await watch(page);
    await gallery(page).setInputFiles(big(11));
    await modal(page).getByText(/^\+9 more$/).waitFor({ timeout: 30000 }).catch(() => {});
    st = await seen(page);
    c.expect(st.some((x) => x.status === "Preparing 10 photos…" && x.picksDisabled), "'Preparing 10 photos…' (role=status) while compressing, picks disabled", st.map((x) => x.status));
    const limit = modal(page).getByRole("alert").filter({ hasText: "Up to 10 photos at a time — only the first 10 were kept." });
    c.expect(await limit.isVisible().catch(() => false), "limit message shown (role=alert)");
    c.expect((await saveBtn.textContent()) === "Save 10 evidence records", "10 queued", await saveBtn.textContent());
    const row11 = await fileRow.innerText().catch(() => "");
    c.expect(/e3-big-01\.jpg/.test(row11) && /\+9 more/.test(row11), "first of the 10 previewed (compressed to JPEG), '+9 more'", row11);
    const opt = await modal(page).getByText(/^Optimised /).textContent().catch(() => "");
    c.expect(/^Optimised 7\.5 MB → \d+ KB$/.test(opt), "one 'Optimised' line for the whole pick", opt);
    await shot(c, page, "limit-11");

    // ---- partial failure: 2nd upload fails -> 1 saved, 2 kept; retry saves only those
    await gallery(page).setInputFiles([small("e3-p1.png", 30), small("e3-p2.png", 90), small("e3-p3.png", 150)]);
    await modal(page).getByText(/^\+2 more$/).waitFor({ timeout: 10000 }).catch(() => {});
    c.expect(!(await limit.count()), "a new pick clears the limit message");
    await descBox(page, "Finding / Description").fill("E3 partial batch");
    await failSecondUpload();
    await saveBtn.click();
    const err = modal(page).getByRole("alert").filter({ hasText: "Photo upload failed:" });
    await err.waitFor({ timeout: 15000 }).catch(() => {});
    const errText = await err.textContent().catch(() => "");
    c.expect(/Injected fault 503/.test(errText) && /\(1 of 3 saved — Save again for the other 2\.\)$/.test(errText), "error says what failed and that 1 of 3 landed", errText);
    r = (await rows(IT.en)).filter((x) => x.description === "E3 partial batch");
    c.expect(r.length === 1 && r[0].file_name === "e3-p1.png", "only the first photo saved", r.map((x) => x.file_name));
    const kept = await fileRow.innerText().catch(() => "");
    c.expect(/e3-p2\.png/.test(kept) && /\+1 more/.test(kept) && (await saveBtn.textContent()) === "Save 2 evidence records", "the 2 unsaved photos stay queued (preview moved to the next)", { kept, btn: await saveBtn.textContent() });
    c.expect((await descBox(page, "Finding / Description").inputValue()) === "E3 partial batch", "description kept for the retry");
    await shot(c, page, "partial-failure");
    // The AI step now works on the photo that is previewed, not the saved one.
    await modal(page).getByRole("button", { name: /Analyse with AI/ }).click();
    await modal(page).getByText("E2E stand-in: surface rust on the flange bolts.").first().waitFor({ timeout: 20000 }).catch(() => {});
    c.expect(aiSent.length === 2 && aiSent[1] === tinyPng({ tint: 90 }).toString("base64"), "AI after the failure analyses the queued head (e3-p2), not the saved photo");
    await saveBtn.click();
    c.expect(await toastSeen(page, "2 evidence records saved", 15000), "retry: toast '2 evidence records saved'");
    r = (await rows(IT.en)).filter((x) => x.description === "E3 partial batch");
    c.expect(JSON.stringify(r.map((x) => x.file_name).sort()) === JSON.stringify(["e3-p1.png", "e3-p2.png", "e3-p3.png"]), "retry saved only the rest: 3 rows, no duplicates", r.map((x) => x.file_name));
    c.expect(JSON.stringify(r.filter((x) => x.ai_analysis).map((x) => x.file_name)) === JSON.stringify(["e3-p2.png"]), "the retry's AI analysis landed on e3-p2 only", r.map((x) => [x.file_name, !!x.ai_analysis]));
    const allRows = await rows(IT.en);
    c.expect((await blobs(IT.en)) === allRows.length, "no orphan blob and no missing file (blobs = rows)", { blobs: await blobs(IT.en), rows: allRows.length });
    await page.context().close();

    // ---- PT, phone 390px
    const mob = await newPage(c, "insp1-mobile-pt", { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await mob.context().addCookies([{ name: "ss75-cmp.lang", value: "pt", url: APP }]);
    await login(mob, "insp1@test.local");
    await mob.goto(`${APP}/dashboard?tab=zones&item=${IT.pt}`);
    await modal(mob).waitFor({ timeout: 30000 });
    await watch(mob);
    await gallery(mob).setInputFiles(big(11));
    await modal(mob).getByText(/^\+9 arquivos$/).waitFor({ timeout: 30000 }).catch(() => {});
    st = await seen(mob);
    c.expect(st.some((x) => x.status === "Preparando 10 fotos…"), "PT: 'Preparando 10 fotos…'", st.map((x) => x.status));
    c.expect(await modal(mob).getByRole("alert").filter({ hasText: "Até 10 fotos por vez — só as 10 primeiras foram mantidas." }).isVisible().catch(() => false), "PT: limit message");
    const saveMob = modal(mob).getByRole("button", { name: /^Salvar (\d+ registros|registro) de evidência$/ });
    c.expect((await saveMob.textContent()) === "Salvar 10 registros de evidência", "PT: 'Salvar 10 registros de evidência'", await saveMob.textContent());
    const LONG = "e3-corroded-flange-bolt-portside-frame-112-close-up-before-cleaning.png";
    await gallery(mob).setInputFiles([small(LONG, 10), small("e3-m2.png", 70)]);
    await modal(mob).getByText(/^\+1 arquivo$/).waitFor({ timeout: 10000 }).catch(() => {});
    c.expect(await modal(mob).getByText(/^\+1 arquivo$/).isVisible().catch(() => false), "PT: '+1 arquivo' (singular)");
    await gallery(mob).setInputFiles([small(LONG, 10), small("e3-m2.png", 70), small("e3-m3.png", 130)]);
    await modal(mob).getByText(/^\+2 arquivos$/).waitFor({ timeout: 10000 }).catch(() => {});
    const prevMob = modal(mob).locator('img[alt="Prévia da foto selecionada"]');
    await prevMob.scrollIntoViewIfNeeded().catch(() => {});
    const lay = await prevMob.evaluate((img) => {
      const row = img.parentElement, [name, more] = [...row.querySelectorAll("span")];
      const rr = row.getBoundingClientRect(), mr = more.getBoundingClientRect(), card = document.querySelector(".modal-card");
      return {
        rowOverflow: row.scrollWidth - row.clientWidth, moreInside: mr.right <= rr.right + 0.5 && mr.left >= rr.left,
        nameEllipsis: name.scrollWidth > name.clientWidth, docOverflow: document.documentElement.scrollWidth - innerWidth,
        cardOverflow: card.scrollWidth - card.clientWidth, more: more.textContent,
      };
    });
    c.expect(lay.rowOverflow <= 0 && lay.moreInside && lay.nameEllipsis, "390px: long name ellipsized, '+2 arquivos' stays inside the row", lay);
    c.expect(lay.docOverflow <= 0 && lay.cardOverflow <= 0, "390px: no horizontal overflow (page, modal)", lay);
    c.expect((await saveMob.textContent()) === "Salvar 3 registros de evidência", "PT: 'Salvar 3 registros de evidência'", await saveMob.textContent());
    await descBox(mob, "Achado / Descrição").fill("E3 lote no celular");
    await shot(c, mob, "pt-390-picked");
    await failSecondUpload();
    await saveMob.click();
    const errPt = modal(mob).getByRole("alert").filter({ hasText: "Falha no envio da foto:" });
    await errPt.waitFor({ timeout: 15000 }).catch(() => {});
    const errPtText = await errPt.textContent().catch(() => "");
    c.expect(/\(1 de 3 salvas — salve de novo para as outras 2\.\)$/.test(errPtText), "PT: partial-failure note", errPtText);
    c.expect((await saveMob.textContent()) === "Salvar 2 registros de evidência", "PT: 2 left in the queue", await saveMob.textContent());
    await saveMob.click();
    c.expect(await toastSeen(mob, "2 evidências salvas", 15000), "PT: toast '2 evidências salvas'");
    st = await seen(mob);
    const labelsPt = [...new Set(st.map((x) => x.label).filter(Boolean))];
    c.expect(labelsPt.includes("Salvando 2 de 3…") && labelsPt.includes("Salvando 1 de 2…") && labelsPt.includes("Salvando 2 de 2…"), "PT: 'Salvando i de n…' labels", labelsPt);
    r = await rows(IT.pt);
    c.expect(r.length === 3 && new Set(r.map((x) => x.file_name)).size === 3 && r.every((x) => x.description === "E3 lote no celular" && !x.ai_analysis),
      "PT: 3 distinct rows, same description, no AI", r.map((x) => x.file_name));
    await shot(c, mob, "pt-390-saved");
    await mob.context().close();
  });

  await run("e4theme", "E4: dark theme — follows the device (no cookie), toggle device->light->dark->device (data-theme, cookie, colours, EN/PT labels), SSR with the cookie (no flash, no hydration error), print stays light, text contrast >= AA on every screen in dark, onAccent on accent fills, PDF keeps literal colours", async (c) => {
    const LIGHT = { bg: "rgb(240, 244, 248)", text: "rgb(30, 45, 61)" };
    const DARK = { bg: "rgb(14, 21, 29)", text: "rgb(228, 236, 244)", onAccent: "rgb(11, 21, 32)", blu: "rgb(134, 184, 255)" };
    const state = (page) => page.evaluate(() => ({
      theme: document.documentElement.dataset.theme ?? null,
      scheme: getComputedStyle(document.documentElement).colorScheme,
      body: getComputedStyle(document.body).backgroundColor,
      text: getComputedStyle(document.body).color,
      root: document.getElementById("app-root") ? getComputedStyle(document.getElementById("app-root")).backgroundColor : null,
      metas: [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => `${m.getAttribute("media") || "*"}=${m.content}`),
    }));
    const themeCookie = async (page) => (await page.context().cookies()).find((k) => k.name === "ss75-cmp.theme") || null;
    const toggle = (page) => page.locator('button[aria-label^="Theme:"], button[aria-label^="Tema:"]').first();
    const label = (page) => toggle(page).getAttribute("aria-label");
    const hydrationErrors = () => c.console.filter((m) => /hydrat|Minified React error #(418|419|421|422|423|425)|did not match/i.test(m));

    // Contrast of every visible text node (and filled form control) against
    // its effective background: ancestors' backgrounds composited until an
    // opaque one; colours normalised through a 1x1 canvas (handles rgb(),
    // color(srgb …) and color-mix() results alike); ancestor opacity folded
    // into the text colour. Need 4.5:1, or 3:1 for >= 24px / >= 18.66px bold.
    // Exemptions (WCAG): (1) disabled controls (1.4.3 "inactive user
    // interface component") are skipped; (2) aria-hidden glyphs are
    // decorative / graphical, so they are held to the 3:1 non-text minimum
    // (1.4.11) instead of 4.5:1; (3) text over a background-image (the
    // loading skeleton's gradient) can't be measured and is only counted.
    const contrast = (page, scope = "body") => page.evaluate((scope) => {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 1;
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      const rgba = (s) => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = "rgba(0, 0, 0, 0)";
        ctx.fillStyle = s;
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        return [d[0], d[1], d[2], d[3] / 255];
      };
      const over = (top, bot) => [0, 1, 2].map((i) => top[i] * top[3] + bot[i] * (1 - top[3])).concat(1);
      const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
      const hex = (c) => "#" + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
      const measure = (el) => {
        const layers = [];
        let op = 1, unknown = false;
        for (let e = el; e; e = e.parentElement) {
          const cs = getComputedStyle(e);
          op *= Number(cs.opacity);
          if (cs.backgroundImage && cs.backgroundImage !== "none") { unknown = true; break; }
          const bg = rgba(cs.backgroundColor);
          if (bg[3] > 0) { layers.push(bg); if (bg[3] >= 0.99) break; }
        }
        if (unknown) return null;
        let bg = [255, 255, 255, 1];
        for (let i = layers.length - 1; i >= 0; i--) bg = over(layers[i], bg);
        const cs = getComputedStyle(el);
        const fg0 = rgba(cs.color);
        const fg = over([fg0[0], fg0[1], fg0[2], fg0[3] * op], bg);
        const L1 = lum(fg), L2 = lum(bg);
        return { ratio: (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05), fg: hex(fg), bg: hex(bg) };
      };
      const root = document.querySelector(scope);
      if (!root) return { n: 0, skipped: 0, min: null, bad: [`scope ${scope} not found`] };
      const els = new Set();
      const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = tw.nextNode(); n; n = tw.nextNode()) if (n.textContent.trim() && n.parentElement) els.add(n.parentElement);
      for (const f of root.querySelectorAll("input, select, textarea")) {
        if (["hidden", "checkbox", "radio", "file", "range", "color"].includes(f.type)) continue;
        if ((f.value || "").trim()) els.add(f);
      }
      let n = 0, skipped = 0, min = Infinity;
      const bad = [];
      for (const el of els) {
        if (["SCRIPT", "STYLE", "NOSCRIPT", "TITLE", "OPTION"].includes(el.tagName)) continue;
        if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2 || el.closest(".sr-only")) continue;
        if (el.closest(':disabled, [aria-disabled="true"]')) { skipped++; continue; }
        const m = measure(el);
        if (!m) { skipped++; continue; }
        const cs = getComputedStyle(el);
        const size = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700;
        const decorative = !!el.closest('[aria-hidden="true"]');
        const need = decorative || size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
        n++;
        min = Math.min(min, m.ratio);
        if (m.ratio < need) {
          const txt = (el.value || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
          bad.push(`"${txt}" ${m.fg} on ${m.bg} = ${m.ratio.toFixed(2)} < ${need} (${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""})`);
        }
      }
      return { n, skipped, min: Math.round(min * 100) / 100, bad };
    }, scope);
    const sweep = async (page, name, scope) => {
      await page.waitForTimeout(400); // DS.transition (0.18s) on cards
      const r = await contrast(page, scope);
      c.step(`${name}: ${r.n} text elements, min ${r.min}:1, ${r.skipped} exempt`);
      c.expect(r.n > 0 && r.bad.length === 0, `dark ${name}: every visible text >= AA`, r.bad.slice(0, 8));
      return r;
    };

    // ---- 1. device dark, no cookie -> dark palette, nothing stored
    const page = await newPage(c, "admin1-dark", { colorScheme: "dark" });
    await login(page, "admin1@test.local");
    let s = await state(page);
    c.expect(s.theme === null && s.body === DARK.bg && s.root === DARK.bg && s.text === DARK.text && s.scheme === "dark",
      "device dark, no choice: dark background/text, color-scheme dark, no data-theme", s);
    c.expect(!(await themeCookie(page)), "no theme cookie while following the device", await themeCookie(page));
    c.expect(s.metas.includes("(prefers-color-scheme: dark)=#111b26") && s.metas.includes("*=#2c3e52"), "theme-color metas per device scheme", s.metas);
    c.expect((await label(page)) === "Theme: device", "toggle label 'Theme: device'", await label(page));
    await shot(c, page, "device-dark");

    // ---- 2. the toggle cycles device -> light -> dark -> device
    const steps = [
      ["light", "Theme: light", LIGHT.bg, "light"],
      ["dark", "Theme: dark", DARK.bg, "dark"],
      [null, "Theme: device", DARK.bg, null],
    ];
    for (const [theme, lbl, bg, ck] of steps) {
      await toggle(page).click();
      s = await state(page); // no wait: must apply at once
      const cookie = await themeCookie(page);
      c.expect(s.theme === theme && s.body === bg && s.root === bg && (await label(page)) === lbl && (cookie?.value ?? null) === ck,
        `click -> ${lbl}: data-theme=${theme}, background ${bg}, cookie ${ck}`, { s, cookie, label: await label(page) });
      if (cookie) c.expect(cookie.path === "/" && cookie.sameSite === "Lax" && cookie.expires > Date.now() / 1000 + 300 * 86400, "cookie: path=/, SameSite=Lax, ~1 year", cookie);
    }
    await page.getByRole("button", { name: "PT", exact: true }).click();
    await page.waitForTimeout(300);
    const pt = [];
    pt.push(await label(page));
    for (let i = 0; i < 3; i++) { await toggle(page).click(); pt.push(await label(page)); }
    c.expect(JSON.stringify(pt) === JSON.stringify(["Tema: do aparelho", "Tema: claro", "Tema: escuro", "Tema: do aparelho"]), "PT labels: do aparelho -> claro -> escuro -> do aparelho", pt);
    c.expect((await toggle(page).getAttribute("title")) === (await label(page)), "title mirrors the aria-label");
    await page.getByRole("button", { name: "EN", exact: true }).click();
    await page.waitForTimeout(300);

    // ---- 3. device light + dark cookie: the server renders data-theme (no flash)
    const lp = await newPage(c, "insp1-light", { colorScheme: "light" });
    await login(lp, "insp1@test.local");
    s = await state(lp);
    c.expect(s.theme === null && s.body === LIGHT.bg && s.text === LIGHT.text && s.scheme === "light", "device light, no choice: light palette", s);
    await toggle(lp).click();
    await toggle(lp).click();
    c.expect((await themeCookie(lp))?.value === "dark" && (await state(lp)).body === DARK.bg, "picked dark on a light device");
    const html = await (await lp.request.get(`${APP}/dashboard`)).text();
    const htmlTag = (html.match(/<html\b[^>]*>/) || [""])[0];
    c.expect(/data-theme="dark"/.test(htmlTag), "server HTML: <html data-theme=\"dark\">", htmlTag);
    c.expect(/<meta name="theme-color" content="#111b26"/.test(html) && !/media="\(prefers-color-scheme/.test(html), "server HTML: one dark theme-color meta", (html.match(/<meta name="theme-color"[^>]*>/g) || []));
    c.expect(/aria-label="Theme: dark"/.test(html), "server HTML: toggle already labelled 'Theme: dark'");
    c.console.length = 0;
    // The very first paint: data-theme is in the HTML, the palette applies
    // before any script runs.
    await lp.reload({ waitUntil: "commit" });
    await lp.waitForFunction(() => document.body, null, { timeout: 10000 });
    const early = await lp.evaluate(() => ({ theme: document.documentElement.dataset.theme, body: getComputedStyle(document.body).backgroundColor }));
    c.expect(early.theme === "dark" && early.body === DARK.bg, "dark from the first paint after reload", early);
    await waitLoaded(lp);
    await lp.waitForTimeout(1500);
    c.expect((await label(lp)) === "Theme: dark", "toggle state after reload: dark", await label(lp));
    c.expect(hydrationErrors().length === 0, "no hydration error / warning in the console", hydrationErrors());
    // Printing always uses the light palette.
    await lp.emulateMedia({ media: "print" });
    s = await state(lp);
    c.expect(s.body === LIGHT.bg && s.text === LIGHT.text && s.scheme === "light", "print media: light palette even with the dark cookie", s);
    await lp.emulateMedia({ media: "screen" });
    await lp.context().close();

    // ---- 4. dark everywhere (admin: cookie dark on a dark device)
    await toggle(page).click();
    await toggle(page).click();
    c.expect((await state(page)).theme === "dark", "admin: dark picked");
    c.console.length = 0;
    await page.goto(`${APP}/dashboard`);
    await waitLoaded(page);
    await sweep(page, "dashboard");
    await gotoTab(page, "Zones & Items");
    await page.waitForTimeout(800);
    await sweep(page, "zones");
    // Item with readings (rate, table rows, delete ×) and the evidence
    // panel with a picked photo, then a saved record.
    await openItem(page, "E2E Rate Target");
    await sweep(page, "item modal (readings)", ".modal-overlay");
    const pngPath = path.join(ART, "..", ".state", "e4.png");
    fs.writeFileSync(pngPath, tinyPng({ tint: 90 }));
    await modal(page).locator('input[type="file"]:not([capture])').setInputFiles(pngPath);
    await modal(page).locator('img[alt="Selected photo preview"]').waitFor({ timeout: 10000 }).catch(() => {});
    await modal(page).locator('div:has(> label:text-is("Finding / Description")) > textarea').fill("E4 dark evidence");
    const saveEv = modal(page).getByRole("button", { name: "Save evidence record" });
    const saveCol = await saveEv.evaluate((b) => ({ color: getComputedStyle(b).color, bg: getComputedStyle(b).backgroundColor }));
    c.expect(saveCol.color === DARK.onAccent && saveCol.bg === DARK.blu, "accent button (Save evidence) in dark: dark onAccent text on light blue", saveCol);
    await sweep(page, "evidence panel (photo picked)", ".modal-overlay");
    await shot(c, page, "evidence-picked");
    await saveEv.click();
    const toastEl = page.getByRole("status").filter({ hasText: "Evidence saved" }).first();
    await toastEl.waitFor({ timeout: 15000 });
    await toastEl.evaluate((e) => e.setAttribute("data-e2e-toast", ""));
    const toastC = await contrast(page, "[data-e2e-toast]");
    c.expect(toastC.n > 0 && toastC.bad.length === 0, `toast 'Evidence saved' readable in dark (min ${toastC.min})`, toastC.bad);
    await modal(page).locator('img[alt="e4.png"]').waitFor({ timeout: 15000 }).catch(() => {});
    await sweep(page, "evidence panel (saved record)", ".modal-overlay");
    await shot(c, page, "evidence-saved");
    // Confirmation dialog (danger button) over the modal: admin's ×.
    page.__manualDialogs = true;
    await modal(page).locator("button", { hasText: /^×$/ }).last().click();
    await confirmDlg(page).waitFor({ timeout: 5000 });
    await sweep(page, "confirm dialog", '[role="alertdialog"]');
    const del = await confirmDlg(page).getByRole("button", { name: "Delete" }).evaluate((b) => getComputedStyle(b).color);
    c.expect(del === DARK.onAccent, "danger confirm button uses onAccent", del);
    await shot(c, page, "confirm");
    await confirmDlg(page).getByRole("button", { name: "Cancel" }).click();
    page.__manualDialogs = false;
    await page.keyboard.press("Escape");
    await modal(page).waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
    for (const [tab, name] of [["Risk Matrix", "risk matrix"], ["Schedule", "schedule"], ["Export", "export"]]) {
      await gotoTab(page, tab);
      await page.waitForTimeout(1200);
      await sweep(page, name);
      await shot(c, page, name.replace(/ /g, "-"));
    }
    // PDF export in dark: works, and the PDF paints literal colours (the
    // renderer can't resolve CSS variables).
    await page.context().addInitScript(() => {
      const orig = URL.createObjectURL;
      URL.createObjectURL = function (b) {
        if (b && b.type === "application/pdf") window.__e2ePdf = b;
        return orig.call(URL, b);
      };
    });
    await page.reload();
    await waitLoaded(page);
    await gotoTab(page, "Export");
    const pbtn = page.getByRole("button", { name: /Export PDF/ }).first();
    await pbtn.waitFor({ timeout: 15000 });
    const [popup] = await Promise.all([page.waitForEvent("popup", { timeout: 15000 }), pbtn.click()]);
    const pdf = await page.waitForFunction(() => window.__e2ePdf, null, { timeout: 240000, polling: 500 })
      .then(() => page.evaluate(async () => {
        const u8 = new Uint8Array(await window.__e2ePdf.arrayBuffer());
        let bin = ""; for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
        return btoa(bin);
      }))
      .catch((e) => ({ error: e.message.split("\n")[0] }));
    if (typeof pdf === "string") {
      const buf = Buffer.from(pdf, "base64");
      fs.writeFileSync(path.join(ART, "e4theme-export.pdf"), buf);
      let content = "";
      for (const m of buf.toString("latin1").matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
        try { content += zlib.inflateSync(Buffer.from(m[1], "latin1")).toString("latin1"); } catch {}
      }
      const fills = [...content.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) (?:rg|scn)\b/g)].map((m) => m.slice(1, 4).map((v) => Math.round(Number(v) * 255)));
      const textColour = fills.some(([r, g, b]) => Math.abs(r - 30) <= 1 && Math.abs(g - 45) <= 1 && Math.abs(b - 61) <= 1);
      c.expect(buf.toString("latin1").startsWith("%PDF-") && textColour && !/var\(--ds/.test(content),
        "PDF in dark mode: produced, body text #1e2d3d (literal light colours)", { size: buf.length, fills: fills.length });
    } else {
      c.expect(false, "PDF produced in dark mode", pdf);
    }
    if (!popup.isClosed()) await popup.close().catch(() => {});
    c.expect(!(await toastSeen(page, /PDF export failed/, 500)), "no 'PDF export failed' toast");
    // Admin pages and the 404.
    for (const [u, name] of [["/users", "users"], ["/audit-log", "audit log"], ["/no-such-page", "404"]]) {
      await page.goto(`${APP}${u}`);
      await page.waitForTimeout(2500);
      await sweep(page, name);
      await shot(c, page, name.replace(/ /g, "-"));
    }
    c.expect(hydrationErrors().length === 0, "no hydration error while browsing in dark", hydrationErrors());
    await page.context().close();

    // ---- 5. signed-out login page with the dark cookie (light device)
    const anon = await newPage(c, "anon-dark", { colorScheme: "light" });
    await anon.context().addCookies([{ name: "ss75-cmp.theme", value: "dark", url: APP }]);
    await anon.goto(`${APP}/login`);
    await anon.getByRole("button", { name: /sign in/i }).waitFor();
    s = await state(anon);
    c.expect(s.theme === "dark" && s.body === DARK.bg, "login page: dark from the cookie", s);
    await anon.locator('input[type="email"]').fill("someone@test.local");
    await sweep(anon, "login page");
    const sb = await anon.getByRole("button", { name: /sign in/i }).evaluate((b) => ({ color: getComputedStyle(b).color, bg: getComputedStyle(b).backgroundColor }));
    c.expect(sb.color === DARK.onAccent && sb.bg === DARK.blu, "login 'Sign in' (accent) uses onAccent", sb);
    await shot(c, anon, "login");
    await anon.context().close();

    // ---- 6. phone (390px), dark: bottom navigation incl. the '+' button
    const mob = await newPage(c, "insp1-390", { colorScheme: "dark", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await login(mob, "insp1@test.local");
    await sweep(mob, "390px dashboard + bottom nav");
    const plus = await mob.locator("nav.bottom-nav button[aria-label='+ New Item']").evaluate((b) => ({ color: getComputedStyle(b).color, dot: getComputedStyle(b.querySelector("span")).backgroundColor }));
    c.expect(plus.color === DARK.onAccent && plus.dot === DARK.blu, "bottom-nav '+' uses onAccent on the light-blue dot", plus);
    await shot(c, mob, "390");
    await mob.context().close();
    await sql("DELETE FROM evidences WHERE item_id = $1", [ID.rate]).catch(() => {});
  });

  await browser.close();
  await pool.end();

  // --------------------------------------------------------------- report
  const out = results.map((r) => ({
    id: r.id, title: r.title, status: r.status, ms: r.ms, failures: r.failures,
    steps: r.steps, dialogs: r.dialogs, csp: r.csp, cspConsole: r.cspConsole, console: r.console, network: r.network, screenshots: r.shots,
  }));
  fs.writeFileSync(path.join(ART, "results.json"), JSON.stringify(out, null, 2));
  console.log("\n================ SUMMARY");
  for (const r of out) console.log(`${r.status}  ${r.id}  ${r.title}${r.failures.length ? "\n      - " + r.failures.join("\n      - ") : ""}`);
  const failed = out.filter((r) => r.status === "FAIL").length;
  console.log(`\n${out.length - failed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});

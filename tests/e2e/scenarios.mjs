// End-to-end scenarios for the v1.15.0 data-integrity flows, driven with
// Playwright against the real Next.js build + the local fake Supabase.
// Run through run.sh (which starts everything); results land in
// $ARTIFACTS/results.json and screenshots in $ARTIFACTS/*.png.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "@e965/xlsx";

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
};
const USERS = {
  admin1: "00000000-0000-0000-0000-00000000a001",
  insp1: "00000000-0000-0000-0000-00000000c001",
  insp2: "00000000-0000-0000-0000-00000000c002",
};

// A real 32x32 PNG (orange/rust gradient), built with zlib so it is valid
// and visible in screenshots; far below the 500 KB client-compression cutoff.
function tinyPng() {
  const W = 32, H = 32;
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const o = y * (W * 3 + 1) + 1 + x * 3;
      raw[o] = 200 + (x % 50); raw[o + 1] = 60 + y * 3; raw[o + 2] = 20;
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
    chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
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
    this.shots = [];
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

async function newPage(chk, label) {
  const ctx = await browser.newContext({
    bypassCSP: true, // app CSP only allows https://*.supabase.co
    serviceWorkers: "block",
    acceptDownloads: true,
    viewport: { width: 1440, height: 1000 },
    locale: "en-US",
    timezoneId: "America/Sao_Paulo",
  });
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
  page.on("dialog", async (d) => {
    const answer = page.__dialogPolicy.length ? page.__dialogPolicy.shift() : true;
    chk.dialogs.push(`[${label}] ${d.type()}: "${d.message()}" -> ${answer ? "accept" : "dismiss"}`);
    if (answer) await d.accept();
    else await d.dismiss();
  });
  return page;
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
  // DataContext finished loading when the dashboard KPI row is rendered.
  await page.getByText(/inspected/).first().waitFor({ timeout: 60000 });
}

// The sidebar starts collapsed (icon-only buttons carry the label in title).
async function gotoTab(page, label) {
  await page.locator(`aside button[title="${label}"], nav button[title="${label}"], button[title="${label}"]`).first().click();
}

const modal = (page) => page.locator(".modal-card");
const nameInput = (page) => modal(page).locator('div:has(> label:text-is("Item Name / Tag")) > input');
const notesArea = (page) => modal(page).locator('div:has(> div:text-is("NOTES")) textarea');
const ifsWoInput = (page) => modal(page).locator('div:has(> label:text-matches("IFS WO|Work Order", "i")) > input').first();

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
    await page.locator('button[title="New Item"]').first().click();
    await page.getByText("New Item — select a zone").locator("..").getByText("Main Deck", { exact: true }).click();
    await modal(page).waitFor();
    const newId = (await one(
      "SELECT id FROM items WHERE created_by = $1 AND name = 'Untitled' ORDER BY created_at DESC LIMIT 1",
      [USERS.insp1]
    ))?.id;
    c.expect(!!newId, "draft row created on open", newId);
    await nameInput(page).fill("E2E New Item B");
    await shot(c, page, "new-modal");
    await modal(page).getByRole("button", { name: "Create Item" }).click();
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
    await openItem(page, "E2E Draft Target");
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
    await page.locator('button[title="New Item"]').first().click();
    await page.getByText("New Item — select a zone").locator("..").getByText("Main Deck", { exact: true }).click();
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
    c.expect(await modal(page).getByText("Enter a depth of 0 mm or more.").isVisible(), "negative depth -> validation message");
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
    await modal(page).locator('input[type="file"]').setInputFiles(pngPath);
    await modal(page).locator('div:has(> label:text-is("Finding / Description")) > textarea').fill("E2E rust bloom photo");
    await modal(page).getByRole("button", { name: "Save evidence record" }).click();
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
    await page.locator('button[title="New Item"]').first().click();
    await page.getByText("New Item — select a zone").locator("..").getByText("Main Deck", { exact: true }).click();
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
    c.expect(db1.notes === "committed but response lost", "server applied the first save", db1);
    c.expect(await modalOpen(page), "modal stays open (client saw a network error)");
    const a1 = await modal(page).locator('[role="alert"]').allInnerTexts();
    c.step(`alert after lost response: ${JSON.stringify(a1)}`);
    await shot(c, page, "lost-response");
    await modal(page).getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForTimeout(2500);
    const conflictShown = await modal(page).getByText(/Someone else changed this item/).isVisible().catch(() => false);
    const stillOpen = await modalOpen(page);
    c.step(`retry: modalOpen=${stillOpen} conflictBanner=${conflictShown}`);
    await shot(c, page, "retry");
    c.expect(!conflictShown, "retry of the user's own committed save is not reported as someone else's change",
      "conflict banner 'Someone else changed this item' shown for the user's own write");
    if (stillOpen && conflictShown) {
      await modal(page).getByRole("button", { name: "Save my changes on top" }).click();
      await modal(page).waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
    }
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
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await openItem(page, "E2E Draft Conflict Target");
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
    await page.locator('button[title="New Item"]').first().click();
    await page.getByText("New Item — select a zone").locator("..").getByText("Main Deck", { exact: true }).click();
    await modal(page).waitFor();
    const id = (await one("SELECT id FROM items WHERE created_by = $1 AND name = 'Untitled' ORDER BY created_at DESC LIMIT 1", [USERS.insp1]))?.id;
    const pngPath = path.join(ART, "..", ".state", "tiny.png");
    fs.writeFileSync(pngPath, tinyPng());
    await modal(page).locator('input[type="file"]').setInputFiles(pngPath);
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

  await run("g2", "Reading beyond numeric(6,3) range surfaces an error (not silent)", async (c) => {
    const page = await newPage(c, "insp1");
    await login(page, "insp1@test.local");
    await openItem(page, "E2E Reading Target");
    const depth = modal(page).locator('div:has(> label:text-is("Pit Depth (mm)")) > input');
    await depth.fill("1000");
    await modal(page).getByRole("button", { name: "+ Reading" }).click();
    await page.waitForTimeout(1500);
    const alerts = await modal(page).locator('[role="alert"]').allInnerTexts();
    c.expect(alerts.some((t) => /Reading not saved/.test(t)), "'Reading not saved' error shown", alerts);
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
    await modal(page).locator('input[type="file"]').setInputFiles(pngPath);
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

  await browser.close();
  await pool.end();

  // --------------------------------------------------------------- report
  const out = results.map((r) => ({
    id: r.id, title: r.title, status: r.status, ms: r.ms, failures: r.failures,
    steps: r.steps, dialogs: r.dialogs, console: r.console, network: r.network, screenshots: r.shots,
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

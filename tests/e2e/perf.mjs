// Load-performance harness (measurements, not pass/fail): the login page and
// the sign-in -> dashboard path of the real build against the local stack.
// The gateway's GW_LATENCY_MS stands in for real round-trips (every
// Supabase request, from the browser or from the app's server, waits that
// long), so serial round-trips show up as wall time.
//
//   PERF=1 GW_LATENCY_MS=150 bash tests/e2e/run.sh
//
// PERF_RUNS (default 3) cold runs; the table shows the median of each
// metric. Raw numbers go to $ARTIFACTS/perf.json.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { chromium } from "playwright";

const APP = process.env.APP_URL;
const GW = process.env.SUPABASE_URL_LOCAL;
const PASSWORD = process.env.E2E_PASSWORD;
const ART = process.env.ARTIFACTS;
const RUNS = Number(process.env.PERF_RUNS || 3);
const EMAIL = process.env.PERF_USER || "admin1@test.local";
const LATENCY = Number(process.env.GW_LATENCY_MS || 0);

// Production serves brotli; the local `next start` gzips. Report what the
// bytes would weigh as brotli so the numbers compare with Vercel's.
const br = (buf) =>
  zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
const kb = (n) => Math.round(n / 102.4) / 10;
const gwLog = async (since) => (await fetch(`${GW}/__ctl/log?since=${since}`)).json();

// Round-trips on the critical path: the longest chain of requests in which
// each one starts only after the previous one has finished.
function serialDepth(reqs) {
  const rs = [...reqs].sort((a, b) => a.t - b.t);
  const depth = [];
  rs.forEach((r, i) => {
    let d = 1;
    for (let j = 0; j < i; j++) if (rs[j].t + rs[j].ms <= r.t) d = Math.max(d, depth[j] + 1);
    depth.push(d);
  });
  return Math.max(0, ...depth);
}

// Every request the page makes to the app, classified.
function watchApp(page) {
  const list = [];
  page.on("request", (q) => {
    if (!q.url().startsWith(APP)) return;
    const kind =
      q.resourceType() === "document" ? "document"
      : q.headers()["rsc"] === "1" ? "rsc"
      : q.resourceType();
    list.push({ t: Date.now(), kind, url: q.url().slice(APP.length) });
  });
  return list;
}

const supabaseStats = (log) => {
  const reqs = log.filter((l) => l.method);
  return {
    supabaseRequests: reqs.length,
    fromServer: reqs.filter((r) => r.src === "server").length,
    fromBrowser: reqs.filter((r) => r.src === "browser").length,
    serialRoundTrips: serialDepth(reqs),
    requests: reqs.map((r) => `${r.src} ${r.method} ${r.url.split("?")[0]} +${r.t - reqs[0].t}ms ${r.ms}ms`),
  };
};

async function once(browser) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1440, height: 1000 }, locale: "en-US" });
  const page = await ctx.newPage();
  const out = {};

  // ---- 1. login page, cold cache
  const responses = [];
  page.on("response", (r) => responses.push(r));
  await page.goto(`${APP}/login`, { waitUntil: "networkidle" });
  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType("navigation")[0];
    return { ttfb: Math.round(n.responseStart - n.requestStart), load: Math.round(n.loadEventEnd) };
  });
  let js = 0, jsBr = 0, jsN = 0, fonts = 0, fontBytes = 0, supabaseClientInJs = false;
  for (const r of responses) {
    if (!r.url().startsWith(APP)) continue;
    const body = await r.body().catch(() => null);
    if (!body) continue;
    const type = r.request().resourceType();
    if (type === "script") {
      jsN += 1;
      js += (await r.request().sizes()).responseBodySize;
      jsBr += br(body);
      // auth-js's password grant: present only when supabase-js is bundled.
      if (body.includes("grant_type=password")) supabaseClientInJs = true;
    } else if (type === "font") {
      fonts += 1;
      fontBytes += body.length;
    }
  }
  out.login = {
    ttfbMs: nav.ttfb, loadMs: nav.load, requests: responses.length, scripts: jsN,
    jsKbWire: kb(js), jsKbBrotli: kb(jsBr), fonts, fontKb: kb(fontBytes), supabaseClientInJs,
  };
  page.removeAllListeners("response");

  // ---- 2. sign in -> dashboard with real data
  const app = watchApp(page);
  const signIn = async () => {
    let itemsBytes = 0, itemsBr = 0, itemPages = 0;
    const onItems = async (r) => {
      if (!r.url().startsWith(`${GW}/rest/v1/items?select=`) || r.request().method() !== "GET") return;
      const body = await r.body().catch(() => null);
      if (!body) return;
      itemPages += 1;
      itemsBytes += body.length;
      itemsBr += br(body);
    };
    page.on("response", onItems);
    const a0 = app.length;
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD);
    const t0 = Date.now();
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 60000 });
    await page.waitForFunction(
      () => (document.querySelector("main.app-content")?.innerText || "").trim().length > 40,
      null,
      { timeout: 60000 }
    );
    const t1 = Date.now();
    await page.waitForTimeout(300); // responses still being read
    page.off("response", onItems);
    const during = app.slice(a0).filter((a) => a.t <= t1);
    return {
      wallMs: t1 - t0,
      ...supabaseStats((await gwLog(t0)).filter((l) => l.t <= t1)),
      appDocOrRsc: during.filter((a) => a.kind === "document" || a.kind === "rsc").map((a) => `${a.kind} ${a.url}`),
      appRequests: during.length,
      itemPages, itemsKb: kb(itemsBytes), itemsKbBrotli: kb(itemsBr),
    };
  };
  out.signIn = await signIn();

  // ---- 3. warm navigation: client tabs, then a server-rendered admin page
  await page.waitForLoadState("networkidle");
  const measure = async (label, act, ready) => {
    const a0 = app.length;
    const s = Date.now();
    await act();
    await ready();
    const e = Date.now();
    await page.waitForTimeout(200);
    const log = (await gwLog(s)).filter((l) => l.t <= e);
    const st = supabaseStats(log);
    out[label] = {
      wallMs: e - s,
      supabaseRequests: st.supabaseRequests,
      serialRoundTrips: st.serialRoundTrips,
      requests: st.requests,
      appDocOrRsc: app.slice(a0).filter((x) => x.kind === "document" || x.kind === "rsc").length,
    };
  };
  await measure(
    "tabZones",
    () => page.locator('button[title="Zones & Items"]').first().click(),
    () => page.getByText(/· \d+ items/).first().waitFor()
  );
  await measure(
    "tabRisk",
    () => page.locator('button[title="Risk Matrix"]').first().click(),
    () => page.waitForURL(/tab=risk/)
  );
  await measure(
    "navUsers",
    () => page.locator('a[href="/users"]').first().click(),
    () => page.getByText("viewer1@test.local").first().waitFor({ timeout: 60000 })
  );

  // ---- 4. the same device signs in again (HTTP cache and storage kept)
  await ctx.clearCookies();
  await page.goto(`${APP}/login`, { waitUntil: "networkidle" });
  out.signInAgain = await signIn();
  await ctx.close();
  return out;
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
};

async function main() {
  const browser = await chromium.launch();
  const runs = [];
  // One throwaway run: first hits compile/warm the server's caches.
  await once(browser);
  for (let i = 0; i < RUNS; i++) runs.push(await once(browser));
  await browser.close();
  fs.writeFileSync(path.join(ART, "perf.json"), JSON.stringify({ latencyMs: LATENCY, runs }, null, 2));

  const m = (sec, key) => median(runs.map((r) => r[sec][key]));
  const rows = [
    ["login: TTFB (ms)", m("login", "ttfbMs")],
    ["login: load event (ms)", m("login", "loadMs")],
    ["login: requests", m("login", "requests")],
    ["login: scripts", m("login", "scripts")],
    ["login: JS KB (wire, gzip)", m("login", "jsKbWire")],
    ["login: JS KB (brotli q11)", m("login", "jsKbBrotli")],
    ["login: fonts (files / KB)", `${m("login", "fonts")} / ${m("login", "fontKb")}`],
    ["login: supabase-js in initial JS", runs[0].login.supabaseClientInJs],
    ["sign-in -> data: wall (ms)", m("signIn", "wallMs")],
    ["sign-in -> data: Supabase requests (server / browser)", `${m("signIn", "supabaseRequests")} (${m("signIn", "fromServer")} / ${m("signIn", "fromBrowser")})`],
    ["sign-in -> data: serial Supabase round-trips", m("signIn", "serialRoundTrips")],
    ["sign-in -> data: document/RSC requests to the app", runs[0].signIn.appDocOrRsc.length],
    ["sign-in -> data: requests to the app", m("signIn", "appRequests")],
    ["sign-in -> data: item pages", m("signIn", "itemPages")],
    ["sign-in -> data: items KB (raw / brotli)", `${m("signIn", "itemsKb")} / ${m("signIn", "itemsKbBrotli")}`],
    ["sign-in again, same device: wall (ms)", m("signInAgain", "wallMs")],
    ["sign-in again, same device: serial Supabase round-trips", m("signInAgain", "serialRoundTrips")],
    ["warm tab -> Zones (ms)", m("tabZones", "wallMs")],
    ["warm tab -> Risk (ms)", m("tabRisk", "wallMs")],
    ["warm nav -> /users (ms)", m("navUsers", "wallMs")],
    ["warm nav -> /users: serial Supabase round-trips", m("navUsers", "serialRoundTrips")],
  ];
  console.log(`\n================ PERF (GW_LATENCY_MS=${LATENCY}, median of ${RUNS})`);
  for (const [k, v] of rows) console.log(`${k.padEnd(56)} ${v}`);
  console.log("\nsign-in requests (first run):");
  for (const r of runs[0].signIn.requests) console.log(`  ${r}`);
  console.log(`  app: ${runs[0].signIn.appDocOrRsc.join(" | ")}`);
  console.log("\n/users requests (first run):");
  for (const r of runs[0].navUsers.requests) console.log(`  ${r}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});

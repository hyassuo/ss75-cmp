# PLAN: Security hardening consolidation — setup.sql final state, middleware, API hygiene

**Rank: 5 of 5.** Independent of plans 2–4. **Must land before onboarding a
second unit (NS-59 or any other)** — several closed gaps are latent only
because a single unit exists today.

## Goal

The app survived 5 hardening rounds and the per-route auth is solid
(`sameOrigin` + `requireUser`/`requireAdmin` everywhere, service-role key
admin-gated). Four residual issues remain:

1. **`supabase-setup.sql` does not produce a hardened database on its own.**
   It has absorbed hardening rounds 1–3, but NOT round 4: a fresh install
   from `supabase-setup.sql` alone ships **globally-scoped admin policies**
   (`units_admin_all`, `profiles_admin_all`, `profiles_select_self_or_admin`,
   `zones_admin_all`, and the four `*_delete_admin` policies) — any admin can
   reach every unit's data via direct PostgREST the moment a second unit
   exists. The fix only lands if the operator also remembers to run
   `supabase-hardening-4.sql`.
2. **The middleware auth gate is skippable by anyone.** Any request with a
   forgeable `next-router-prefetch: 1` / `purpose: prefetch` header bypasses
   the session check entirely (`lib/supabase/middleware.ts:13-19`). Data is
   still safe (RLS + `app/(app)/layout.tsx:14-29` re-checks), but the outer
   gate should not be optional to unauthenticated clients.
3. **The four `app/api/users/*` routes leak raw Supabase/GoTrue error strings
   to the client and have no rate limit**; every JSON-body route 500s on a
   malformed body instead of 400.
4. **The AI route returns Gemini's parsed JSON verbatim** with no server-side
   re-validation of the enums/ranges (`app/api/ai/analyze-photo/route.ts:195-197`)
   — it trusts the model to honor `responseSchema`.

## Files to touch

| File | Change |
|---|---|
| `supabase-setup.sql` | port round-4 policies + `search_path` on `handle_new_user` |
| `README.md` | schema-table update |
| `lib/supabase/middleware.ts` | prefetch skip requires a Supabase cookie |
| `app/api/users/create/route.ts` | JSON guard, generic errors, rate limit |
| `app/api/users/delete/route.ts` | JSON guard, generic errors, rate limit |
| `app/api/users/reset/route.ts` | JSON guard, generic errors, rate limit (tighter) |
| `app/api/users/update/route.ts` | JSON guard, generic errors, rate limit |
| `app/api/ai/analyze-photo/route.ts` | JSON guard, output validation |
| `app/api/ifs/search/route.ts` | JSON guard |

## Steps (in order)

### 1. `lib/supabase/middleware.ts` — close the anonymous prefetch bypass

Replace the block at lines 13–19:

```ts
// Prefetch requests are background hovers/viewport hints — skip the
// Supabase auth round-trip so section switching stays snappy for
// signed-in users. Unauthenticated requests never take this shortcut:
// the prefetch headers are client-controlled (trivially forged with
// curl), so without a Supabase session cookie present we fall through
// to the full check + redirect. (Real auth lives in the server layouts
// and RLS; this gate is defense-in-depth.)
const isPrefetch =
  request.headers.get("next-router-prefetch") === "1" ||
  request.headers.get("purpose") === "prefetch" ||
  (request.headers.get("sec-purpose") ?? "").includes("prefetch");
const hasSupabaseCookie = request.cookies
  .getAll()
  .some((c) => c.name.startsWith("sb-"));
if (isPrefetch && hasSupabaseCookie) {
  return supabaseResponse;
}
```

### 2. `supabase-setup.sql` — make a fresh install land on the final state

Port `supabase-hardening-4.sql` into `supabase-setup.sql` by replacing these
blocks (policy names are identical — copy the CREATE POLICY bodies **verbatim**
from `supabase-hardening-4.sql`, they are the source of truth):

| In setup.sql (approx. lines) | Replace with hardening-4 version (lines) |
|---|---|
| `units_admin_all` (377–379) | hardening-4: 116–126 (scoped `AND id = public.current_user_unit()`) |
| `profiles_select_self_or_admin` (385–389) | hardening-4: 50–58 (admin branch scoped to own unit) |
| `profiles_admin_all` (393–395) | hardening-4: 61–71 (USING + WITH CHECK, unit-scoped) |
| `zones_admin_all` (407–409) | hardening-4: 128–132 — **delete the CREATE POLICY entirely**, keep the `DROP POLICY IF EXISTS`, add the "read-only reference data" comment |
| `items_delete_admin` (435–437) | hardening-4: 74–79 |
| `readings_delete_admin` (463–465) | hardening-4: 81–90 |
| `evidences_delete_admin` (483–485) | hardening-4: 92–101 |
| `evidence_delete_admin` on storage.objects (536–540) | hardening-4: 103–113 |

Additionally:

- `handle_new_user` in setup.sql ends with
  `$$ LANGUAGE plpgsql SECURITY DEFINER;` (line ~341); the hardened version
  in `supabase-hardening.sql:42` adds `SET search_path = public`. Update
  setup.sql to match:
  `$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;`
- Near the `handle_new_user` definition add a comment block:
  ```sql
  -- NOTE: 'hyassuo@gmail.com' is the bootstrap admin (auto-active on first
  -- sign-in). After the first admin exists, this special case can be removed
  -- by re-running this function definition without the email checks.
  ```
- Do NOT renumber or restructure anything else in setup.sql; the file must
  stay a drop-in "paste and Run".

Keep `supabase-hardening*.sql` files unchanged — they remain the upgrade path
for existing databases and are idempotent no-ops after this change.

### 3. `README.md` — update the schema table

In the "Supabase schema" table: change the `supabase-setup.sql` row's purpose
to "Tables, RLS (final hardened state incl. rounds 1–4), triggers, storage
bucket, 1 unit + 14 DROPS zones. The base." and add one sentence under the
table: "Fresh installs need only `supabase-setup.sql` + the IFS files; the
`security-fixes`/`hardening*` files are kept as the in-place upgrade path for
databases created before v1.9 and re-run safely."

### 4. Shared JSON-body guard

The five mutating routes and the IFS search all call `await request.json()`
bare — a malformed body throws → 500. Add a tiny helper in
`lib/supabase/adminGuard.ts` (it's the shared server-guard module):

```ts
// Parse a JSON request body; null on malformed/empty input (caller 400s).
export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
```

In each route (`users/create`, `users/delete`, `users/reset`,
`users/update`, `ai/analyze-photo`, `ifs/search`), replace the
`(await request.json()) as {…}` expression with:

```ts
const body = await readJson<{ …same shape as before… }>(request);
if (!body) {
  return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
}
const { email, password } = body; // etc. — destructure as before
```

### 5. `app/api/users/*` — generic error messages + rate limits

For all four routes:

1. Import `rateLimit` from `@/lib/utils/rateLimit`. After the `requireAdmin`
   guard passes, add:
   - create/delete/update — shared budget:
     ```ts
     const rl = rateLimit(`users:${guard.ctx.userId}`, 30, 60_000);
     ```
   - reset — its own tighter budget (it sends email):
     ```ts
     const rl = rateLimit(`users-reset:${guard.ctx.userId}`, 5, 60_000);
     ```
   Then, identically to `analyze-photo/route.ts:154-159`:
   ```ts
   if (!rl.allowed) {
     return NextResponse.json(
       { error: "Too many requests. Please slow down." },
       { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
     );
   }
   ```
2. Replace every client-facing `error.message` from Supabase/GoTrue with a
   generic string and log the real error server-side. Locations and exact
   replacements:
   - `create/route.ts:38-43`: log `console.error("[users/create]", error);`
     return `{ error: "Could not create user" }`.
   - `create/route.ts:54-56` (activation): log
     `console.error("[users/create] activation", actErr);` return
     `{ error: "User created but could not be activated" }`, status 500.
   - `delete/route.ts:62-64`: log; return `{ error: "Could not delete user" }`.
   - `reset/route.ts:39-41`: log; return
     `{ error: "Could not send reset email" }`.
   - `update/route.ts:85-88`: log; return `{ error: "Could not update user" }`.

   Do NOT genericize the validation messages ("Valid email required",
   "Cannot delete the only active admin.", etc.) — those are intentional,
   safe, user-facing copy that `UserTable.tsx` displays.

### 6. `app/api/ai/analyze-photo/route.ts` — validate the model output

After `JSON.parse(clean)` succeeds, run the result through a sanitizer before
returning it. Add above the `POST` handler:

```ts
const CORROSION_TYPES = RESPONSE_SCHEMA.properties.corrosionType.enum as string[];
const ACTIONS = RESPONSE_SCHEMA.properties.immediateAction.enum as string[];
const FREQS = RESPONSE_SCHEMA.properties.inspectionFrequency.enum as string[];

// Gemini is *asked* for schema-compliant output, but nothing guarantees it.
// Core risk inputs (probability/consequence) are rejected when invalid;
// descriptive fields are coerced to safe fallbacks.
function sanitizeAnalysis(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "object" || raw === null) return null;
  const a = raw as Record<string, unknown>;
  const prob = Math.round(Number(a.probability));
  const cons = Math.round(Number(a.consequence));
  if (!Number.isFinite(prob) || prob < 1 || prob > 5) return null;
  if (!Number.isFinite(cons) || cons < 1 || cons > 5) return null;
  const num = (v: unknown, min: number, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : 0;
  };
  return {
    corrosionType: CORROSION_TYPES.includes(a.corrosionType as string)
      ? a.corrosionType
      : "Unknown",
    componentName:
      typeof a.componentName === "string" ? a.componentName.slice(0, 120) : "Unknown",
    probability: prob,
    consequence: cons,
    affectedAreaPct: num(a.affectedAreaPct, 0, 100),
    pitDepthEstMM: num(a.pitDepthEstMM, 0, 500),
    immediateAction: ACTIONS.includes(a.immediateAction as string)
      ? a.immediateAction
      : "Monitor",
    inspectionFrequency: FREQS.includes(a.inspectionFrequency as string)
      ? a.inspectionFrequency
      : "",
    findings: typeof a.findings === "string" ? a.findings.slice(0, 2000) : "",
    recommendation:
      typeof a.recommendation === "string" ? a.recommendation.slice(0, 2000) : "",
  };
}
```

And replace `return NextResponse.json(JSON.parse(clean));` with:

```ts
const sanitized = sanitizeAnalysis(JSON.parse(clean));
if (!sanitized) {
  console.error("[ai/analyze-photo] schema violation:", clean.slice(0, 1000));
  return NextResponse.json(
    { error: "AI returned invalid data. Please try again." },
    { status: 502 }
  );
}
return NextResponse.json(sanitized);
```

Note: `RESPONSE_SCHEMA.properties.…` — check how `AiJsonSchema` is typed in
`lib/ai/client.ts`; if the `enum` access doesn't typecheck, declare the three
string arrays as standalone consts and reference them from both the schema
and the sanitizer (single source of truth, no duplication).

### 7. Verify and ship

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

## Edge cases a weaker model would miss

1. **Do NOT delete the prefetch skip entirely.** It exists for section-switch
   latency (its comment says why). The fix is conditioning it on a Supabase
   cookie, not removing it. A forged `sb-` cookie + prefetch header still
   skips the middleware — that is fine: the middleware was never the real
   gate; `app/(app)/layout.tsx` `getUser()` + RLS are, and a junk cookie
   fails there.
2. **Policy port must be verbatim.** The hardening-4 policies reference
   `public.current_user_unit()` — already defined in setup.sql (lines
   368–371) with the `active = true` guard, so no helper functions need
   porting. Don't "improve" the SQL while copying.
3. **`zones_admin_all` is a DROP-only change.** After the port, zones have a
   SELECT policy and nothing else — RLS default-denies writes for
   `authenticated`. Do not add a replacement write policy.
4. **Keep the hardening files.** Existing production DBs upgrade by running
   them; deleting them breaks the documented upgrade path. They are
   idempotent (`DROP POLICY IF EXISTS` + `CREATE`).
5. **`sameOrigin` stays as-is.** Its no-Origin pass-through is documented,
   intentional defense-in-depth (SameSite=Lax cookies are the real CSRF
   gate). Don't "fix" it to reject missing Origin — that breaks
   server-to-server calls and changes nothing for browsers.
6. **The rate limiter is per-instance** (its file comment says so). The
   limits here are belt-and-suspenders against a hammering client, not hard
   global caps. Do not attempt to add Redis/KV in this plan.
7. **`analyze-photo` parses the body BEFORE its try/catch** (line 168 vs
   185). When adding the `readJson` guard, keep it before the `try` — do not
   accidentally move the Gemini call out of the try.
8. **Don't tighten `users/create` password/email validation beyond what's
   there.** GoTrue re-validates; changing user-facing rules is product scope,
   not hygiene.
9. **The `inspectionFrequency: ""` fallback is deliberate** — the client
   (`ItemModal.applyAI`) checks `FREQUENCIES.includes(freq)` and skips empty
   strings, so an off-list model answer degrades to "no suggestion" instead
   of a bogus schedule.

## Acceptance criteria

Local (`npm run dev`), using curl with NO cookies:

- [ ] `curl -s -o /dev/null -w "%{http_code}" -H "next-router-prefetch: 1" http://localhost:3000/dashboard`
      → `307` (redirect to /login). Before this change it was `200`.
- [ ] Same request WITH a real logged-in browser session still skips the auth
      round-trip (verify: navigation between tabs stays snappy; no functional
      change for signed-in users).
- [ ] `curl -s -X POST http://localhost:3000/api/users/create -H "Content-Type: application/json" -d 'not-json'`
      → `401` (unauth) — and from a logged-in admin session with a garbage
      body → `400 {"error":"Invalid JSON body"}` (was 500).
- [ ] 6 rapid reset-password calls from an admin session → 6th returns 429.
- [ ] Force a GoTrue failure (create a user with an email that already
      exists): response is `{"error":"Could not create user"}`; the real
      reason appears in the server log only.
- [ ] SQL: on a scratch Supabase project, run ONLY the new
      `supabase-setup.sql` (+ ifs files), then run the verification queries
      from `supabase-hardening-4.sql`'s VERIFICATION comment block — all
      pass without ever running the hardening files.
- [ ] Diff check: `CREATE POLICY` bodies for the 7 ported policies in
      setup.sql are byte-identical to `supabase-hardening-4.sql` (ignoring
      surrounding comments).
- [ ] AI flow still works end-to-end: photo → analysis → fields filled.
      Manually test that a doctored 502 path (temporarily make
      `sanitizeAnalysis` return null) shows the "AI returned invalid data"
      error in the modal.
- [ ] `npm run lint && npm run typecheck && npm test && npm run build` pass.

## Out of scope

- Redis/Upstash-backed global rate limiting.
- Removing the bootstrap admin email mechanism (documented instead).
- CSP nonces (`'unsafe-inline'` script-src is a known App Router limitation,
  already documented in `next.config.mjs`).
- Middleware `active`-flag checking (page layouts + RLS already enforce it;
  adding a profiles query per request to middleware is a latency trade not
  worth making).

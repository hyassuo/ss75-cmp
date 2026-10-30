import { beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalUuid } from "@/lib/utils/uuid";

// The /api/users update and delete routes, with the admin guard, the
// service-role client and the rate limiter replaced by stubs: what they
// check before touching the database, and how they report its answers.

const ADMIN = "0b9d4c1e-7a2f-4c3b-9d8e-1f2a3b4c5d6e";
const OTHER = "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b";
const UNIT = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

type Query = {
  table: string;
  select?: unknown[];
  update?: Record<string, unknown>;
  filters: [string, string, unknown][];
};
type Answer = { data?: unknown; error?: unknown; count?: number | null };

const db = vi.hoisted(() => ({
  queries: [] as Query[],
  // Answer for a query (single() or awaited builder); set per test.
  answer: (() => ({ data: null, error: null })) as (q: Query) => Answer,
  deleteUser: vi.fn<(id: string) => Promise<{ error: unknown }>>(),
  updateUserById: vi.fn<(id: string, attrs: unknown) => Promise<{ error: unknown }>>(),
}));

vi.mock("@/lib/supabase/server", () => {
  const from = (table: string) => {
    const q: Query = { table, filters: [] };
    db.queries.push(q);
    const chain = {
      select: (...a: unknown[]) => ((q.select = a), chain),
      update: (patch: Record<string, unknown>) => ((q.update = patch), chain),
      eq: (c: string, v: unknown) => (q.filters.push(["eq", c, v]), chain),
      is: (c: string, v: unknown) => (q.filters.push(["is", c, v]), chain),
      single: async () => db.answer(q),
      maybeSingle: async () => db.answer(q),
      then: (ok: (v: Answer) => unknown, ko: (e: unknown) => unknown) =>
        Promise.resolve(db.answer(q)).then(ok, ko),
    };
    return chain;
  };
  return {
    createClient: vi.fn(),
    createServiceClient: () => ({
      from,
      auth: { admin: { deleteUser: db.deleteUser, updateUserById: db.updateUserById } },
    }),
  };
});

vi.mock("@/lib/supabase/adminGuard", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/supabase/adminGuard")>();
  return {
    ...real,
    requireAdmin: vi.fn(async () => ({
      ok: true,
      ctx: { userId: ADMIN, email: "admin@test", role: "admin", unitId: UNIT },
    })),
  };
});

vi.mock("@/lib/utils/rateLimit", () => ({
  rateLimitShared: vi.fn(async () => ({ allowed: true, retryAfter: 0 })),
}));

const { POST: updateUser } = await import("@/app/api/users/update/route");
const { POST: deleteUser } = await import("@/app/api/users/delete/route");

function post(body: unknown): Request {
  return new Request("http://localhost/api/users/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function call(
  route: (r: Request) => Promise<Response>,
  body: unknown
): Promise<{ status: number; error?: string }> {
  const res = await route(post(body));
  const json = (await res.json()) as { error?: string };
  return { status: res.status, error: json.error };
}
const profileQueries = () => db.queries.filter((q) => q.table === "profiles");

beforeEach(() => {
  db.queries = [];
  db.answer = () => ({ data: null, error: null });
  db.deleteUser.mockReset().mockResolvedValue({ error: null });
  db.updateUserById.mockReset().mockResolvedValue({ error: null });
});

describe("canonicalUuid", () => {
  it("lower-cases a UUID in any case", () => {
    expect(canonicalUuid(ADMIN.toUpperCase())).toBe(ADMIN);
    expect(canonicalUuid(ADMIN)).toBe(ADMIN);
  });
  it("refuses anything else", () => {
    for (const bad of [
      undefined, null, 42, {}, "", "x", `{${ADMIN}}`, ` ${ADMIN}`, `${ADMIN} `,
      ADMIN.replace(/-/g, ""), ADMIN + "0", `urn:uuid:${ADMIN}`, "' OR 1=1 --",
    ]) {
      expect(canonicalUuid(bad)).toBeNull();
    }
  });
});

describe("POST /api/users/update: ids", () => {
  it("an upper-case copy of the admin's own id is still 'self'", async () => {
    for (const body of [
      { id: ADMIN.toUpperCase(), role: "viewer" },
      { id: ADMIN.toUpperCase(), active: false },
    ]) {
      const r = await call(updateUser, body);
      expect(r).toEqual({ status: 400, error: "You cannot demote or deactivate yourself." });
    }
    expect(db.queries).toEqual([]);
    expect(db.updateUserById).not.toHaveBeenCalled();
  });

  it("a malformed id is refused before any query", async () => {
    for (const id of ["not-a-uuid", `${OTHER}x`, 7]) {
      expect(await call(updateUser, { id, role: "viewer" })).toEqual({
        status: 400,
        error: "Invalid user id",
      });
    }
    expect(await call(updateUser, { role: "viewer" })).toEqual({
      status: 400,
      error: "User id required",
    });
    expect(db.queries).toEqual([]);
  });

  it("queries and updates with the canonical id", async () => {
    db.answer = (q) =>
      q.update ? { error: null } : { data: { role: "viewer", active: true, unit_id: UNIT } };
    const r = await call(updateUser, { id: OTHER.toUpperCase(), role: "inspector" });
    expect(r.status).toBe(200);
    for (const q of profileQueries()) {
      expect(q.filters).toContainEqual(["eq", "id", OTHER]);
    }
  });
});

describe("POST /api/users/delete: ids", () => {
  it("an upper-case copy of the admin's own id is still 'self'", async () => {
    expect(await call(deleteUser, { id: ADMIN.toUpperCase() })).toEqual({
      status: 400,
      error: "You cannot delete yourself.",
    });
    expect(db.queries).toEqual([]);
    expect(db.deleteUser).not.toHaveBeenCalled();
  });

  it("a malformed id is refused before any query", async () => {
    expect(await call(deleteUser, { id: "../admin" })).toEqual({
      status: 400,
      error: "Invalid user id",
    });
    expect(await call(deleteUser, {})).toEqual({ status: 400, error: "User id required" });
    expect(db.queries).toEqual([]);
    expect(db.deleteUser).not.toHaveBeenCalled();
  });

  it("deletes the canonical id", async () => {
    db.answer = () => ({ data: { role: "viewer", active: true, unit_id: UNIT } });
    expect((await call(deleteUser, { id: OTHER.toUpperCase() })).status).toBe(200);
    expect(db.deleteUser).toHaveBeenCalledWith(OTHER);
  });
});

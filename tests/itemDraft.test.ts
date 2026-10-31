import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearUserItemDrafts,
  loadItemDraft,
  saveItemDraft,
} from "@/lib/utils/itemDraft";

// A minimal localStorage (Map-backed, with key()/length like the real one).
function storage() {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    keys: () => [...m.keys()].sort(),
  };
}

const draft = { form: { name: "x" }, baseForm: { name: "" }, baseUpdatedAt: "t", savedAt: Date.now() };

describe("clearUserItemDrafts (explicit sign-out)", () => {
  let ls: ReturnType<typeof storage>;
  beforeEach(() => {
    ls = storage();
    vi.stubGlobal("window", { localStorage: ls });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("removes every draft of that user and nothing else", () => {
    saveItemDraft("u1", "item-a", draft);
    saveItemDraft("u1", "item-b", draft);
    saveItemDraft("u2", "item-a", draft);
    ls.setItem("ss75-cmp.lang", "pt");
    ls.setItem("ss75-cmp.itemDraft.u10.item-c", JSON.stringify(draft)); // a prefix of u1 is not u1
    clearUserItemDrafts("u1");
    expect(loadItemDraft("u1", "item-a")).toBeNull();
    expect(loadItemDraft("u1", "item-b")).toBeNull();
    expect(loadItemDraft("u2", "item-a")).not.toBeNull();
    expect(ls.keys()).toEqual([
      "ss75-cmp.itemDraft.u10.item-c",
      "ss75-cmp.itemDraft.u2.item-a",
      "ss75-cmp.lang",
    ]);
  });

  it("never throws without storage", () => {
    vi.stubGlobal("window", {
      get localStorage(): never {
        throw new Error("denied");
      },
    });
    expect(() => clearUserItemDrafts("u1")).not.toThrow();
  });
});

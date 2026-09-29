import { describe, expect, it } from "vitest";
import { normalize, searchItems } from "@/lib/domain/searchItems";
import { makeItem } from "./helpers";

const items = [
  makeItem({ id: "a", name: "Crane pedestal bolts", zone_id: "Z01" }),
  makeItem({ id: "b", name: "Mud pump discharge line", zone_id: "Z02", ifs_obj_id: "313-A1-01" }),
  makeItem({ id: "c", name: "Handrail", zone_id: "Z03", notes: "Corrosão severa na base" }),
  makeItem({ id: "d", name: "Old crane hook", zone_id: "Z01", archived: true }),
  makeItem({ id: "e", name: "Deck crane boom", zone_id: "Z01", ifs_wo: "WO-9981" }),
];
const zoneName = (zid: string) => ({ Z01: "Crown Level", Z02: "Pump Room", Z03: "Main Deck" })[zid] ?? "";
const ids = (r: { id: string }[]) => r.map((i) => i.id);

describe("normalize", () => {
  it("lowercases, strips accents and collapses spaces", () => {
    expect(normalize("  Corrosão   SEVERA ")).toBe("corrosao severa");
  });
});

describe("searchItems", () => {
  it("needs at least 2 characters", () => {
    expect(searchItems(items, "c")).toEqual([]);
    expect(searchItems(items, "  ")).toEqual([]);
  });

  it("ranks names starting with the query first, archived last", () => {
    expect(ids(searchItems(items, "crane", zoneName))).toEqual(["a", "e", "d"]);
  });

  it("finds IFS object ids and work orders", () => {
    expect(ids(searchItems(items, "313-a1"))).toEqual(["b"]);
    expect(ids(searchItems(items, "wo-9981"))).toEqual(["e"]);
  });

  it("matches notes ignoring accents", () => {
    expect(ids(searchItems(items, "corrosao"))).toEqual(["c"]);
  });

  it("requires every word, in any field", () => {
    expect(ids(searchItems(items, "crane crown", zoneName))).toEqual(["a", "e", "d"]);
    expect(ids(searchItems(items, "crane pump", zoneName))).toEqual([]);
  });

  it("matches the zone id and name", () => {
    expect(ids(searchItems(items, "pump room", zoneName))).toEqual(["b"]);
    expect(ids(searchItems(items, "z03"))).toEqual(["c"]);
  });

  it("ignores punctuation in codes", () => {
    expect(ids(searchItems(items, "313a1"))).toEqual(["b"]);
    expect(ids(searchItems(items, "wo9981"))).toEqual(["e"]);
  });

  it("ignores anything past 100 characters", () => {
    expect(ids(searchItems(items, "crane" + " ".repeat(200) + "zzz", zoneName))).toEqual(["a", "e", "d"]);
  });

  it("caps the number of results", () => {
    const many = Array.from({ length: 50 }, (_, n) => makeItem({ id: `m${n}`, name: `Valve ${n}` }));
    expect(searchItems(many, "valve")).toHaveLength(20);
    expect(searchItems(many, "valve", undefined, 5)).toHaveLength(5);
  });
});

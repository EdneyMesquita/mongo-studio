import { describe, expect, it } from "vitest";
import { collectionFor, guessPattern, keyText, otherCollection, relationsOf, tenantOf, valuesAt } from "./relations";
import type { Relation } from "../types/relations";

const rel = (over: Partial<Relation>): Relation => ({
  id: "r1",
  name: "Order shipments",
  from: { conn: "any", db: "shop", coll: "{tenant}_orders" },
  to: { conn: "cluster", db: "logistics", coll: "shipments" },
  rules: [[{ from: "key", op: "eq", to: "orderRef", as: "uuid-string" }]],
  ruleNotes: [],
  scope: [{ to: "store", value: "{tenant}" }],
  fromName: "shipments",
  toName: "order",
  pairs: {},
  draft: null,
  createdAt: "",
  updatedAt: "",
  ...over,
});

describe("relations", () => {
  it("reads the tenant from a collection name", () => {
    expect(tenantOf("{tenant}_orders", "berlin_orders")).toBe("berlin");
    expect(tenantOf("{tenant}_orders", "a.b_orders")).toBe("a.b");
    expect(tenantOf("{tenant}_orders", "berlin_customers")).toBeNull();
    expect(tenantOf("shared_x", "shared_x")).toBe("");
    expect(collectionFor("{tenant}_customers", "berlin")).toBe("berlin_customers");
  });

  it("finds both ends a collection takes part in, leaving drafts out", () => {
    const r = rel({});
    expect(relationsOf([r], "c1", "shop", "berlin_orders").map((e) => e.dir)).toEqual(["from"]);
    expect(relationsOf([r], "c2", "logistics", "shipments").map((e) => [e.dir, e.name])).toEqual([["to", "order"]]);
    expect(relationsOf([rel({ draft: { by: "x", at: "", why: "" } })], "c1", "shop", "berlin_orders")).toEqual([]);
    expect(relationsOf([rel({ from: { conn: "c9", db: "shop", coll: "{tenant}_orders" } })], "c1", "shop", "berlin_orders")).toEqual([]);
  });

  it("picks the other collection from the name or the scope field", () => {
    const r = rel({ from: { conn: "any", db: "logistics", coll: "shipments" }, to: { conn: "cluster", db: "shop", coll: "{tenant}_orders" } });
    const [end] = relationsOf([r], "c2", "logistics", "shipments");
    expect(otherCollection(end, "shipments")).toBeNull();
    const back = relationsOf([rel({})], "c2", "logistics", "shipments")[0];
    expect(otherCollection(back, "shipments", { store: "berlin" })).toBe("berlin_orders");
    const fwd = relationsOf([rel({})], "c1", "shop", "berlin_orders")[0];
    expect(otherCollection(fwd, "berlin_orders")).toBe("shipments");
  });

  it("guesses a tenant pattern only when siblings share the suffix", () => {
    expect(guessPattern("berlin_orders", ["berlin_orders", "acme_orders", "b_orders", "berlin_customers"])).toBe("{tenant}_orders");
    expect(guessPattern("shipments", ["shipments", "parcels"])).toBe("shipments");
  });

  it("reads values and key texts", () => {
    expect(valuesAt({ a: [{ b: 1 }, { b: 2 }] }, "a.b")).toEqual([1, 2]);
    expect(keyText({ $oid: "abc" })).toBe("abc");
    expect(keyText({ $binary: { base64: "AAECAwQFBgcICQoLDA0ODw==", subType: "04" } })).toBe("00010203-0405-0607-0809-0a0b0c0d0e0f");
  });
});

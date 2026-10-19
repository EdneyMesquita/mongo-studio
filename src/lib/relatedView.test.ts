import { describe, expect, it } from "vitest";
import {
  fieldPathOf,
  idFilterText,
  isOddRelated,
  linkFields,
  numberOf,
  relatedColumn,
  relatedDocLine,
  relatedSuggestions,
  relatedTotal,
} from "./relatedView";
import { columnKey, relationsOf, type RelationEnd } from "./relations";
import { parseQueryObject } from "./queryText";
import type { RelatedFound, Relation } from "../types/relations";

const relation: Relation = {
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
};
const [end] = relationsOf([relation], "c1", "shop", "berlin_orders") as [RelationEnd];
const [back] = relationsOf([relation], "c2", "logistics", "shipments") as [RelationEnd];

const shipment = (status: string, quantity: unknown, i: number) => ({
  _id: { $oid: `65f0c3a2e4b0a1b2c3d4e5f${i}` },
  orderRef: "m1",
  store: "berlin",
  status,
  product: `prod-${i}`,
  quantity,
  createdAt: { $date: "2026-10-01T10:00:00Z" },
});
const found = (docs: unknown[]): RelatedFound => ({ count: docs.length, rule: docs.length ? 0 : null, docs, aggregates: {} });

describe("related view", () => {
  it("gives a column its key as its id", () => {
    const col = relatedColumn(end, { kind: "count" });
    expect(col).toMatchObject({ kind: "count", relationId: "r1", dir: "from" });
    expect(col.id).toBe(columnKey(col));
  });

  it("reads numbers plain or wrapped", () => {
    expect(numberOf(3)).toBe(3);
    expect(numberOf({ $numberLong: "12" })).toBe(12);
    expect(numberOf({ $numberDecimal: "1.5" })).toBe(1.5);
    expect(numberOf("3")).toBeNull();
    expect(numberOf(null)).toBeNull();
  });

  it("totals count and sum columns, counts yes for exists, leaves first alone", () => {
    expect(relatedTotal(relatedColumn(end, { kind: "count" }), [1, 2, undefined, 0])).toBe("3");
    expect(relatedTotal(relatedColumn(end, { kind: "sum", field: "x" }), [{ $numberLong: "1000" }, 250.5])).toBe("1,250.5");
    expect(relatedTotal(relatedColumn(end, { kind: "exists" }), [true, false, true])).toBe("2 yes");
    expect(relatedTotal(relatedColumn(end, { kind: "first", field: "x" }), ["a"])).toBeNull();
  });

  it("marks a count other than 1 and a missing document as odd", () => {
    const count = relatedColumn(end, { kind: "count" });
    expect(isOddRelated(count, 1)).toBe(false);
    expect(isOddRelated(count, 0)).toBe(true);
    expect(isOddRelated(count, 3)).toBe(true);
    expect(isOddRelated(count, undefined)).toBe(false);
    expect(isOddRelated(relatedColumn(end, { kind: "exists" }), false)).toBe(true);
    expect(isOddRelated(relatedColumn(end, { kind: "first", field: "x" }), null)).toBe(false);
  });

  it("leaves the link and scope fields of the other side out", () => {
    expect([...linkFields(end)].sort()).toEqual(["_id", "orderRef", "store"]);
    expect([...linkFields(back)].sort()).toEqual(["_id", "key"]);
  });

  it("reads a related document as the end of its id and its first short fields", () => {
    const line = relatedDocLine(shipment("DELIVERED", 3, 1), linkFields(end));
    expect(line.id).toBe("d4e5f1");
    // a status-like field first, then a date, then the rest in order
    expect(line.fields.map(([k]) => k)).toEqual(["status", "createdAt", "product"]);
    expect(relatedDocLine({ _id: "x", note: "a".repeat(80), nested: { a: 1 }, n: 2 }, new Set(["_id"])).fields).toEqual([["n", 2]]);
  });

  it("suggests counts, a status-like field's values, sums and exists for a many relation", () => {
    const results = [
      found([shipment("DELIVERED", 3, 1), shipment("DELIVERED", 2, 2), shipment("RETURNED", 1, 3)]),
      found([shipment("DELIVERED", { $numberLong: "4" }, 4)]),
      found([]),
    ];
    const labels = relatedSuggestions(end, results).map((s) => s.label);
    expect(labels).toEqual([
      "Count of shipments",
      "Count where status = DELIVERED",
      "Count where status = RETURNED",
      "Sum of quantity",
      "Whether it has any shipments",
    ]);
    const where = relatedSuggestions(end, results)[1].column;
    expect(where).toMatchObject({ kind: "count", whereField: "status", whereValue: "DELIVERED" });
  });

  it("skips string fields with too many values", () => {
    const docs = Array.from({ length: 12 }, (_, i) => ({ _id: i, code: `c${i}`, kind: i % 2 ? "a" : "b" }));
    const labels = relatedSuggestions(end, [{ count: 12, rule: 0, docs, aggregates: {} }]).map((s) => s.label);
    expect(labels).toContain("Count where kind = a");
    expect(labels.some((l) => l.includes("code"))).toBe(false);
  });

  it("offers fields of the one document for a relation that finds one", () => {
    const labels = relatedSuggestions(back, [
      found([{ _id: "m1", key: "k1", status: "SENT", type: "text" }]),
      found([{ _id: "m2", key: "k2", status: "SENT", type: "image" }]),
    ]).map((s) => s.label);
    expect(labels).toEqual(["Whether there's a order", "order · status", "order · type"]);
  });

  it("offers a count and exists before anything is loaded", () => {
    expect(relatedSuggestions(end, []).map((s) => s.label)).toEqual(["Count of shipments", "Whether it has any shipments"]);
  });

  it("writes a filter of the found documents' ids the query bar reads", () => {
    const docs = [{ _id: { $oid: "65f0c3a2e4b0a1b2c3d4e5f6" } }, { _id: 7 }, { _id: "a" }];
    const text = idFilterText(docs)!;
    expect(text).toBe('{ _id: { $in: [ObjectId("65f0c3a2e4b0a1b2c3d4e5f6"), 7, "a"] } }');
    expect(parseQueryObject(text)).toEqual({ _id: { $in: [{ $oid: "65f0c3a2e4b0a1b2c3d4e5f6" }, 7, "a"] } });
    expect(idFilterText([{ _id: { $binary: { base64: "OyQRAeK7QlWMr0E2xWapYg==", subType: "04" } } }])).toBe(
      '{ _id: UUID("3b241101-e2bb-4255-8caf-4136c566a962") }',
    );
    expect(idFilterText([{}])).toBeNull();
  });

  it("names a field path without array indexes", () => {
    const doc = { items: [{ sku: "a" }], meta: { key: 1 } };
    expect(fieldPathOf(doc, ["items", "0", "sku"])).toBe("items.sku");
    expect(fieldPathOf(doc, ["meta", "key"])).toBe("meta.key");
  });
});

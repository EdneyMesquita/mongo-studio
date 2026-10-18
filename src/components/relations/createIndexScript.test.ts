import { describe, expect, it } from "vitest";
import { createIndexScript } from "./createIndexScript";
import { templateBridge } from "./fieldRows";

describe("createIndexScript", () => {
  it("creates one index on a named collection", () => {
    const s = createIndexScript("Shipments", { database: "logistics", collection: "shipments", keys: ["store", "orderRef"] });
    expect(s).toContain('db.getSiblingDB("logistics").getCollection("shipments").createIndex({ "store": 1, "orderRef": 1 });');
  });

  it("loops over a pattern's collections", () => {
    const s = createIndexScript("Customer", { database: "shop", collection: "{tenant}_customers", keys: ["key"] });
    expect(s).toContain("/^.+_customers$/.test(n)");
    expect(s).toContain('target.getCollection(name).createIndex({ "key": 1 });');
  });
});

describe("templateBridge", () => {
  const uuid = { $binary: { base64: "AAECAwQFBgcICQoLDA0ODw==", subType: "04" } };
  it("compares a template over UUIDs as UUID text", () => {
    expect(templateBridge("{customerId}-{key}", "as-stored", { customerId: uuid })).toBe("uuid-string");
    expect(templateBridge("{a}-{b}", "as-stored", { a: "x" })).toBe("as-stored");
    expect(templateBridge("customerId", "as-stored", { customerId: uuid })).toBe("as-stored");
  });
});

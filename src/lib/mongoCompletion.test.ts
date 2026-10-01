import { describe, expect, it } from "vitest";
import { suggest } from "./mongoCompletion";
import type { CompletionSource } from "./mongoCompletion";

const source: CompletionSource = {
  collections: async () => ["orders"],
  fields: async () => ["status", "total"],
};

const labels = async (text: string) => (await suggest(text, "filter", "orders", source)).items.map((i) => i.label);

describe("completion in relaxed query text", () => {
  it("offers fields at an unquoted key", async () => {
    expect(await labels("{ status: 'paid', ")).toContain("total");
    expect(await labels("{ st")).toContain("status");
  });

  it("skips comments in the query fields", async () => {
    // the brace and quote inside the comments must not count
    expect(await labels("{ a: 1, /* { 'x */ ")).toContain("total");
    expect(await labels("{\n  // it's { here\n  ")).toContain("status");
  });
});

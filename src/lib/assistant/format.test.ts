import { describe, expect, it } from "vitest";
import { compactJson } from "./format";
import { filterChangeSummary } from "./diff";
import { parseEdit } from "../valueEdit";

describe("compactJson", () => {
  it("re-spaces JSON as before", () => {
    expect(compactJson('{\n  "status": {"$in": ["a","b"]}\n}')).toBe('{ "status": { "$in": ["a", "b"] } }');
  });

  it("keeps mongosh-style text as written, without rewriting it to Extended JSON", () => {
    expect(compactJson("{\n  _id: ObjectId('65f0c3a2e4b0a1b2c3d4e5f6'), // the one\n  n: 1\n}")).toBe(
      "{ _id: ObjectId('65f0c3a2e4b0a1b2c3d4e5f6'), n: 1 }",
    );
  });
});

describe("filterChangeSummary", () => {
  it("compares relaxed and JSON filters as values", () => {
    expect(filterChangeSummary('{"status": "paid"}', "{ status: 'paid', total: { $gt: 100 } }")).toBe(
      "1 condition added",
    );
    expect(
      filterChangeSummary(
        '{"_id": {"$oid": "65f0c3a2e4b0a1b2c3d4e5f6"}}',
        '{ _id: ObjectId("65f0c3a2e4b0a1b2c3d4e5f6") }',
      ),
    ).toBe("no change");
    expect(filterChangeSummary("{}", "{ a: }")).toBe("filter rewritten");
  });
});

describe("parseEdit of a null field", () => {
  it("reads shell literals, and anything else as text", () => {
    expect(parseEdit('ObjectId("65f0c3a2e4b0a1b2c3d4e5f6")', "null")).toEqual({
      ok: true,
      value: { $oid: "65f0c3a2e4b0a1b2c3d4e5f6" },
    });
    expect(parseEdit("12", "null")).toEqual({ ok: true, value: 12 });
    expect(parseEdit("'quoted'", "null")).toEqual({ ok: true, value: "quoted" });
    expect(parseEdit("hello world", "null")).toEqual({ ok: true, value: "hello world" });
    expect(parseEdit("/api/v1/", "null")).toEqual({ ok: true, value: "/api/v1/" });
    expect(parseEdit("// note", "null")).toEqual({ ok: true, value: "// note" });
  });
});

import { describe, expect, it } from "vitest";
import { isUseLine } from "./consoleUse";

// The same cases as the backend's rewrite_use tests in scripting.rs.
describe("isUseLine", () => {
  it("matches a use line, with a semicolon and comment or without", () => {
    for (const line of ["use chat", "  use users;  // the users db", "use my-db;"]) {
      expect(isUseLine(line)).toBe(true);
    }
  });

  it("leaves JavaScript alone", () => {
    for (const line of ["const use = 1;", "use = 2", "use(x)", "user.find()", '"use strict";', "use chat extra", "// use chat"]) {
      expect(isUseLine(line)).toBe(false);
    }
  });
});

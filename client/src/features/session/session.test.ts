import { describe, expect, it } from "vitest";
import { nameFromEmail, portalForRole, portalHome } from "./session";

describe("portalForRole", () => {
  it("sends candidates to the candidate portal and everyone else to admin", () => {
    expect(portalForRole("candidate")).toBe("candidate");
    expect(portalForRole("recruiter")).toBe("admin");
    expect(portalForRole("admin")).toBe("admin");
    expect(portalHome("admin")).toBe("/admin");
    expect(portalHome("candidate")).toBe("/candidate");
  });
});

describe("nameFromEmail", () => {
  it("builds a readable name", () => {
    expect(nameFromEmail("arjun.mehta@example.com")).toBe("Arjun Mehta");
    expect(nameFromEmail("priya_raman@x.io")).toBe("Priya Raman");
  });
});

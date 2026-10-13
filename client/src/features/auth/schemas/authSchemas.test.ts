import { describe, expect, it } from "vitest";
import { defaultRouteFor, safeNextPath, validateLogin, validateRegister } from "./authSchemas";

describe("validateLogin", () => {
  it("accepts a valid email and any non-empty password", () => {
    expect(validateLogin({ email: "a@example.com", password: "x" })).toEqual({});
  });
  it("flags a malformed email and an empty password", () => {
    expect(validateLogin({ email: "nope", password: "" })).toEqual({
      email: "Enter a valid email address",
      password: "Enter your password",
    });
  });
});

describe("validateRegister", () => {
  const ok = { email: "a@example.com", password: "correct-horse-battery", confirmPassword: "correct-horse-battery" };
  it("accepts a good passphrase", () => expect(validateRegister(ok)).toEqual({}));
  it("rejects short passwords", () => {
    expect(validateRegister({ ...ok, password: "short", confirmPassword: "short" }).password).toMatch(/at least 10/);
  });
  it("rejects passwords over 72 bytes (counted in bytes, not characters)", () => {
    const long = "é".repeat(40); // 40 chars, 80 bytes
    expect(validateRegister({ ...ok, password: long, confirmPassword: long }).password).toMatch(/at most 72/);
  });
  it("flags mismatched confirmation", () => {
    expect(validateRegister({ ...ok, confirmPassword: "different-password" }).confirmPassword).toBe("Passwords do not match");
  });
});

describe("safeNextPath", () => {
  it.each(["/interviews", "/interviews/abc?x=1", "/"])("allows %s", (p) => expect(safeNextPath(p)).toBe(p));
  it.each([null, undefined, "", "https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "interviews"])(
    "rejects %s",
    (p) => expect(safeNextPath(p)).toBeNull()
  );
});

describe("defaultRouteFor", () => {
  it("sends candidates to their interviews and staff to the dashboard", () => {
    expect(defaultRouteFor("candidate")).toBe("/candidate");
    expect(defaultRouteFor("recruiter")).toBe("/admin");
    expect(defaultRouteFor("admin")).toBe("/admin");
  });
});

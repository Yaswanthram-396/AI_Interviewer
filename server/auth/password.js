const bcrypt = require("bcryptjs");

const COMMON = new Set([
  "password123", "password1234", "1234567890", "12345678910", "qwertyuiop", "qwerty12345",
  "iloveyou123", "admin123456", "welcome1234", "letmein1234", "changeme123", "passw0rd123",
]);

/** Returns an error message, or null if the password is acceptable. */
function checkPasswordPolicy(password, email = "") {
  if (typeof password !== "string") return "Password is required";
  if (password.length < 10) return "Password must be at least 10 characters";
  // bcrypt only uses the first 72 bytes; reject rather than silently truncate.
  if (Buffer.byteLength(password) > 72) return "Password must be at most 72 bytes";
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return "Password is too common";
  if (email && lower.includes(email.split("@")[0].toLowerCase()) && email.split("@")[0].length >= 4) {
    return "Password must not contain your email name";
  }
  if (/^(.)\1+$/.test(password)) return "Password is too simple";
  return null;
}

const hashPassword = (pw, cost) => bcrypt.hash(pw, cost);
const verifyPassword = (pw, hash) => bcrypt.compare(pw, hash);

module.exports = { checkPasswordPolicy, hashPassword, verifyPassword };

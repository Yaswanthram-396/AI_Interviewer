/** Error with an HTTP status and a client-safe code/message. */
class AuthError extends Error {
  constructor(code, status, message) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.status = status;
  }
}

module.exports = { AuthError };

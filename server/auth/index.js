const { loadAuthConfig } = require("./config");
const { createMongoAuthRepo } = require("./repo");
const { createAuthService } = require("./service");
const { createAuthHttp } = require("./http");

let instance = null;

/** Lazily builds the app-wide auth instance (Mongo-backed). */
function getAuth() {
  if (!instance) {
    const config = loadAuthConfig();
    const repo = createMongoAuthRepo({
      User: require("../models/user.model"),
      RefreshToken: require("../models/refreshToken.model"),
    });
    const service = createAuthService({ repo, config });
    instance = { config, service, ...createAuthHttp({ service, config }) };
  }
  return instance;
}

module.exports = { getAuth };

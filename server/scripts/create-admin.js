// Creates the first admin account. Usage:
//   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='long-passphrase' node scripts/create-admin.js
require("dotenv").config();
const mongoose = require("mongoose");
const { getAuth } = require("../auth");

(async () => {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, MONGODB_URI } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required");
  await mongoose.connect(MONGODB_URI);
  const user = await getAuth().service.createUser({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: "admin" });
  console.log(`Created admin ${user.email} (${user.id})`);
})()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());

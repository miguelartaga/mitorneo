// scripts/start-prod.js
const { spawn } = require("node:child_process");

// 1) Validar variables necesarias
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required to start the server.");
  process.exit(1);
}

// 2) Config host/port
const port = process.env.PORT || "3000";
const hostname = "0.0.0.0";

// 3) Arrancar Next en modo normal
const child = spawn(
  "node",
  ["node_modules/next/dist/bin/next", "start", "-H", hostname, "-p", port],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      HOSTNAME: hostname,
      PORT: port,
      NODE_ENV: "production",
    },
  }
);

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

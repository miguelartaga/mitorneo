// scripts/start-prod.js
const { existsSync } = require("node:fs");
const { spawn } = require("node:child_process");
const path = require("node:path");

// 1) Validar variables necesarias
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required to start the server.");
  process.exit(1);
}

// 3) Config host/port para Render
const port = process.env.PORT || "3000";
const hostname = "0.0.0.0";

// 4) Detectar si existe standalone server
const standaloneServer = path.join(process.cwd(), ".next", "standalone", "server.js");
const isStandalone = existsSync(standaloneServer);

// 5) Sin copia de assets: arrancar standalone tal cual

// 6) Preparar comando para arrancar Next
//    - Standalone: correr server.js desde su carpeta
//    - No-standalone: usar `next start`
let command = "node";
let args = [];
let cwd = process.cwd();

if (isStandalone) {
  // Ejecutar desde la carpeta standalone
  cwd = path.dirname(standaloneServer);
  args = ["server.js"];
} else {
  // Fallback normal
  args = ["node_modules/next/dist/bin/next", "start", "-H", hostname, "-p", port];
}

// 7) Arrancar servidor
const child = spawn(command, args, {
  stdio: "inherit",
  cwd,
  env: {
    ...process.env,
    HOSTNAME: hostname,
    PORT: port,
    NODE_ENV: "production",
  },
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

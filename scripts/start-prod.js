// scripts/start-prod.js
const { existsSync, mkdirSync, cpSync } = require("node:fs");
const { spawnSync, spawn } = require("node:child_process");
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

// 5) Si es standalone, copiar assets requeridos dentro del bundle standalone
//    (Next standalone no siempre incluye .next/static y public, por eso se copian)
if (isStandalone) {
  const standaloneRoot = path.dirname(standaloneServer);

  const staticSource = path.join(process.cwd(), ".next", "static");
  const staticTarget = path.join(standaloneRoot, ".next", "static");

  const publicSource = path.join(process.cwd(), "public");
  const publicTarget = path.join(standaloneRoot, "public");

  try {
    if (existsSync(staticSource)) {
      mkdirSync(path.dirname(staticTarget), { recursive: true });
      cpSync(staticSource, staticTarget, { recursive: true });
    } else {
      console.warn("Warning: .next/static not found. Did you run `next build`?");
    }

    if (existsSync(publicSource)) {
      mkdirSync(publicTarget, { recursive: true });
      cpSync(publicSource, publicTarget, { recursive: true });
    }
  } catch (err) {
    console.error("Failed copying standalone assets:", err);
    process.exit(1);
  }
}

// 6) Preparar comando para arrancar Next
//    - Standalone: correr server.js desde su carpeta (cwd correcto ✅)
//    - No-standalone: usar `next start`
let command = "node";
let args = [];
let cwd = process.cwd();

if (isStandalone) {
  // IMPORTANTE: ejecutar desde la carpeta standalone
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

#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const loadEnv = () => {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const [key, ...values] = trimmed.split("=");
      if (!key) return;
      let value = values.join("=").trim();
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      } else if (value.startsWith("'") && value.endsWith("'")) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    });
};

loadEnv();

const [, , tournamentId, categoryId] = process.argv;
const cookieValue =
  process.env.NEXTAUTH_SESSION_TOKEN ||
  process.env.NEXTAUTH_COOKIE ||
  process.env.MT_AUTH_COOKIE;

if (!tournamentId || !categoryId) {
  console.error(
    "Uso: node scripts/regenerate-playoff.js <tournamentId> <categoryId>"
  );
  process.exit(1);
}

  if (!cookieValue) {
    console.error(
      "Falta la cookie de sesión. Define NEXTAUTH_SESSION_TOKEN, NEXTAUTH_COOKIE o MT_AUTH_COOKIE con el valor apropiado."
    );
    process.exit(1);
  }

const endpoint = `http://localhost:3000/api/tournaments/${tournamentId}/fixtures/playoffs`;

const regenerate = async () => {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieValue.startsWith("mt_auth=")
        ? cookieValue
        : `next-auth.session-token=${cookieValue}`,
    },
    body: JSON.stringify({ categoryId, regenerate: true }),
  });
  const payload = await response.json().catch(() => null);
  console.log("Regenerar respuesta:", response.status, payload);
  if (!response.ok) {
    process.exitCode = 1;
  }
};

regenerate().catch((error) => {
  console.error("Error al regenerar el bracket:", error);
  process.exitCode = 1;
});

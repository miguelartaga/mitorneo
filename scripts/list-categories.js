#!/usr/bin/env node
const { PrismaClient } = require("@prisma/client");
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

const [, , tournamentId] = process.argv;

if (!tournamentId) {
  console.error("Uso: node scripts/list-categories.js <tournamentId>");
  process.exit(1);
}

const prisma = new PrismaClient();

const main = async () => {
  const categories = await prisma.tournamentCategory.findMany({
    where: { tournamentId },
    select: {
      categoryId: true,
      category: { select: { name: true } },
      drawType: true,
      playoffStatus: true,
    },
  });
  categories.forEach((category) => {
    console.log(
      `${category.categoryId} | ${category.category?.name ?? "sin nombre"} | ${category.drawType} | ${category.playoffStatus}`
    );
  });
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

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

const [, , tournamentId, categoryId] = process.argv;

if (!tournamentId || !categoryId) {
  console.error(
    "Uso: node scripts/inspect-playoff-bracket.js <tournamentId> <categoryId>"
  );
  process.exit(1);
}

const prisma = new PrismaClient();

const formatRegistration = (registration) => {
  if (!registration) return "Sin registro";
  const players = [registration.player, registration.partner, registration.partnerTwo]
    .filter(Boolean)
    .map((player) => `${player.firstName} ${player.lastName}`.trim());
  const nameLabel =
    registration.teamName?.trim() || players.join(" / ") || "Sin nombre";
  const groupTag = registration.groupName ? ` [${registration.groupName}]` : "";
  return `${nameLabel}${groupTag}`;
};

const describe = async () => {
  const registrations = await prisma.tournamentRegistration.findMany({
    where: { tournamentId, categoryId },
    select: {
      id: true,
      groupName: true,
      teamName: true,
      player: { select: { firstName: true, lastName: true } },
      partner: { select: { firstName: true, lastName: true } },
      partnerTwo: { select: { firstName: true, lastName: true } },
    },
  });

  const registrationById = new Map();
  registrations.forEach((registration) => {
    registrationById.set(registration.id, registration);
  });

  const slots = await prisma.playoffSlot.findMany({
    where: { tournamentId, categoryId },
    orderBy: [{ position: "asc" }],
    select: { position: true, entrantId: true },
  });

  console.log("Playoff slots (position -> entrant):");
  slots.forEach((slot) => {
    const label = slot.entrantId
      ? formatRegistration(registrationById.get(slot.entrantId))
      : "BYE";
    console.log(`  ${String(slot.position).padStart(2, "0")} -> ${label}`);
  });

  const matches = await prisma.tournamentMatch.findMany({
    where: {
      tournamentId,
      categoryId,
      stage: "PLAYOFF",
    },
    select: {
      id: true,
      teamAId: true,
      teamBId: true,
      createdAt: true,
      roundNumber: true,
    },
    orderBy: [{ createdAt: "asc" }],
  });

  const roundMap = new Map();
  matches.forEach((match) => {
    const round = match.roundNumber ?? 1;
    const list = roundMap.get(round) ?? [];
    list.push(match);
    roundMap.set(round, list);
  });
  const rounds = Array.from(roundMap.keys()).sort((a, b) => a - b);

  const printRound = (roundNumber, title) => {
    const list = roundMap.get(roundNumber) ?? [];
    console.log(`\n${title}:`);
    list.forEach((match, index) => {
      const labelA = match.teamAId
        ? formatRegistration(registrationById.get(match.teamAId))
        : "Vacío";
      const labelB = match.teamBId
        ? formatRegistration(registrationById.get(match.teamBId))
        : "Vacío";
      console.log(
        `  Match ${String(index + 1).padStart(2, "0")}: ${labelA} vs ${labelB}`
      );
    });
  };

  if (rounds.length === 0) {
    console.log("\nNo hay partidos de playoff.");
    return;
  }

  printRound(rounds[0], "Ronda 1 matches");
  if (rounds.length > 1) {
    printRound(rounds[1], "Ronda 2 (Cuartos) matches");
  }
    const labelA = match.teamAId
      ? formatRegistration(registrationById.get(match.teamAId))
      : "Vacío";
    const labelB = match.teamBId
      ? formatRegistration(registrationById.get(match.teamBId))
      : "Vacío";
    console.log(
      `  Match ${String(index + 1).padStart(2, "0")}: ${labelA} vs ${labelB}`
    );
  });
};

describe()
  .catch((error) => {
    console.error("Ocurrió un error:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

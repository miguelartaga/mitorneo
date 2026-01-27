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

const args = process.argv.slice(2);
const force = args.includes("--force");
const filteredArgs = args.filter((arg) => arg !== "--force");
const tournamentId = filteredArgs[0] || null;
const categoryId = filteredArgs[1] || null;

if (filteredArgs.length > 2) {
  console.error(
    "Uso: node scripts/backfill-order-hint.js [--force] [tournamentId] [categoryId]"
  );
  process.exit(1);
}

const prisma = new PrismaClient();

const buildSeedOrder = (bracketSize) => {
  if (bracketSize <= 1) return [1];
  if (bracketSize === 2) return [1, 2];
  const half = Math.floor(bracketSize / 2);
  const previous = buildSeedOrder(half);
  const order = [];
  previous.forEach((seed, index) => {
    const mirror = bracketSize + 1 - seed;
    if (index % 2 === 0) {
      order.push(seed, mirror);
    } else {
      order.push(mirror, seed);
    }
  });
  return order;
};

const keyForPair = (a, b) => {
  const left = a ?? "null";
  const right = b ?? "null";
  return [left, right].sort().join("|");
};

const backfillCategory = async ({ tournamentId, categoryId }) => {
  const matches = await prisma.tournamentMatch.findMany({
    where: {
      tournamentId,
      categoryId,
      stage: "PLAYOFF",
      isBronzeMatch: false,
    },
    select: {
      id: true,
      roundNumber: true,
      createdAt: true,
      teamAId: true,
      teamBId: true,
      orderHint: true,
    },
    orderBy: [{ createdAt: "asc" }],
  });

  if (matches.length === 0) return { updated: 0 };

  const slots = await prisma.playoffSlot.findMany({
    where: { tournamentId, categoryId },
    select: { position: true, entrantId: true },
    orderBy: { position: "asc" },
  });

  const roundNumbers = matches
    .map((match) => match.roundNumber ?? 1)
    .filter((value) => typeof value === "number");
  const firstRoundNumber = Math.min(...roundNumbers);

  const byRound = new Map();
  matches.forEach((match) => {
    const round = match.roundNumber ?? firstRoundNumber;
    const list = byRound.get(round) ?? [];
    list.push(match);
    byRound.set(round, list);
  });

  const updates = [];

  const roundOne = byRound.get(firstRoundNumber) ?? [];
  if (roundOne.length > 0) {
    let assigned = new Map();
    if (slots.length > 0) {
      const bracketSize = slots.length;
      const seedOrder = buildSeedOrder(bracketSize);
      const positionMap = new Map();
      slots.forEach((slot) => {
        positionMap.set(slot.position, slot.entrantId ?? null);
      });
      const expectedKeys = [];
      for (let index = 0; index < bracketSize / 2; index += 1) {
        const seedA = seedOrder[index * 2];
        const seedB = seedOrder[index * 2 + 1];
        const entrantA = positionMap.get(seedA) ?? null;
        const entrantB = positionMap.get(seedB) ?? null;
        expectedKeys.push({
          orderHint: index,
          key: keyForPair(entrantA, entrantB),
        });
      }
      const expectedByKey = new Map();
      expectedKeys.forEach((entry) => {
        const list = expectedByKey.get(entry.key) ?? [];
        list.push(entry.orderHint);
        expectedByKey.set(entry.key, list);
      });

      roundOne.forEach((match) => {
        const key = keyForPair(match.teamAId, match.teamBId);
        const list = expectedByKey.get(key);
        if (list && list.length > 0) {
          assigned.set(match.id, list.shift());
        }
      });

      const remainingHints = expectedKeys
        .map((entry) => entry.orderHint)
        .filter(
          (hint) => !Array.from(assigned.values()).includes(hint)
        );
      const remainingMatches = roundOne.filter((match) => !assigned.has(match.id));
      remainingMatches
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() -
            new Date(b.createdAt).getTime()
        )
        .forEach((match, index) => {
          assigned.set(match.id, remainingHints[index] ?? index);
        });
    } else {
      roundOne
        .slice()
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() -
            new Date(b.createdAt).getTime()
        )
        .forEach((match, index) => {
          assigned.set(match.id, index);
        });
    }

    roundOne.forEach((match) => {
      const hint = assigned.get(match.id);
      if (typeof hint !== "number") return;
      if (!force && typeof match.orderHint === "number") return;
      updates.push({ id: match.id, orderHint: hint });
    });
  }

  Array.from(byRound.entries())
    .filter(([round]) => round !== firstRoundNumber)
    .forEach(([round, list]) => {
      const sorted = list.slice().sort(
        (a, b) =>
          new Date(a.createdAt).getTime() -
          new Date(b.createdAt).getTime()
      );
      sorted.forEach((match, index) => {
        if (!force && typeof match.orderHint === "number") return;
        updates.push({ id: match.id, orderHint: index });
      });
    });

  if (updates.length === 0) return { updated: 0 };

  await prisma.$transaction(
    updates.map((update) =>
      prisma.tournamentMatch.update({
        where: { id: update.id },
        data: { orderHint: update.orderHint },
      })
    )
  );

  return { updated: updates.length };
};

const run = async () => {
  const where = {
    ...(tournamentId ? { tournamentId } : {}),
    ...(categoryId ? { categoryId } : {}),
    stage: "PLAYOFF",
  };
  const categories = await prisma.tournamentMatch.findMany({
    where,
    select: { tournamentId: true, categoryId: true },
    distinct: ["tournamentId", "categoryId"],
  });

  if (categories.length === 0) {
    console.log("No se encontraron partidos de playoff.");
    return;
  }

  let totalUpdated = 0;
  for (const entry of categories) {
    const result = await backfillCategory(entry);
    totalUpdated += result.updated;
    console.log(
      `Backfill ${entry.tournamentId}:${entry.categoryId} -> ${result.updated} updates`
    );
  }
  console.log(`Listo. Actualizados: ${totalUpdated}`);
};

run()
  .catch((error) => {
    console.error("Error en backfill:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


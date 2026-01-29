const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

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

const parseGames = (value) => {
  if (!Array.isArray(value)) return [];
  const games = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const a = entry.a;
    const b = entry.b;
    if (typeof a !== "number" || typeof b !== "number") continue;
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    games.push({ a, b });
  }
  return games;
};

const computeMatchWinnerSide = (games) => {
  if (!games.length) return null;
  let setsA = 0;
  let setsB = 0;
  for (const game of games) {
    if (game.a > game.b) setsA += 1;
    if (game.b > game.a) setsB += 1;
  }
  if (setsA === setsB) return null;
  return setsA > setsB ? "A" : "B";
};

const determineWinnerTeamId = (match) => {
  if (match.winnerSide === "A") return match.teamAId ?? null;
  if (match.winnerSide === "B") return match.teamBId ?? null;
  if (match.outcomeType && match.outcomeType !== "PLAYED") {
    if (match.outcomeSide === "A") return match.teamBId ?? null;
    if (match.outcomeSide === "B") return match.teamAId ?? null;
  }
  const inferred = computeMatchWinnerSide(parseGames(match.games));
  if (inferred === "A") return match.teamAId ?? null;
  if (inferred === "B") return match.teamBId ?? null;
  return null;
};

const resolveByeWinner = (match) => {
  if (match.teamAId && !match.teamBId) return match.teamAId;
  if (match.teamBId && !match.teamAId) return match.teamBId;
  return null;
};

const isMatchComplete = (match) => {
  const outcomeType = match.outcomeType ?? "PLAYED";
  if (outcomeType !== "PLAYED") return true;
  if (match.winnerSide) return true;
  return Array.isArray(match.games) && match.games.length > 0;
};

const sortMatches = (list) => {
  return [...list].sort((a, b) => {
    const orderA = typeof a.orderHint === "number" ? a.orderHint : null;
    const orderB = typeof b.orderHint === "number" ? b.orderHint : null;
    if (orderA !== null || orderB !== null) {
      if (orderA === null) return 1;
      if (orderB === null) return -1;
      if (orderA !== orderB) return orderA - orderB;
    }
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
};

loadEnv();

const [, , tournamentId, categoryArg] = process.argv;

if (!tournamentId || !categoryArg) {
  console.error("Uso: node scripts/repair-playoff-from-round1.js <tournamentId> <categoryId|abbrev>");
  process.exit(1);
}

const prisma = new PrismaClient();

const main = async () => {
  let categoryId = null;
  if (categoryArg.startsWith("cm") && categoryArg.length >= 20) {
    const existing = await prisma.tournamentCategory.findFirst({
      where: { tournamentId, categoryId: categoryArg },
      select: { categoryId: true },
    });
    if (existing) {
      categoryId = existing.categoryId;
    }
  }

  if (!categoryId) {
    const found = await prisma.tournamentCategory.findFirst({
      where: {
        tournamentId,
        category: {
          abbreviation: categoryArg,
        },
      },
      select: { categoryId: true, category: { select: { name: true, abbreviation: true } } },
    });
    if (!found) {
      console.error("No se encontro la categoria con ese id/abreviacion.");
      process.exit(1);
    }
    categoryId = found.categoryId;
    console.log(`Categoria encontrada: ${found.category.name} (${found.category.abbreviation})`);
  }

  const matches = await prisma.tournamentMatch.findMany({
    where: { tournamentId, categoryId, stage: "PLAYOFF", isBronzeMatch: false },
    select: {
      id: true,
      roundNumber: true,
      orderHint: true,
      teamAId: true,
      teamBId: true,
      winnerSide: true,
      outcomeType: true,
      outcomeSide: true,
      games: true,
      createdAt: true,
    },
  });

  if (!matches.length) {
    console.error("No hay partidos de playoff para esta categoria.");
    process.exit(1);
  }

  const rounds = new Map();
  matches.forEach((match) => {
    const round = match.roundNumber ?? 1;
    const list = rounds.get(round) ?? [];
    list.push({ ...match });
    rounds.set(round, list);
  });

  const roundNumbers = Array.from(rounds.keys()).sort((a, b) => a - b);
  const sortedRounds = new Map();
  rounds.forEach((list, round) => {
    sortedRounds.set(round, sortMatches(list));
  });

  const firstRound = roundNumbers[0];
  const roundOneMatches = sortedRounds.get(firstRound) ?? [];
  if (!roundOneMatches.length) {
    console.error("No hay partidos de primera ronda.");
    process.exit(1);
  }

  let prevWinners = roundOneMatches.map((match) => {
    return determineWinnerTeamId(match) ?? resolveByeWinner(match);
  });

  const updates = [];
  const warnings = [];

  for (let rIndex = 1; rIndex < roundNumbers.length; rIndex += 1) {
    const round = roundNumbers[rIndex];
    const roundMatches = sortedRounds.get(round) ?? [];
    for (let i = 0; i < roundMatches.length; i += 1) {
      const match = roundMatches[i];
      const teamAId = prevWinners[i * 2] ?? null;
      const teamBId = prevWinners[i * 2 + 1] ?? null;
      const completed = isMatchComplete(match);
      if (completed && (match.teamAId !== teamAId || match.teamBId !== teamBId)) {
        warnings.push(`R${round} match ${match.id} ya tiene resultado, no se actualiza.`);
        continue;
      }
      if (match.teamAId !== teamAId || match.teamBId !== teamBId) {
        match.teamAId = teamAId;
        match.teamBId = teamBId;
        updates.push({ id: match.id, teamAId, teamBId });
      }
    }
    prevWinners = roundMatches.map((match) => {
      return determineWinnerTeamId(match) ?? resolveByeWinner(match);
    });
  }

  if (!updates.length) {
    console.log("No hay cambios para aplicar.");
  } else {
    console.log(`Aplicando ${updates.length} actualizaciones...`);
    for (const update of updates) {
      await prisma.tournamentMatch.update({
        where: { id: update.id },
        data: {
          teamAId: update.teamAId,
          teamBId: update.teamBId,
        },
      });
    }
  }

  if (warnings.length) {
    console.log("Advertencias:");
    warnings.forEach((line) => console.log(`- ${line}`));
  }
};

main()
  .catch((error) => {
    console.error("Error al reparar playoffs desde ronda 1:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

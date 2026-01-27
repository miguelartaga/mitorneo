import type { Prisma } from "@prisma/client";
import { buildRoundOneEntries, buildSeedOrder } from "@/lib/playoff-utils";

export const syncRoundOneMatches = async ({
  tx,
  tournamentId,
  categoryId,
  bracketSlots,
}: {
  tx: Prisma.TransactionClient;
  tournamentId: string;
  categoryId: string;
  bracketSlots: (string | null)[];
}) => {
  const roundOneEntries = buildRoundOneEntries(
    bracketSlots.map((entrantId) => (entrantId ? { id: entrantId } : null))
  );
  if (roundOneEntries.length === 0) return 0;

  const matches = await tx.tournamentMatch.findMany({
    where: { tournamentId, categoryId, stage: "PLAYOFF" },
    orderBy: [
      { roundNumber: "asc" },
      { createdAt: "asc" },
    ],
    select: { id: true, roundNumber: true },
  });

  if (matches.length === 0) return 0;

  const roundNumbers = matches.map((match) => match.roundNumber ?? 1);
  const firstRoundNumber = Math.min(...roundNumbers);
  const firstRoundMatches = matches.filter(
    (match) => (match.roundNumber ?? 1) === firstRoundNumber
  );

  const updateCount = Math.min(firstRoundMatches.length, roundOneEntries.length);
  for (let index = 0; index < updateCount; index += 1) {
    const entry = roundOneEntries[index];
    const matchId = firstRoundMatches[index].id;
    await tx.tournamentMatch.update({
      where: { id: matchId },
      data: {
        teamAId: entry.teamAId,
        teamBId: entry.teamBId,
        games: null,
        winnerSide: null,
        outcomeSide: null,
        outcomeType: "PLAYED",
      },
    });
  }

  return updateCount;
};

export const buildSlotPositionMap = ({
  slots,
  matches,
}: {
  slots: { position: number; entrantId: string | null }[];
  matches: {
    id: string;
    roundNumber?: number | null;
    createdAt?: string | null;
    teamAId?: string | null;
    teamBId?: string | null;
  }[];
}) => {
  const map = new Map<string, number>();
  if (slots.length === 0 || matches.length === 0) return map;

  const bracketSize = slots.length;
  const seedOrder = buildSeedOrder(bracketSize);
  const pairCount = Math.floor(bracketSize / 2);
  const positionToEntrant = new Map<number, string | null>();
  slots.forEach((slot) => {
    positionToEntrant.set(slot.position, slot.entrantId ?? null);
  });

  const buildKey = (a?: string | null, b?: string | null) => {
    const left = a ?? "null";
    const right = b ?? "null";
    return [left, right].sort().join("|");
  };

  const expectedPairs: Array<{ posA: number; posB: number; key: string }> = [];
  for (let index = 0; index < pairCount; index += 1) {
    const seedA = seedOrder[index * 2] ?? 0;
    const seedB = seedOrder[index * 2 + 1] ?? 0;
    if (seedA <= 0 || seedB <= 0) continue;
    const entrantA = positionToEntrant.get(seedA) ?? null;
    const entrantB = positionToEntrant.get(seedB) ?? null;
    expectedPairs.push({
      posA: seedA,
      posB: seedB,
      key: buildKey(entrantA, entrantB),
    });
  }

  const expectedByKey = new Map<string, Array<{ posA: number; posB: number }>>();
  expectedPairs.forEach((pair) => {
    const list = expectedByKey.get(pair.key) ?? [];
    list.push({ posA: pair.posA, posB: pair.posB });
    expectedByKey.set(pair.key, list);
  });

  const roundNumbers = matches.map((match) => match.roundNumber ?? 1);
  const firstRoundNumber = Math.min(...roundNumbers);
  const firstRoundMatchesUnsorted = matches.filter(
    (match) => (match.roundNumber ?? 1) === firstRoundNumber
  );

  const firstRoundMatches = [...firstRoundMatchesUnsorted].sort((a, b) => {
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateA - dateB;
  });

  const fallbackPairs = expectedPairs.map((pair) => ({
    posA: pair.posA,
    posB: pair.posB,
  }));
  let fallbackIndex = 0;

  firstRoundMatches.forEach((match) => {
    const key = buildKey(match.teamAId, match.teamBId);
    const list = expectedByKey.get(key);
    const expected =
      list && list.length > 0 ? list.shift() ?? null : null;
    const pair = expected ?? fallbackPairs[fallbackIndex++];
    if (!pair) return;
    map.set(`${match.id}:A`, pair.posA);
    map.set(`${match.id}:B`, pair.posB);
  });

  return map;
};

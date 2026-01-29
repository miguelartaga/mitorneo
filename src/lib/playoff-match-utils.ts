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
      { orderHint: "asc" },
      { createdAt: "asc" },
    ],
    select: {
      id: true,
      roundNumber: true,
      orderHint: true,
      teamAId: true,
      teamBId: true,
      createdAt: true,
    },
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

  const nextRoundNumber = firstRoundNumber + 1;
  const nextRoundMatches = matches
    .filter((match) => (match.roundNumber ?? 1) === nextRoundNumber)
    .sort((a, b) => {
      const orderA = typeof a.orderHint === "number" ? a.orderHint : null;
      const orderB = typeof b.orderHint === "number" ? b.orderHint : null;
      if (orderA !== null || orderB !== null) {
        if (orderA === null) return 1;
        if (orderB === null) return -1;
        if (orderA !== orderB) return orderA - orderB;
      }
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

  const resolveByeWinner = (match: { teamAId?: string | null; teamBId?: string | null } | undefined) => {
    if (!match) return null;
    if (match.teamAId && !match.teamBId) return match.teamAId;
    if (match.teamBId && !match.teamAId) return match.teamBId;
    return null;
  };

  if (nextRoundMatches.length > 0) {
    for (let index = 0; index < nextRoundMatches.length; index += 1) {
      const left = firstRoundMatches[index * 2];
      const right = firstRoundMatches[index * 2 + 1];
      const teamAId = resolveByeWinner(left);
      const teamBId = resolveByeWinner(right);
      await tx.tournamentMatch.update({
        where: { id: nextRoundMatches[index].id },
        data: {
          teamAId,
          teamBId,
          games: null,
          winnerSide: null,
          outcomeSide: null,
          outcomeType: "PLAYED",
        },
      });
    }
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
    orderHint?: number | null;
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
  const entrantToPosition = new Map<string, number>();
  slots.forEach((slot) => {
    positionToEntrant.set(slot.position, slot.entrantId ?? null);
    if (slot.entrantId) {
      entrantToPosition.set(slot.entrantId, slot.position);
    }
  });

  const expectedPairs: Array<{ posA: number; posB: number; key: string }> = [];
  const pairByPosition = new Map<number, { posA: number; posB: number }>();
  for (let index = 0; index < pairCount; index += 1) {
    const seedA = seedOrder[index * 2] ?? 0;
    const seedB = seedOrder[index * 2 + 1] ?? 0;
    if (seedA <= 0 || seedB <= 0) continue;
    const entrantA = positionToEntrant.get(seedA) ?? null;
    const entrantB = positionToEntrant.get(seedB) ?? null;
    expectedPairs.push({
      posA: seedA,
      posB: seedB,
      key: `${entrantA ?? "null"}|${entrantB ?? "null"}`,
    });
    pairByPosition.set(seedA, { posA: seedA, posB: seedB });
    pairByPosition.set(seedB, { posA: seedA, posB: seedB });
  }

  const roundNumbers = matches.map((match) => match.roundNumber ?? 1);
  const firstRoundNumber = Math.min(...roundNumbers);
  const firstRoundMatchesUnsorted = matches.filter(
    (match) => (match.roundNumber ?? 1) === firstRoundNumber
  );

  const firstRoundMatches = [...firstRoundMatchesUnsorted].sort((a, b) => {
    const orderA = typeof a.orderHint === "number" ? a.orderHint : null;
    const orderB = typeof b.orderHint === "number" ? b.orderHint : null;
    if (orderA !== null || orderB !== null) {
      if (orderA === null) return 1;
      if (orderB === null) return -1;
      if (orderA !== orderB) return orderA - orderB;
    }
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateA - dateB;
  });

  firstRoundMatches.forEach((match) => {
    const posA = match.teamAId ? entrantToPosition.get(match.teamAId) : undefined;
    const posB = match.teamBId ? entrantToPosition.get(match.teamBId) : undefined;
    let resolvedA = posA ?? null;
    let resolvedB = posB ?? null;
    const refPos = resolvedA ?? resolvedB ?? null;
    if (refPos !== null && (resolvedA === null || resolvedB === null)) {
      const pair = pairByPosition.get(refPos);
      if (pair) {
        resolvedA = pair.posA;
        resolvedB = pair.posB;
      }
    }
    if (resolvedA !== null) {
      map.set(`${match.id}:A`, resolvedA);
    }
    if (resolvedB !== null) {
      map.set(`${match.id}:B`, resolvedB);
    }
  });

  return map;
};

export const computePlayoffMatchOrder = ({
  match,
  slots,
}: {
  match: { teamAId?: string | null; teamBId?: string | null; roundNumber?: number | null };
  slots: { position: number; entrantId: string | null }[];
}) => {
  if (!slots.length) return null;
  const bracketSize = slots.length;
  if (bracketSize < 2) return null;
  const seedOrder = buildSeedOrder(bracketSize);
  const pairIndexBySeed = new Map<number, number>();
  for (let i = 0; i < seedOrder.length; i += 1) {
    const seed = seedOrder[i];
    if (!seed) continue;
    pairIndexBySeed.set(seed, Math.floor(i / 2));
  }
  const entrantPosition = new Map<string, number>();
  slots.forEach((slot) => {
    if (slot.entrantId) {
      entrantPosition.set(slot.entrantId, slot.position);
    }
  });
  const roundNumber = Math.max(1, match.roundNumber ?? 1);
  const divisor = Math.pow(2, roundNumber - 1);
  const getOrderFromEntrant = (entrantId?: string | null) => {
    if (!entrantId) return null;
    const pos = entrantPosition.get(entrantId);
    if (typeof pos !== "number") return null;
    const pairIndex = pairIndexBySeed.get(pos);
    if (typeof pairIndex !== "number") return null;
    return Math.floor(pairIndex / divisor);
  };
  const orderA = getOrderFromEntrant(match.teamAId ?? null);
  const orderB = getOrderFromEntrant(match.teamBId ?? null);
  if (typeof orderA === "number" && typeof orderB === "number") {
    return Math.min(orderA, orderB);
  }
  if (typeof orderA === "number") return orderA;
  if (typeof orderB === "number") return orderB;
  return null;
};

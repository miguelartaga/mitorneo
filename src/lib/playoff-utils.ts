export const DEFAULT_TIEBREAKERS = [
  "SETS_DIFF",
  "MATCHES_WON",
  "POINTS_PER_MATCH",
  "POINTS_DIFF",
] as const;

export type Tiebreaker = (typeof DEFAULT_TIEBREAKERS)[number];

export const normalizeGroupName = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "_UNGROUPED";
};

export const normalizeTiebreakerOrder = (value: unknown) => {
  if (!Array.isArray(value)) return [...DEFAULT_TIEBREAKERS];
  const list = value.filter(
    (item): item is Tiebreaker =>
      typeof item === "string" && DEFAULT_TIEBREAKERS.includes(item as Tiebreaker)
  );
  const unique = Array.from(new Set(list));
  const hasAll = DEFAULT_TIEBREAKERS.every((item) => unique.includes(item));
  if (!hasAll || unique.length !== DEFAULT_TIEBREAKERS.length) {
    return [...DEFAULT_TIEBREAKERS];
  }
  return unique;
};

export const nextPowerOfTwo = (value: number) => {
  if (value <= 1) return 1;
  let size = 1;
  while (size < value) size *= 2;
  return size;
};

export const orderRegistrations = (
  items: Array<{
    id: string;
    seed: number | null;
    rankingNumber: number | null;
    createdAt: Date;
  }>
) => {
  return [...items].sort((a, b) => {
    const seedA = a.seed ?? a.rankingNumber ?? Number.MAX_SAFE_INTEGER;
    const seedB = b.seed ?? b.rankingNumber ?? Number.MAX_SAFE_INTEGER;
    if (seedA !== seedB) return seedA - seedB;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
};

type StandingEntry = {
  id: string;
  groupName: string;
  points: number;
  matchesWon: number;
  matchesLost: number;
  setsWon: number;
  setsLost: number;
  pointsWon: number;
  pointsLost: number;
  seed: number | null;
  rankingNumber: number | null;
  createdAt: Date;
};

type GroupMatch = {
  groupName: string | null;
  teamAId: string | null;
  teamBId: string | null;
  games: unknown;
  winnerSide: "A" | "B" | null;
  outcomeType: "PLAYED" | "WALKOVER" | "INJURY";
  outcomeSide: "A" | "B" | null;
};

export type GroupPointsConfig = {
  winPoints: number;
  winWithoutGameLossPoints: number;
  lossPoints: number;
  lossWithGameWinPoints: number;
  tiebreakerOrder: Tiebreaker[];
};

const parseGames = (value: unknown) => {
  if (!Array.isArray(value)) return [] as { a: number; b: number }[];
  const games: { a: number; b: number }[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const a = (entry as { a?: unknown }).a;
    const b = (entry as { b?: unknown }).b;
    if (typeof a !== "number" || typeof b !== "number") continue;
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    games.push({ a, b });
  }
  return games;
};

const computeMatchResult = (games: { a: number; b: number }[]) => {
  if (games.length === 0) return null;
  let setsA = 0;
  let setsB = 0;
  let pointsA = 0;
  let pointsB = 0;
  for (const game of games) {
    pointsA += game.a;
    pointsB += game.b;
    if (game.a > game.b) {
      setsA += 1;
    } else if (game.b > game.a) {
      setsB += 1;
    }
  }
  if (setsA === 0 && setsB === 0) return null;
  if (setsA === setsB) return null;
  return {
    setsA,
    setsB,
    pointsA,
    pointsB,
    winner: setsA > setsB ? "A" : "B",
  } as const;
};

const compareStandings = (a: StandingEntry, b: StandingEntry, order: Tiebreaker[]) => {
  const metrics: Record<Tiebreaker, (item: StandingEntry) => number> = {
    SETS_DIFF: (item) => item.setsWon - item.setsLost,
    MATCHES_WON: (item) => item.matchesWon,
    POINTS_PER_MATCH: (item) => item.points,
    POINTS_DIFF: (item) => item.pointsWon - item.pointsLost,
  };
  for (const rule of order) {
    const diff = metrics[rule](b) - metrics[rule](a);
    if (diff !== 0) return diff;
  }
  const seedA = a.seed ?? a.rankingNumber ?? Number.MAX_SAFE_INTEGER;
  const seedB = b.seed ?? b.rankingNumber ?? Number.MAX_SAFE_INTEGER;
  if (seedA !== seedB) return seedA - seedB;
  return a.createdAt.getTime() - b.createdAt.getTime();
};

export const buildGroupStandings = (
  registrations: Array<{
    id: string;
    groupName: string | null;
    seed: number | null;
    rankingNumber: number | null;
    createdAt: Date;
  }>,
  matches: GroupMatch[],
  groupPoints: GroupPointsConfig
) => {
  const standings = new Map<string, StandingEntry>();
  registrations.forEach((registration) => {
    standings.set(registration.id, {
      id: registration.id,
      groupName: normalizeGroupName(registration.groupName),
      points: 0,
      matchesWon: 0,
      matchesLost: 0,
      setsWon: 0,
      setsLost: 0,
      pointsWon: 0,
      pointsLost: 0,
      seed: registration.seed ?? null,
      rankingNumber: registration.rankingNumber ?? null,
      createdAt: registration.createdAt,
    });
  });

  matches.forEach((match) => {
    const teamAId = match.teamAId;
    const teamBId = match.teamBId;
    if (!teamAId || !teamBId) return;
    const teamA = standings.get(teamAId);
    const teamB = standings.get(teamBId);
    if (!teamA || !teamB) return;

    if (match.outcomeType !== "PLAYED") {
      const winnerSide =
        match.outcomeSide === "A"
          ? "B"
          : match.outcomeSide === "B"
            ? "A"
            : match.winnerSide;
      if (!winnerSide) return;
      if (winnerSide === "A") {
        teamA.matchesWon += 1;
        teamB.matchesLost += 1;
        teamA.points += groupPoints.winWithoutGameLossPoints;
        teamB.points += groupPoints.lossPoints;
      } else {
        teamB.matchesWon += 1;
        teamA.matchesLost += 1;
        teamB.points += groupPoints.winWithoutGameLossPoints;
        teamA.points += groupPoints.lossPoints;
      }
      return;
    }

    const result = computeMatchResult(parseGames(match.games));
    if (result) {
      teamA.setsWon += result.setsA;
      teamA.setsLost += result.setsB;
      teamA.pointsWon += result.pointsA;
      teamA.pointsLost += result.pointsB;
      teamB.setsWon += result.setsB;
      teamB.setsLost += result.setsA;
      teamB.pointsWon += result.pointsB;
      teamB.pointsLost += result.pointsA;

      if (result.winner === "A") {
        teamA.matchesWon += 1;
        teamB.matchesLost += 1;
        teamA.points +=
          result.setsB === 0
            ? groupPoints.winWithoutGameLossPoints
            : groupPoints.winPoints;
        teamB.points +=
          result.setsB > 0
            ? groupPoints.lossWithGameWinPoints
            : groupPoints.lossPoints;
      } else {
        teamB.matchesWon += 1;
        teamA.matchesLost += 1;
        teamB.points +=
          result.setsA === 0
            ? groupPoints.winWithoutGameLossPoints
            : groupPoints.winPoints;
        teamA.points +=
          result.setsA > 0
            ? groupPoints.lossWithGameWinPoints
            : groupPoints.lossPoints;
      }
      return;
    }

    if (match.winnerSide) {
      if (match.winnerSide === "A") {
        teamA.matchesWon += 1;
        teamB.matchesLost += 1;
        teamA.points += groupPoints.winPoints;
        teamB.points += groupPoints.lossPoints;
      } else {
        teamB.matchesWon += 1;
        teamA.matchesLost += 1;
        teamB.points += groupPoints.winPoints;
        teamA.points += groupPoints.lossPoints;
      }
    }
  });

  const groups = new Map<string, StandingEntry[]>();
  standings.forEach((entry) => {
    if (!groups.has(entry.groupName)) {
      groups.set(entry.groupName, []);
    }
    groups.get(entry.groupName)?.push(entry);
  });

  groups.forEach((entries, groupName) => {
    groups.set(
      groupName,
      [...entries].sort((a, b) =>
        compareStandings(a, b, groupPoints.tiebreakerOrder)
      )
    );
  });

  return groups;
};

export const collectOrderedGroupQualifiers = (
  groups: Map<string, StandingEntry[]>,
  qualifiersByGroup: Map<string, number> | undefined,
  defaultQualifiers: number,
  groupPoints: GroupPointsConfig
) => {
  const groupNames = Array.from(groups.keys()).sort((a, b) =>
    a.localeCompare(b)
  );
  const qualifiers: {
    entry: StandingEntry;
    position: number;
  }[] = [];

  groupNames.forEach((groupName) => {
    const rawValue = qualifiersByGroup?.get(groupName);
    const groupValue =
      typeof rawValue === "number" && rawValue > 0
        ? rawValue
        : defaultQualifiers;
    const qualifierCount = Math.max(1, Math.floor(groupValue));
    const entries = groups.get(groupName) ?? [];
    for (let index = 0; index < qualifierCount; index += 1) {
      const entry = entries[index];
      if (!entry) break;
      qualifiers.push({
        entry,
        position: index + 1,
      });
    }
  });

  const groupOrder = new Map<string, number>();
  groupNames.forEach((groupName, index) => {
    groupOrder.set(groupName, index);
  });
  qualifiers.sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    const orderA = groupOrder.get(a.entry.groupName) ?? Number.MAX_SAFE_INTEGER;
    const orderB = groupOrder.get(b.entry.groupName) ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return a.entry.groupName.localeCompare(b.entry.groupName);
  });

  return qualifiers.map((item) => item.entry);
};

export type PlayoffSlotEntrant = {
  id: string;
  groupName: string;
};

export const normalizeByesToEnd = <T extends { id: string }>(
  slots: (T | null)[]
) => {
  if (slots.length === 0) return [] as (T | null)[];
  const withoutByes: T[] = [];
  let byeCount = 0;
  slots.forEach((slot) => {
    if (slot) {
      withoutByes.push(slot);
    } else {
      byeCount += 1;
    }
  });
  const byes = Array.from({ length: byeCount }, () => null as T | null);
  return [...withoutByes, ...byes];
};

export const assertNoDuplicateEntrants = <T extends { id: string }>(
  slots: (T | null)[]
) => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  slots.forEach((slot) => {
    if (!slot) return;
    if (seen.has(slot.id)) {
      duplicates.add(slot.id);
      return;
    }
    seen.add(slot.id);
  });
  if (duplicates.size > 0) {
    throw new Error(
      `DUPLICADOS ${Array.from(duplicates.values()).join(", ")}`
    );
  }
};

export const buildGroupPlayoffSlotEntrants = ({
  groups,
  qualifiersByGroup,
  defaultQualifiers,
  bracketSize,
}: {
  groups: Map<string, StandingEntry[]>;
  qualifiersByGroup: Map<string, number> | undefined;
  defaultQualifiers: number;
  bracketSize: number;
}) => {
  if (bracketSize <= 0) {
    return { slotEntrants: [] as (PlayoffSlotEntrant | null)[], qualifiers: [] as PlayoffSlotEntrant[] };
  }
  const groupNames = Array.from(groups.keys()).sort((a, b) =>
    a.localeCompare(b)
  );
  if (groupNames.length === 0) {
    return {
      slotEntrants: Array.from({ length: bracketSize }, () => null as PlayoffSlotEntrant | null),
      qualifiers: [] as PlayoffSlotEntrant[],
    };
  }

  const groupQualifiers: PlayoffSlotEntrant[][] = [];
  let maxQualifiers = 0;
  groupNames.forEach((groupName) => {
    const rawValue = qualifiersByGroup?.get(groupName);
    const groupValue =
      typeof rawValue === "number" && rawValue > 0
        ? rawValue
        : defaultQualifiers;
    const qualifierCount = Math.max(1, Math.floor(groupValue));
    const entries = groups.get(groupName) ?? [];
    const limited = entries.slice(0, qualifierCount).map((entry) => ({
      id: entry.id,
      groupName,
    }));
    maxQualifiers = Math.max(maxQualifiers, limited.length);
    groupQualifiers.push(limited);
  });

  const slotEntrants: (PlayoffSlotEntrant | null)[] = Array.from({ length: bracketSize }, () => null);
  for (let seedIndex = 0; seedIndex < maxQualifiers; seedIndex += 1) {
    for (let groupIndex = 0; groupIndex < groupNames.length; groupIndex += 1) {
      const entries = groupQualifiers[groupIndex];
      const entry = entries[seedIndex];
      if (!entry) continue;
      const slotIndex = seedIndex * groupNames.length + groupIndex;
      if (slotIndex >= bracketSize) continue;
      slotEntrants[slotIndex] = entry;
    }
  }

  const qualifiers = slotEntrants.filter(
    (entry): entry is PlayoffSlotEntrant => Boolean(entry)
  );
  return { slotEntrants, qualifiers };
};

type BracketSlot = { id: string } | null;

export const buildSeedOrder = (bracketSize: number) => {
  if (bracketSize <= 1) return [1];
  if (bracketSize === 2) return [1, 2];
  const half = Math.floor(bracketSize / 2);
  const previous = buildSeedOrder(half);
  const order: number[] = [];
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

export const buildRoundOneEntries = (slots: BracketSlot[]) => {
  const bracketSize = slots.length;
  if (bracketSize === 0) {
    return [] as {
      roundNumber: number;
      orderHint?: number;
      teamAId: string | null;
      teamBId: string | null;
    }[];
  }
  const seedOrder = buildSeedOrder(bracketSize);
  const matchesCount = Math.max(1, bracketSize / 2);
  const entries = [] as {
    roundNumber: number;
    orderHint?: number;
    teamAId: string | null;
    teamBId: string | null;
  }[];
  for (let index = 0; index < matchesCount; index += 1) {
    const seedA = seedOrder[index * 2] ?? 0;
    const seedB = seedOrder[index * 2 + 1] ?? 0;
    const slotA = seedA > 0 ? slots[seedA - 1] : null;
    const slotB = seedB > 0 ? slots[seedB - 1] : null;
    entries.push({
      roundNumber: 1,
      orderHint: index,
      teamAId: slotA?.id ?? null,
      teamBId: slotB?.id ?? null,
    });
  }
  return entries;
};

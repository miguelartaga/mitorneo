export type DrawType = "ROUND_ROBIN" | "GROUPS_PLAYOFF" | "PLAYOFF";
export type MatchStage = "GROUP" | "PLAYOFF";
export type OutcomeType = "PLAYED" | "WALKOVER" | "INJURY";
export type WinnerSide = "A" | "B";

export type RankingPoint = {
  placeFrom: number;
  placeTo: number | null;
  points: number;
};

export type GroupPoints = {
  winPoints: number;
  winWithoutGameLossPoints: number;
  lossPoints: number;
  lossWithGameWinPoints: number;
  tiebreakerOrder?: unknown;
};

export type RegistrationEntry = {
  id: string;
  categoryId: string;
  groupName?: string | null;
  seed?: number | null;
  rankingNumber?: number | null;
  createdAt?: Date | string | null;
  playerId: string;
  partnerId?: string | null;
  partnerTwoId?: string | null;
};

export type TournamentMatchEntry = {
  categoryId: string;
  groupName?: string | null;
  stage?: MatchStage | null;
  roundNumber?: number | null;
  games?: unknown;
  teamAId?: string | null;
  teamBId?: string | null;
  winnerSide?: WinnerSide | null;
  outcomeType?: OutcomeType | null;
  outcomeSide?: WinnerSide | null;
  isBronzeMatch?: boolean | null;
};

export type TournamentRankingData = {
  categories: { categoryId: string; drawType?: DrawType | null }[];
  registrations: RegistrationEntry[];
  matches: TournamentMatchEntry[];
  groupPoints?: GroupPoints | null;
  rankingPoints?: RankingPoint[];
};

type Tiebreaker =
  | "SETS_DIFF"
  | "MATCHES_WON"
  | "POINTS_PER_MATCH"
  | "POINTS_DIFF";

export type StandingEntry = {
  id: string;
  categoryId: string;
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

const DEFAULT_TIEBREAKERS: Tiebreaker[] = [
  "SETS_DIFF",
  "MATCHES_WON",
  "POINTS_PER_MATCH",
  "POINTS_DIFF",
];

const groupDrawTypes = new Set<DrawType>(["ROUND_ROBIN", "GROUPS_PLAYOFF"]);
const playoffDrawTypes = new Set<DrawType>(["PLAYOFF", "GROUPS_PLAYOFF"]);

const normalizeTiebreakerOrder = (value: unknown) => {
  const filtered = Array.isArray(value)
    ? value.filter((item): item is Tiebreaker =>
      DEFAULT_TIEBREAKERS.includes(item as Tiebreaker)
    )
    : [];
  const unique = Array.from(new Set(filtered));
  const hasAll = DEFAULT_TIEBREAKERS.every((item) => unique.includes(item));
  if (!hasAll || unique.length !== DEFAULT_TIEBREAKERS.length) {
    return [...DEFAULT_TIEBREAKERS];
  }
  return unique;
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

const resolveWinnerSide = (match: TournamentMatchEntry) => {
  if (match.winnerSide) return match.winnerSide;
  if (match.outcomeType && match.outcomeType !== "PLAYED" && match.outcomeSide) {
    return match.outcomeSide === "A" ? "B" : "A";
  }
  const result = computeMatchResult(parseGames(match.games));
  return result?.winner ?? null;
};

const compareStandings = (
  a: StandingEntry,
  b: StandingEntry,
  order: Tiebreaker[]
) => {
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

const getPointsForPlace = (entries: RankingPoint[], place: number) => {
  for (const entry of entries) {
    const to = entry.placeTo ?? Number.POSITIVE_INFINITY;
    if (place >= entry.placeFrom && place <= to) return entry.points;
  }
  return 0;
};

const toDate = (value?: Date | string | null) => {
  if (!value) return new Date(0);
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date(0);
  return parsed;
};

export const computeTournamentStandingsByCategory = (data: TournamentRankingData) => {
  const standingsMap = new Map<string, StandingEntry[]>();
  const standingsById = new Map<string, StandingEntry>();
  const order = normalizeTiebreakerOrder(data.groupPoints?.tiebreakerOrder);
  const groupPoints = {
    winPoints: data.groupPoints?.winPoints ?? 0,
    winWithoutGameLossPoints: data.groupPoints?.winWithoutGameLossPoints ?? 0,
    lossPoints: data.groupPoints?.lossPoints ?? 0,
    lossWithGameWinPoints: data.groupPoints?.lossWithGameWinPoints ?? 0,
  };

  data.registrations.forEach((registration) => {
    const entry: StandingEntry = {
      id: registration.id,
      categoryId: registration.categoryId,
      groupName: (registration.groupName || "A").trim() || "A",
      points: 0,
      matchesWon: 0,
      matchesLost: 0,
      setsWon: 0,
      setsLost: 0,
      pointsWon: 0,
      pointsLost: 0,
      seed: registration.seed ?? null,
      rankingNumber: registration.rankingNumber ?? null,
      createdAt: toDate(registration.createdAt ?? null),
    };
    standingsById.set(entry.id, entry);
    if (!standingsMap.has(entry.categoryId)) {
      standingsMap.set(entry.categoryId, []);
    }
    standingsMap.get(entry.categoryId)?.push(entry);
  });

  data.matches
    .filter((match) => match.stage === "GROUP")
    .forEach((match) => {
      const teamA = match.teamAId ? standingsById.get(match.teamAId) : undefined;
      const teamB = match.teamBId ? standingsById.get(match.teamBId) : undefined;
      if (!teamA || !teamB) return;

      const outcomeType = match.outcomeType ?? "PLAYED";
      const outcomeSide = match.outcomeSide ?? null;

      if (outcomeType !== "PLAYED") {
        const winnerSide =
          outcomeSide === "A"
            ? "B"
            : outcomeSide === "B"
              ? "A"
              : match.winnerSide ?? null;
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
      if (!result) return;

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
    });

  standingsMap.forEach((entries, categoryId) => {
    entries.sort((a, b) => compareStandings(a, b, order));
    standingsMap.set(categoryId, entries);
  });

  return standingsMap;
};

export const computeTournamentPlacements = (data: TournamentRankingData) => {
  const placementsByCategory = new Map<string, string[]>();
  const standingsByCategory = computeTournamentStandingsByCategory(data);
  const registrationMap = new Map(
    data.registrations.map((registration) => [registration.id, registration])
  );

  data.categories.forEach((category) => {
    const categoryRegs = data.registrations.filter(
      (registration) => registration.categoryId === category.categoryId
    );
    if (categoryRegs.length === 0) return;

    const playoffMatches = data.matches.filter(
      (match) => match.categoryId === category.categoryId && match.stage === "PLAYOFF"
    );
    const mainPlayoffMatches = playoffMatches.filter(
      (match) => !match.isBronzeMatch
    );
    const bronzeMatches = playoffMatches.filter((match) => match.isBronzeMatch);

    const placements: string[] = [];
    const placementSet = new Set<string>();
    const hasPlayoff = playoffDrawTypes.has(category.drawType ?? "ROUND_ROBIN");

    if (hasPlayoff && mainPlayoffMatches.length > 0) {
      const rounds = Array.from(
        new Set(mainPlayoffMatches.map((match) => match.roundNumber ?? 1))
      ).sort((a, b) => a - b);
      const finalRound = rounds[rounds.length - 1] ?? 1;
      const finalMatch = mainPlayoffMatches.find(
        (match) => (match.roundNumber ?? 1) === finalRound
      );
      const finalWinner = finalMatch ? resolveWinnerSide(finalMatch) : null;
      if (finalMatch && finalWinner) {
        const winnerId =
          finalWinner === "A" ? finalMatch.teamAId : finalMatch.teamBId;
        const loserId =
          finalWinner === "A" ? finalMatch.teamBId : finalMatch.teamAId;
        if (winnerId) {
          placements.push(winnerId);
          placementSet.add(winnerId);
        }
        if (loserId) {
          placements.push(loserId);
          placementSet.add(loserId);
        }
      }

      const bronzeMatch = bronzeMatches.find((match) => resolveWinnerSide(match));
      const bronzeWinner = bronzeMatch ? resolveWinnerSide(bronzeMatch) : null;
      if (bronzeMatch && bronzeWinner) {
        const thirdId =
          bronzeWinner === "A" ? bronzeMatch.teamAId : bronzeMatch.teamBId;
        const fourthId =
          bronzeWinner === "A" ? bronzeMatch.teamBId : bronzeMatch.teamAId;
        if (thirdId) {
          placements.push(thirdId);
          placementSet.add(thirdId);
        }
        if (fourthId) {
          placements.push(fourthId);
          placementSet.add(fourthId);
        }
      }

      const eliminationRound = new Map<string, number>();
      mainPlayoffMatches.forEach((match) => {
        const winner = resolveWinnerSide(match);
        if (!winner) return;
        const round = match.roundNumber ?? 1;
        const loserId = winner === "A" ? match.teamBId : match.teamAId;
        if (loserId) {
          eliminationRound.set(loserId, round);
        }
      });

      const playoffParticipants = new Set<string>();
      mainPlayoffMatches.forEach((match) => {
        if (match.teamAId) playoffParticipants.add(match.teamAId);
        if (match.teamBId) playoffParticipants.add(match.teamBId);
      });

      const remainingPlayoff = Array.from(playoffParticipants).filter(
        (id) => !placementSet.has(id)
      );
      remainingPlayoff.sort((a, b) => {
        const roundA = eliminationRound.get(a) ?? 0;
        const roundB = eliminationRound.get(b) ?? 0;
        if (roundA !== roundB) return roundB - roundA;
        const regA = registrationMap.get(a);
        const regB = registrationMap.get(b);
        const seedA = regA?.seed ?? regA?.rankingNumber ?? Number.MAX_SAFE_INTEGER;
        const seedB = regB?.seed ?? regB?.rankingNumber ?? Number.MAX_SAFE_INTEGER;
        if (seedA !== seedB) return seedA - seedB;
        return toDate(regA?.createdAt ?? null).getTime() -
          toDate(regB?.createdAt ?? null).getTime();
      });
      remainingPlayoff.forEach((id) => {
        placements.push(id);
        placementSet.add(id);
      });

      const nonQualifiers = categoryRegs.filter(
        (registration) => !playoffParticipants.has(registration.id)
      );
      const standings = standingsByCategory.get(category.categoryId) ?? [];
      nonQualifiers.sort((a, b) => {
        const indexA = standings.findIndex((entry) => entry.id === a.id);
        const indexB = standings.findIndex((entry) => entry.id === b.id);
        if (indexA !== indexB) return indexA - indexB;
        return toDate(a.createdAt).getTime() - toDate(b.createdAt).getTime();
      });
      nonQualifiers.forEach((registration) => {
        placements.push(registration.id);
      });
    } else {
      const standings = standingsByCategory.get(category.categoryId) ?? [];
      standings.forEach((entry) => {
        placements.push(entry.id);
      });
    }

    placementsByCategory.set(category.categoryId, placements);
  });

  return placementsByCategory;
};

export const computeRegistrationPoints = (data: TournamentRankingData) => {
  const placementsByCategory = computeTournamentPlacements(data);
  const rankingPoints = data.rankingPoints ?? [];
  const pointsByRegistration = new Map<string, number>();

  placementsByCategory.forEach((placements) => {
    placements.forEach((registrationId, index) => {
      const place = index + 1;
      const points = getPointsForPlace(rankingPoints, place);
      pointsByRegistration.set(registrationId, points);
    });
  });

  return pointsByRegistration;
};

export const computePlayerPointsFromTournament = (
  data: TournamentRankingData
) => {
  const pointsByRegistration = computeRegistrationPoints(data);
  const pointsByPlayer = new Map<string, number>();
  const participants = new Set<string>();

  data.registrations.forEach((registration) => {
    const members = [
      registration.playerId,
      registration.partnerId,
      registration.partnerTwoId,
    ].filter(Boolean) as string[];
    members.forEach((playerId) => {
      participants.add(playerId);
      const current = pointsByPlayer.get(playerId) ?? 0;
      pointsByPlayer.set(
        playerId,
        current + (pointsByRegistration.get(registration.id) ?? 0)
      );
    });
  });

  return { pointsByPlayer, participants };
};

export const computePlayerPointsByCategory = (data: TournamentRankingData) => {
  const pointsByRegistration = computeRegistrationPoints(data);
  const pointsByPlayerCategory = new Map<string, Map<string, number>>();
  const participants = new Set<string>();

  data.registrations.forEach((registration) => {
    const points = pointsByRegistration.get(registration.id) ?? 0;
    const members = [
      registration.playerId,
      registration.partnerId,
      registration.partnerTwoId,
    ].filter(Boolean) as string[];

    members.forEach((playerId) => {
      participants.add(playerId);
      const categoryMap =
        pointsByPlayerCategory.get(playerId) ?? new Map<string, number>();
      categoryMap.set(
        registration.categoryId,
        (categoryMap.get(registration.categoryId) ?? 0) + points
      );
      pointsByPlayerCategory.set(playerId, categoryMap);
    });
  });

  return { pointsByPlayerCategory, participants };
};

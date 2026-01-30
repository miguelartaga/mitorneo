import { prisma } from "@/lib/prisma";
import { getServerSession } from "@/lib/auth";
import { canManageTournament } from "@/lib/permissions";
import { NextResponse } from "next/server";

type ScheduleEntry = {
  date: string;
  startTime: string;
  endTime: string;
  matchDurationMinutes: number;
  breakMinutes: number;
};

type RegistrationSeed = {
  id: string;
  seed: number | null;
  rankingNumber: number | null;
  createdAt: Date;
};

type ClubCourt = {
  clubId: string;
  courtNumber: number;
};

type MatchSlot = {
  id: string;
  categoryId: string;
  groupName: string | null;
  stage: "GROUP" | "PLAYOFF" | null;
  roundNumber: number | null;
};

const DEFAULT_TIEBREAKERS = [
  "SETS_DIFF",
  "MATCHES_WON",
  "POINTS_PER_MATCH",
  "POINTS_DIFF",
] as const;

type Tiebreaker = (typeof DEFAULT_TIEBREAKERS)[number];

type GroupPointsConfig = {
  winPoints: number;
  winWithoutGameLossPoints: number;
  lossPoints: number;
  lossWithGameWinPoints: number;
  tiebreakerOrder: Tiebreaker[];
};

type GroupStanding = {
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
  categoryId: string;
  groupName: string | null;
  teamAId: string;
  teamBId: string;
  games: unknown;
};

const resolveId = (request: Request, resolvedParams?: { id?: string }) => {
  if (resolvedParams?.id) return resolvedParams.id;
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 3] : undefined;
};

const parseRoundsPerDay = (value: unknown) => {
  if (value === 2 || value === "2") return 2;
  return 1;
};

const isValidTime = (value: string) =>
  /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

const timeToMinutes = (value: string) => {
  const [hours, minutes] = value.split(":").map((part) => Number(part));
  return hours * 60 + minutes;
};

const minutesToTime = (value: number) => {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  const paddedHours = String(hours).padStart(2, "0");
  const paddedMinutes = String(minutes).padStart(2, "0");
  return `${paddedHours}:${paddedMinutes}`;
};

const buildSlots = (entry?: ScheduleEntry) => {
  if (!entry) return [] as string[];
  if (!isValidTime(entry.startTime) || !isValidTime(entry.endTime)) return [];
  if (entry.matchDurationMinutes <= 0) return [];
  const start = timeToMinutes(entry.startTime);
  const end = timeToMinutes(entry.endTime);
  const slotLength = entry.matchDurationMinutes + entry.breakMinutes;
  if (slotLength <= 0) return [];
  const slots: string[] = [];
  let current = start;
  while (current + entry.matchDurationMinutes <= end) {
    slots.push(minutesToTime(current));
    current += slotLength;
  }
  return slots;
};

const buildCourts = (clubs: { id: string; courtsCount: number }[]) => {
  const courts: ClubCourt[] = [];
  clubs.forEach((club) => {
    const count = Number.isFinite(club.courtsCount) ? club.courtsCount : 0;
    if (count < 1) return;
    for (let index = 1; index <= count; index += 1) {
      courts.push({ clubId: club.id, courtNumber: index });
    }
  });
  return courts;
};

const nextPowerOfTwo = (value: number) => {
  if (value <= 1) return 1;
  let size = 1;
  while (size < value) size *= 2;
  return size;
};

const orderRegistrations = (items: RegistrationSeed[]) => {
  return [...items].sort((a, b) => {
    const seedA =
      a.seed ?? a.rankingNumber ?? Number.MAX_SAFE_INTEGER;
    const seedB =
      b.seed ?? b.rankingNumber ?? Number.MAX_SAFE_INTEGER;
    if (seedA !== seedB) return seedA - seedB;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
};

const normalizeGroupName = (value?: string | null) => {
  const trimmed = value?.trim() ?? "";
  return trimmed.length ? trimmed : "A";
};

const normalizeTiebreakerOrder = (value: unknown) => {
  if (!Array.isArray(value)) return [...DEFAULT_TIEBREAKERS];
  const list = value.filter(
    (item): item is Tiebreaker =>
      typeof item === "string" &&
      (DEFAULT_TIEBREAKERS as readonly string[]).includes(item)
  );
  const unique = Array.from(new Set(list));
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

const compareStandings = (
  a: GroupStanding,
  b: GroupStanding,
  order: Tiebreaker[]
) => {
  const metrics: Record<Tiebreaker, (item: GroupStanding) => number> = {
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

const buildGroupStandings = (
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
  const standings = new Map<string, GroupStanding>();
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
    const result = computeMatchResult(parseGames(match.games));
    if (!result) return;
    const teamA = standings.get(match.teamAId);
    const teamB = standings.get(match.teamBId);
    if (!teamA || !teamB) return;

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
      const winPoints =
        result.setsB === 0
          ? groupPoints.winWithoutGameLossPoints
          : groupPoints.winPoints;
      teamA.points += winPoints;
      teamB.points +=
        result.setsB > 0
          ? groupPoints.lossWithGameWinPoints
          : groupPoints.lossPoints;
    } else {
      teamB.matchesWon += 1;
      teamA.matchesLost += 1;
      const winPoints =
        result.setsA === 0
          ? groupPoints.winWithoutGameLossPoints
          : groupPoints.winPoints;
      teamB.points += winPoints;
      teamA.points +=
        result.setsA > 0
          ? groupPoints.lossWithGameWinPoints
          : groupPoints.lossPoints;
    }
  });

  const groups = new Map<string, GroupStanding[]>();
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

type BracketSlot = { id: string } | null;
type RoundEntry = {
  roundNumber: number;
  teamAId: string | null;
  teamBId: string | null;
};

const resolveByeWinner = (entry: RoundEntry | undefined) => {
  if (!entry) return null;
  if (entry.teamAId && !entry.teamBId) return entry.teamAId;
  if (entry.teamBId && !entry.teamAId) return entry.teamBId;
  return null;
};

const buildRoundOneEntries = (slots: BracketSlot[]): RoundEntry[] => {
  const bracketSize = slots.length;
  if (bracketSize === 0) return [];
  const matchesCount = Math.max(1, bracketSize / 2);
  return Array.from({ length: matchesCount }, (_, index) => {
    const opponentIndex = bracketSize - 1 - index;
    return {
      roundNumber: 1,
      teamAId: slots[index]?.id ?? null,
      teamBId: slots[opponentIndex]?.id ?? null,
    };
  });
};

const buildBracketMatchesTemplate = (
  bracketSize: number,
  roundOneEntries: RoundEntry[]
) => {
  if (bracketSize <= 1) return [] as RoundEntry[];
  const totalRounds = Math.max(1, Math.floor(Math.log2(bracketSize)));
  const rounds: RoundEntry[][] = [];
  rounds.push(
    roundOneEntries.map((entry) => ({
      roundNumber: 1,
      teamAId: entry.teamAId,
      teamBId: entry.teamBId,
    }))
  );

  for (let round = 2; round <= totalRounds; round += 1) {
    const prev = rounds[round - 2] ?? [];
    const matchesCount = Math.max(1, bracketSize / 2 ** round);
    const current: RoundEntry[] = [];
    for (let index = 0; index < matchesCount; index += 1) {
      const left = prev[index * 2];
      const right = prev[index * 2 + 1];
      const isImmediateFromRoundOne = round === 2;
      current.push({
        roundNumber: round,
        teamAId: isImmediateFromRoundOne ? resolveByeWinner(left) : null,
        teamBId: isImmediateFromRoundOne ? resolveByeWinner(right) : null,
      });
    }
    rounds.push(current);
  }

  return rounds.flat();
};

const collectOrderedGroupQualifiers = (
  groups: Map<string, GroupStanding[]>,
  qualifiersByGroup: Map<string, number> | undefined,
  defaultQualifiers: number,
  groupPoints: GroupPointsConfig
) => {
  const groupNames = Array.from(groups.keys()).sort((a, b) =>
    a.localeCompare(b)
  );
  const qualifiers: {
    entry: GroupStanding;
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

  qualifiers.sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    const diff = compareStandings(
      a.entry,
      b.entry,
      groupPoints.tiebreakerOrder
    );
    if (diff !== 0) return diff;
    return a.entry.groupName.localeCompare(b.entry.groupName);
  });

  return qualifiers.map((item) => item.entry);
};

const groupDrawTypes = new Set(["ROUND_ROBIN", "GROUPS_PLAYOFF"]);
const playoffDrawTypes = new Set(["PLAYOFF", "GROUPS_PLAYOFF"]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id?: string }> }
) {
  const resolvedParams = await params;
  const session = await getServerSession();
  if (
    !session?.user ||
    (session.user.role !== "ADMIN" && session.user.role !== "TOURNAMENT_ADMIN")
  ) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const tournamentId = resolveId(request, resolvedParams);
  if (!tournamentId) {
    return NextResponse.json({ error: "Torneo no encontrado" }, { status: 404 });
  }

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true, ownerId: true, playDays: true, status: true },
  });

  if (!tournament) {
    return NextResponse.json({ error: "Torneo no encontrado" }, { status: 404 });
  }

  const canManage = await canManageTournament(
    session.user,
    tournamentId,
    tournament.ownerId
  );
  if (!canManage) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  if (tournament.status === "FINISHED") {
    return NextResponse.json(
      { error: "El torneo ya esta finalizado" },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const roundsPerDay = parseRoundsPerDay(body.roundsPerDay);

  const playDays = Array.isArray(tournament.playDays)
    ? (tournament.playDays as string[]).filter(
        (day) => typeof day === "string" && day.trim().length > 0
      )
    : [];

  if (playDays.length === 0) {
    return NextResponse.json(
      { error: "No hay dias de juego configurados" },
      { status: 400 }
    );
  }

  const scheduleEntries = await prisma.tournamentScheduleDay.findMany({
    where: { tournamentId },
    select: {
      date: true,
      startTime: true,
      endTime: true,
      matchDurationMinutes: true,
      breakMinutes: true,
    },
  });

  const scheduleMap = new Map<string, ScheduleEntry>(
    scheduleEntries.map((entry) => [
      entry.date.toISOString().split("T")[0],
      {
        date: entry.date.toISOString().split("T")[0],
        startTime: entry.startTime,
        endTime: entry.endTime,
        matchDurationMinutes: entry.matchDurationMinutes,
        breakMinutes: entry.breakMinutes,
      },
    ])
  );
  const availablePlayDays = playDays.filter((day) => scheduleMap.has(day));
  if (availablePlayDays.length === 0) {
    return NextResponse.json(
      { error: "No hay horarios configurados para los dias de juego" },
      { status: 400 }
    );
  }

  const clubs = await prisma.tournamentClub.findMany({
    where: { tournamentId },
    select: { id: true, courtsCount: true },
    orderBy: { name: "asc" },
  });

  const courts = buildCourts(clubs);
  if (courts.length === 0) {
    return NextResponse.json(
      { error: "Debes configurar canchas en los clubes" },
      { status: 400 }
    );
  }

  const tournamentCategories = await prisma.tournamentCategory.findMany({
    where: { tournamentId },
    include: { category: { select: { id: true, name: true } } },
  });

  const categoryOrder = [...tournamentCategories].sort((a, b) =>
    a.category.name.localeCompare(b.category.name)
  );

  const groupQualifiers = await prisma.tournamentGroupQualifier.findMany({
    where: { tournamentId },
    select: { categoryId: true, groupName: true, qualifiers: true },
  });

  const qualifiersByCategory = new Map<string, Map<string, number>>();
  groupQualifiers.forEach((entry) => {
    const groupName = normalizeGroupName(entry.groupName);
    if (!qualifiersByCategory.has(entry.categoryId)) {
      qualifiersByCategory.set(entry.categoryId, new Map());
    }
    qualifiersByCategory.get(entry.categoryId)?.set(groupName, entry.qualifiers);
  });

  const existingMatches = await prisma.tournamentMatch.findMany({
    where: { tournamentId },
    select: {
      id: true,
      categoryId: true,
      groupName: true,
      stage: true,
      roundNumber: true,
      teamAId: true,
      teamBId: true,
      games: true,
    },
  });

  const groupMatches = existingMatches.filter(
    (match) => match.stage === "GROUP"
  );

  if (
    groupMatches.length === 0 &&
    categoryOrder.some((item) => groupDrawTypes.has(item.drawType ?? ""))
  ) {
    return NextResponse.json(
      { error: "Primero genera el fixture de grupos" },
      { status: 400 }
    );
  }

  const registrations = await prisma.tournamentRegistration.findMany({
    where: { tournamentId },
    select: {
      id: true,
      categoryId: true,
      groupName: true,
      seed: true,
      rankingNumber: true,
      createdAt: true,
    },
  });

  const groupPoints = await prisma.tournamentGroupPoints.findUnique({
    where: { tournamentId },
    select: {
      winPoints: true,
      winWithoutGameLossPoints: true,
      lossPoints: true,
      lossWithGameWinPoints: true,
      tiebreakerOrder: true,
    },
  });

  const groupPointsConfig: GroupPointsConfig = {
    winPoints: groupPoints?.winPoints ?? 0,
    winWithoutGameLossPoints: groupPoints?.winWithoutGameLossPoints ?? 0,
    lossPoints: groupPoints?.lossPoints ?? 0,
    lossWithGameWinPoints: groupPoints?.lossWithGameWinPoints ?? 0,
    tiebreakerOrder: normalizeTiebreakerOrder(groupPoints?.tiebreakerOrder),
  };

  const playoffMatches = await prisma.tournamentMatch.findMany({
    where: { tournamentId, stage: "PLAYOFF" },
    select: { id: true, categoryId: true },
  });

  const existingPlayoffByCategory = new Map<string, number>();
  playoffMatches.forEach((match) => {
    existingPlayoffByCategory.set(
      match.categoryId,
      (existingPlayoffByCategory.get(match.categoryId) ?? 0) + 1
    );
  });

  const playoffCreates: {
    tournamentId: string;
    categoryId: string;
    groupName: string | null;
    stage: "PLAYOFF";
    roundNumber: number;
    teamAId: string | null;
    teamBId: string | null;
  }[] = [];

  categoryOrder.forEach((item) => {
    if (!playoffDrawTypes.has(item.drawType ?? "")) return;
    if (existingPlayoffByCategory.get(item.categoryId)) return;
    if (item.drawType === "GROUPS_PLAYOFF") {
      const categoryRegistrations = registrations.filter(
        (registration) => registration.categoryId === item.categoryId
      );
      const categoryMatches = groupMatches.filter(
        (match) => match.categoryId === item.categoryId
      ) as GroupMatch[];
      const standingsByGroup = buildGroupStandings(
        categoryRegistrations,
        categoryMatches,
        groupPointsConfig
      );
      const defaultQualifiers =
        typeof item.groupQualifiers === "number" && item.groupQualifiers > 0
          ? item.groupQualifiers
          : 2;
      const qualifiersByGroup = qualifiersByCategory.get(item.categoryId);
      const qualifiers = collectOrderedGroupQualifiers(
        standingsByGroup,
        qualifiersByGroup,
        defaultQualifiers,
        groupPointsConfig
      );
      if (qualifiers.length < 2) return;
      const bracketSize = nextPowerOfTwo(qualifiers.length);
      const slots: Array<BracketSlot> = Array.from(
        { length: bracketSize },
        (_, index) => qualifiers[index] ?? null
      );
      const roundOneEntries = buildRoundOneEntries(slots);
      const bracketMatches = buildBracketMatchesTemplate(
        bracketSize,
        roundOneEntries
      );
      bracketMatches.forEach((match) => {
        playoffCreates.push({
          tournamentId,
          categoryId: item.categoryId,
          groupName: null,
          stage: "PLAYOFF",
          roundNumber: match.roundNumber,
          teamAId: match.teamAId,
          teamBId: match.teamBId,
        });
      });
      return;
    }

    const participants = orderRegistrations(
      registrations
        .filter((registration) => registration.categoryId === item.categoryId)
        .map((registration) => ({
          id: registration.id,
          seed: registration.seed ?? null,
          rankingNumber: registration.rankingNumber ?? null,
          createdAt: registration.createdAt,
        }))
    );
    if (participants.length < 2) return;
    const bracketSize = nextPowerOfTwo(participants.length);
    const slots: Array<BracketSlot> = Array.from(
      { length: bracketSize },
      (_, index) => participants[index] ?? null
    );
    const roundOneEntries = buildRoundOneEntries(slots);
    const bracketMatches = buildBracketMatchesTemplate(
      bracketSize,
      roundOneEntries
    );
    bracketMatches.forEach((match) => {
      playoffCreates.push({
        tournamentId,
        categoryId: item.categoryId,
        groupName: null,
        stage: "PLAYOFF",
        roundNumber: match.roundNumber,
        teamAId: match.teamAId,
        teamBId: match.teamBId,
      });
    });
  });

  if (playoffCreates.length > 0) {
    await prisma.tournamentMatch.createMany({ data: playoffCreates });
  }

  const allMatches = (await prisma.tournamentMatch.findMany({
    where: { tournamentId },
    select: {
      id: true,
      categoryId: true,
      groupName: true,
      stage: true,
      roundNumber: true,
    },
  })) as MatchSlot[];

  const allGroupMatches = allMatches.filter(
    (match) => match.stage === "GROUP"
  );
  const allPlayoffMatches = allMatches.filter(
    (match) => match.stage === "PLAYOFF"
  );

  const categoryOrderIndex = new Map<string, number>();
  categoryOrder.forEach((category, index) => {
    categoryOrderIndex.set(category.categoryId, index);
  });
  const groupCategoryIds = new Set(
    categoryOrder
      .filter((item) => groupDrawTypes.has(item.drawType ?? ""))
      .map((item) => item.categoryId)
  );

  const roundBuckets = new Map<number, MatchSlot[]>();
  allGroupMatches.forEach((match) => {
    if (!groupCategoryIds.has(match.categoryId)) return;
    const round = match.roundNumber ?? 1;
    if (!roundBuckets.has(round)) {
      roundBuckets.set(round, []);
    }
    roundBuckets.get(round)?.push(match);
  });

  const roundNumbers = Array.from(roundBuckets.keys()).sort((a, b) => a - b);
  const groupDaysNeeded =
    roundNumbers.length > 0 ? Math.ceil(roundNumbers.length / roundsPerDay) : 0;
  const groupDays = availablePlayDays.slice(0, groupDaysNeeded);
  const playoffDays = availablePlayDays.slice(groupDaysNeeded);

  const updates: {
    id: string;
    scheduledDate: Date | null;
    startTime: string | null;
    clubId: string | null;
    courtNumber: number | null;
  }[] = [];
  const overflowByDay = new Map<
    string,
    { missingMatches: number; slotCount: number; courtCount: number }
  >();

  const assignMatchesToDay = (day: string, dayMatches: MatchSlot[]) => {
    const schedule = scheduleMap.get(day);
    if (!schedule) {
      return { error: `No hay horarios configurados para ${day}` };
    }
    const slots = buildSlots(schedule);
    if (slots.length === 0) {
      return { error: `No hay horarios disponibles para ${day}` };
    }
    const slotCount = slots.length;
    const courtCount = courts.length;

    dayMatches.forEach((match, index) => {
      const slotIndex = Math.floor(index / courtCount);
      const courtIndex = index % courtCount;
      if (slotIndex >= slotCount) {
        const current = overflowByDay.get(day);
        overflowByDay.set(day, {
          missingMatches: (current?.missingMatches ?? 0) + 1,
          slotCount,
          courtCount,
        });
        updates.push({
          id: match.id,
          scheduledDate: null,
          startTime: null,
          clubId: null,
          courtNumber: null,
        });
        return;
      }
      const slot = slots[slotIndex];
      const court = courts[courtIndex];
      updates.push({
        id: match.id,
        scheduledDate: new Date(day),
        startTime: slot,
        clubId: court.clubId,
        courtNumber: court.courtNumber,
      });
    });

    return { error: null as string | null };
  };

  const dayMatchesMap = new Map<string, MatchSlot[]>();

  if (roundNumbers.length > 0 && groupDays.length === 0) {
    return NextResponse.json(
      { error: "No hay dias disponibles para las rondas de grupos" },
      { status: 400 }
    );
  }

  const groupDayFallback = groupDays[groupDays.length - 1];
  roundNumbers.forEach((roundNumber, index) => {
    const dayOffset = Math.floor(index / roundsPerDay);
    const day = groupDays[dayOffset] ?? groupDayFallback;
    if (!day) {
      return;
    }
    if (!dayMatchesMap.has(day)) {
      dayMatchesMap.set(day, []);
    }
    const ordered = [...(roundBuckets.get(roundNumber) ?? [])].sort((a, b) => {
      const categoryA = categoryOrderIndex.get(a.categoryId) ?? 0;
      const categoryB = categoryOrderIndex.get(b.categoryId) ?? 0;
      if (categoryA !== categoryB) return categoryA - categoryB;
      const groupA = (a.groupName ?? "").toString();
      const groupB = (b.groupName ?? "").toString();
      if (groupA !== groupB) return groupA.localeCompare(groupB);
      return a.id.localeCompare(b.id);
    });
    dayMatchesMap.get(day)?.push(...ordered);
  });

  for (const [day, dayMatches] of dayMatchesMap.entries()) {
    const result = assignMatchesToDay(day, dayMatches);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
  }

  const playoffRoundBuckets = new Map<number, MatchSlot[]>();
  allPlayoffMatches.forEach((match) => {
    const round = match.roundNumber ?? 1;
    if (!playoffRoundBuckets.has(round)) {
      playoffRoundBuckets.set(round, []);
    }
    playoffRoundBuckets.get(round)?.push(match);
  });
  const playoffRoundNumbers = Array.from(playoffRoundBuckets.keys()).sort(
    (a, b) => a - b
  );

  const playoffDayMatches = new Map<string, MatchSlot[]>();
  let unscheduledWithoutDay = 0;
  if (playoffRoundNumbers.length > 0 && playoffDays.length === 0) {
    unscheduledWithoutDay = allPlayoffMatches.length;
    allPlayoffMatches.forEach((match) => {
      updates.push({
        id: match.id,
        scheduledDate: null,
        startTime: null,
        clubId: null,
        courtNumber: null,
      });
    });
  }

  if (playoffDays.length > 0) {
    const playoffDayFallback = playoffDays[playoffDays.length - 1];
    playoffRoundNumbers.forEach((roundNumber, index) => {
      const dayOffset = Math.floor(index / roundsPerDay);
      const day = playoffDays[dayOffset] ?? playoffDayFallback;
      if (!day) {
        return;
      }
      if (!playoffDayMatches.has(day)) {
        playoffDayMatches.set(day, []);
      }
      const ordered = [...(playoffRoundBuckets.get(roundNumber) ?? [])].sort(
        (a, b) => {
          if (a.categoryId !== b.categoryId) {
            return a.categoryId.localeCompare(b.categoryId);
          }
          const roundA = a.roundNumber ?? 1;
          const roundB = b.roundNumber ?? 1;
          if (roundA !== roundB) return roundA - roundB;
          return a.id.localeCompare(b.id);
        }
      );
      playoffDayMatches.get(day)?.push(...ordered);
    });

    for (const [day, dayMatches] of playoffDayMatches.entries()) {
      const result = assignMatchesToDay(day, dayMatches);
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
    }
  }

  if (updates.length > 0) {
    await prisma.$transaction(
      updates.map((update) =>
        prisma.tournamentMatch.update({
          where: { id: update.id },
          data: {
            scheduledDate: update.scheduledDate,
            startTime: update.startTime,
            clubId: update.clubId,
            courtNumber: update.courtNumber,
          },
        })
      )
    );
  }

  const overflowEntries = Array.from(overflowByDay.entries());
  const totalMissing =
    overflowEntries.reduce((acc, [, entry]) => acc + entry.missingMatches, 0) +
    unscheduledWithoutDay;
  const warning =
    totalMissing > 0
      ? `No alcanzan los horarios configurados: ${totalMissing} partido(s) quedaron sin horario. Agrega mas horas o dias para completar el calendario.`
      : null;

  return NextResponse.json({
    updated: updates.length,
    playoffCreated: playoffCreates.length,
    warning,
    unscheduledCount: totalMissing,
  });
}

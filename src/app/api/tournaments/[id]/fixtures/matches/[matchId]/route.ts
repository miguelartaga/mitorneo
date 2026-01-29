import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";
import { getServerSession } from "@/lib/auth";
import { canManageTournament } from "@/lib/permissions";
import { computePlayoffMatchOrder } from "@/lib/playoff-match-utils";
import { NextResponse } from "next/server";

type GameInput = {
  a?: unknown;
  b?: unknown;
  tiebreakA?: unknown;
  tiebreakB?: unknown;
  durationMinutes?: unknown;
  duration?: unknown;
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

const computeMatchWinner = (games: { a: number; b: number }[]) => {
  if (games.length === 0) return null;
  let setsA = 0;
  let setsB = 0;
  for (const game of games) {
    if (game.a > game.b) {
      setsA += 1;
    } else if (game.b > game.a) {
      setsB += 1;
    }
  }
  if (setsA === setsB) return null;
  return setsA > setsB ? "A" : "B";
};

const determineWinnerTeamId = (match: {
  winnerSide?: "A" | "B" | null;
  games?: unknown;
  outcomeType?: "PLAYED" | "WALKOVER" | "INJURY" | null;
  outcomeSide?: "A" | "B" | null;
  teamAId?: string | null;
  teamBId?: string | null;
}) => {
  if (match.winnerSide === "A") return match.teamAId ?? null;
  if (match.winnerSide === "B") return match.teamBId ?? null;
  if (match.outcomeType && match.outcomeType !== "PLAYED") {
    if (match.outcomeSide === "A") return match.teamBId ?? null;
    if (match.outcomeSide === "B") return match.teamAId ?? null;
  }
  const inferred = computeMatchWinner(parseGames(match.games));
  if (inferred === "A") return match.teamAId ?? null;
  if (inferred === "B") return match.teamBId ?? null;
  return null;
};

const isPlaceholderValue = (value?: string | null) => {
  if (!value) return true;
  return /^(bye|empty|pending)-/.test(value);
};

type PlayoffMatchSlot = {
  id: string;
  roundNumber: number | null;
  teamAId: string | null;
  teamBId: string | null;
  orderHint?: number | null;
  winnerSide?: "A" | "B" | null;
  outcomeType?: "PLAYED" | "WALKOVER" | "INJURY" | null;
  outcomeSide?: "A" | "B" | null;
  games?: unknown;
  createdAt: Date;
};

const buildPlayoffStructure = (matches: PlayoffMatchSlot[]) => {
  const sorted = [...matches].sort((a, b) => {
    const roundA = a.roundNumber ?? 1;
    const roundB = b.roundNumber ?? 1;
    if (roundA !== roundB) return roundA - roundB;
    const orderA = typeof a.orderHint === "number" ? a.orderHint : null;
    const orderB = typeof b.orderHint === "number" ? b.orderHint : null;
    if (orderA !== null || orderB !== null) {
      if (orderA === null) return 1;
      if (orderB === null) return -1;
      if (orderA !== orderB) return orderA - orderB;
    }
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  const matchesByRound = new Map<number, PlayoffMatchSlot[]>();
  const orderMap = new Map<string, { round: number; order: number }>();
  sorted.forEach((match) => {
    const round = match.roundNumber ?? 1;
    const current = matchesByRound.get(round) ?? [];
    const order = current.length;
    current.push(match);
    matchesByRound.set(round, current);
    orderMap.set(match.id, { round, order });
  });
  return { matchesByRound, orderMap };
};

const buildMatchOrderOverrides = ({
  matches,
  slots,
}: {
  matches: PlayoffMatchSlot[];
  slots: { position: number; entrantId: string | null }[];
}) => {
  const overrides = new Map<string, number>();
  if (matches.length === 0 || slots.length === 0) {
    return overrides;
  }
  const slotEntries = slots.map((slot) => ({
    position: slot.position,
    entrantId: slot.entrantId ?? null,
  }));
  matches.forEach((match) => {
    const order = computePlayoffMatchOrder({
      match: {
        teamAId: match.teamAId,
        teamBId: match.teamBId,
        roundNumber: match.roundNumber ?? 1,
      },
      slots: slotEntries,
    });
    if (typeof order === "number") {
      overrides.set(match.id, order);
    }
  });
  return overrides;
};

const propagateLosersToBronzeMatch = async (args: {
  tournamentId: string;
  categoryId: string;
}) => {
  const { tournamentId, categoryId } = args;
  const playoffMatches = await prisma.tournamentMatch.findMany({
    where: { tournamentId, categoryId, stage: "PLAYOFF" },
    select: {
      id: true,
      roundNumber: true,
      orderHint: true,
      teamAId: true,
      teamBId: true,
      createdAt: true,
      isBronzeMatch: true,
      winnerSide: true,
      games: true,
      outcomeType: true,
      outcomeSide: true,
    },
  });
  if (playoffMatches.length === 0) return;

  const bronzeMatch = playoffMatches.find((entry) => entry.isBronzeMatch);
  if (!bronzeMatch) return;

  const mainMatches = playoffMatches.filter((entry) => !entry.isBronzeMatch);
  if (mainMatches.length === 0) return;

  const playoffSlots = await prisma.playoffSlot.findMany({
    where: { tournamentId, categoryId },
    select: { position: true, entrantId: true },
    orderBy: { position: "asc" },
  });

  const finalRound = Math.max(
    ...mainMatches.map((entry) => entry.roundNumber ?? 1),
    1
  );
  if (finalRound <= 1) return;
  const semifinalRound = finalRound - 1;

  const orderOverrides = buildMatchOrderOverrides({
    matches: mainMatches,
    slots: playoffSlots,
  });
  const { matchesByRound } = buildPlayoffStructure(
    mainMatches.map((match) =>
      orderOverrides.has(match.id)
        ? { ...match, orderHint: orderOverrides.get(match.id) ?? match.orderHint }
        : match
    )
  );
  const semifinalMatches = matchesByRound.get(semifinalRound) ?? [];
  if (semifinalMatches.length === 0) return;

  const loserSlots = semifinalMatches
    .map((match) => {
      const winnerTeamId = determineWinnerTeamId(match);
      if (!winnerTeamId) return null;
      if (match.teamAId && match.teamAId === winnerTeamId) {
        return match.teamBId ?? null;
      }
      if (match.teamBId && match.teamBId === winnerTeamId) {
        return match.teamAId ?? null;
      }
      return null;
    })
    .filter(Boolean) as string[];

  if (loserSlots.length === 0) return;

  const data: Record<string, string> = {};
  const targetSlots = ["teamAId", "teamBId"] as const;
  targetSlots.forEach((slot, index) => {
    const loserId = loserSlots[index];
    if (!loserId) return;
    const currentValue =
      slot === "teamAId" ? bronzeMatch.teamAId : bronzeMatch.teamBId;
    if (currentValue && !isPlaceholderValue(currentValue)) {
      return;
    }
    if (currentValue === loserId) {
      return;
    }
    (data as Record<string, string>)[slot] = loserId;
  });

  if (Object.keys(data).length === 0) {
    return;
  }

  await prisma.tournamentMatch.update({
    where: { id: bronzeMatch.id },
    data,
  });
};

const propagateWinnerToNextMatch = async (args: {
  tournamentId: string;
  categoryId: string;
  matchId: string;
  winnerTeamId: string;
}) => {
  const { tournamentId, categoryId, matchId, winnerTeamId } = args;
  const playoffMatches = await prisma.tournamentMatch.findMany({
    where: { tournamentId, categoryId, stage: "PLAYOFF" },
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
      isBronzeMatch: true,
    },
  });
  const playoffSlots = await prisma.playoffSlot.findMany({
    where: { tournamentId, categoryId },
    select: { position: true, entrantId: true },
    orderBy: { position: "asc" },
  });
  const mainMatches = playoffMatches.filter((entry) => !entry.isBronzeMatch);
  if (mainMatches.length === 0) return;
  const orderOverrides = buildMatchOrderOverrides({
    matches: mainMatches,
    slots: playoffSlots,
  });
  const { matchesByRound, orderMap } = buildPlayoffStructure(
    mainMatches.map((match) =>
      orderOverrides.has(match.id)
        ? { ...match, orderHint: orderOverrides.get(match.id) ?? match.orderHint }
        : match
    )
  );
  const pos = orderMap.get(matchId);
  if (!pos) return;
  const nextRound = pos.round + 1;
  const nextMatches = matchesByRound.get(nextRound);
  if (!nextMatches) return;
  const targetIndex = Math.floor(pos.order / 2);
  const targetMatch = nextMatches[targetIndex];
  if (!targetMatch) return;
  const slot = pos.order % 2 === 0 ? "teamAId" : "teamBId";
  const currentValue = slot === "teamAId" ? targetMatch.teamAId : targetMatch.teamBId;
  const currentMatch = mainMatches.find((entry) => entry.id === matchId);
  const feederIds = new Set(
    [currentMatch?.teamAId, currentMatch?.teamBId].filter(Boolean) as string[]
  );
  const targetHasResult =
    Boolean(targetMatch.winnerSide) ||
    (targetMatch.outcomeType && targetMatch.outcomeType !== "PLAYED") ||
    (Array.isArray(targetMatch.games) && targetMatch.games.length > 0);
  const currentRoundMatches = matchesByRound.get(pos.round) ?? [];
  const feederA = currentRoundMatches[targetIndex * 2];
  const feederB = currentRoundMatches[targetIndex * 2 + 1];
  const feederTeamIds = new Set(
    [feederA?.teamAId, feederA?.teamBId, feederB?.teamAId, feederB?.teamBId].filter(
      Boolean
    ) as string[]
  );
  const isStaleSlot =
    currentValue !== null &&
    currentValue !== undefined &&
    !feederTeamIds.has(currentValue);
  const canOverwrite =
    !currentValue ||
    isPlaceholderValue(currentValue) ||
    feederIds.has(currentValue) ||
    (!targetHasResult && isStaleSlot);
  if (!canOverwrite) {
    return;
  }
  if (currentValue === winnerTeamId) {
    return;
  }
  await prisma.tournamentMatch.update({
    where: { id: targetMatch.id },
    data: { [slot]: winnerTeamId },
  });
};

const resolveIds = (
  request: Request,
  resolvedParams?: { id?: string; matchId?: string }
) => {
  if (resolvedParams?.id && resolvedParams?.matchId) {
    return { tournamentId: resolvedParams.id, matchId: resolvedParams.matchId };
  }
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const matchesIndex = parts.indexOf("matches");
  return {
    tournamentId:
      resolvedParams?.id ?? (matchesIndex > 0 ? parts[matchesIndex - 2] : undefined),
    matchId:
      resolvedParams?.matchId ?? (matchesIndex >= 0 ? parts[matchesIndex + 1] : undefined),
  };
};

const isDateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const isValidTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

const parseScore = (value: unknown) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const parseDuration = (value: unknown) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const hasValue = (value: unknown) => {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
};

const parseCourtNumber = (value: unknown) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const parseSide = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  if (value === "A" || value === "B") return value;
  return "INVALID";
};

const parseOutcomeType = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  if (value === "PLAYED" || value === "WALKOVER" || value === "INJURY") {
    return value;
  }
  return "INVALID";
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  const resolvedParams = await params;
  const session = await getServerSession();
  if (
    !session?.user ||
    (session.user.role !== "ADMIN" && session.user.role !== "TOURNAMENT_ADMIN")
  ) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { tournamentId, matchId } = resolveIds(request, resolvedParams);
  if (!tournamentId || !matchId) {
    return NextResponse.json({ error: "Partido no encontrado" }, { status: 404 });
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

  const match = await prisma.tournamentMatch.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      tournamentId: true,
      categoryId: true,
      outcomeType: true,
      outcomeSide: true,
      stage: true,
      isBronzeMatch: true,
      refereeToken: true,
    },
  });

  if (!match || match.tournamentId !== tournamentId) {
    return NextResponse.json({ error: "Partido no encontrado" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if ("scheduledDate" in body) {
    const value = body.scheduledDate as string | null | undefined;
    if (value === null || value === "") {
      data.scheduledDate = null;
    } else if (typeof value === "string" && isDateOnly(value)) {
      const playDays = Array.isArray(tournament.playDays) ? tournament.playDays : [];
      if (playDays.length > 0 && !playDays.includes(value)) {
        return NextResponse.json(
          { error: "La fecha no pertenece al torneo" },
          { status: 400 }
        );
      }
      data.scheduledDate = new Date(value);
    } else {
      return NextResponse.json({ error: "Fecha invalida" }, { status: 400 });
    }
  }

  if ("startTime" in body) {
    const value = body.startTime as string | null | undefined;
    if (value === null || value === "") {
      data.startTime = null;
    } else if (typeof value === "string" && isValidTime(value)) {
      data.startTime = value;
    } else {
      return NextResponse.json({ error: "Hora invalida" }, { status: 400 });
    }
  }

  if ("clubId" in body || "courtNumber" in body) {
    const clubRaw = body.clubId as string | null | undefined;
    const courtRaw = body.courtNumber as unknown;
    const clubId =
      typeof clubRaw === "string" ? clubRaw.trim() : clubRaw ?? null;

    if (!clubId) {
      if (clubRaw === null || clubRaw === "" || clubRaw === undefined) {
        data.clubId = null;
        data.courtNumber = null;
      } else {
        return NextResponse.json({ error: "Club invalido" }, { status: 400 });
      }
    } else {
      const courtNumber = parseCourtNumber(courtRaw);
      if (courtNumber === null) {
        return NextResponse.json(
          { error: "Numero de cancha invalido" },
          { status: 400 }
        );
      }
      const club = await prisma.tournamentClub.findFirst({
        where: { id: clubId, tournamentId },
        select: { id: true, courtsCount: true },
      });
      if (!club) {
        return NextResponse.json({ error: "Club no encontrado" }, { status: 404 });
      }
      if (courtNumber > club.courtsCount) {
        return NextResponse.json(
          { error: "La cancha supera el limite del club" },
          { status: 400 }
        );
      }
      data.clubId = club.id;
      data.courtNumber = courtNumber;
    }
  }

  if ("games" in body) {
    if (body.games === null) {
      data.games = null;
    } else if (!Array.isArray(body.games)) {
      return NextResponse.json({ error: "Juegos invalidos" }, { status: 400 });
    } else {
      const parsedGames: {
        a: number;
        b: number;
        tiebreakA?: number;
        tiebreakB?: number;
        durationMinutes?: number;
      }[] = [];
      const games = body.games as GameInput[];
      if (games.length > 5) {
        return NextResponse.json(
          { error: "Cantidad de sets invalida" },
          { status: 400 }
        );
      }
      for (const game of games) {
        if (!game || typeof game !== "object") continue;
        const aRaw = game.a;
        const bRaw = game.b;
        const tiebreakARaw = game.tiebreakA;
        const tiebreakBRaw = game.tiebreakB;
        const durationRaw =
          game.durationMinutes !== undefined ? game.durationMinutes : game.duration;
        const a = parseScore(aRaw);
        const b = parseScore(bRaw);
        const tiebreakA = parseScore(tiebreakARaw);
        const tiebreakB = parseScore(tiebreakBRaw);
        const duration = parseDuration(durationRaw);
        const aHas = hasValue(aRaw);
        const bHas = hasValue(bRaw);
        const tiebreakAHas = hasValue(tiebreakARaw);
        const tiebreakBHas = hasValue(tiebreakBRaw);
        const durationHas = hasValue(durationRaw);
        if (aHas && a === null) {
          return NextResponse.json(
            { error: "Puntaje invalido en un set" },
            { status: 400 }
          );
        }
        if (bHas && b === null) {
          return NextResponse.json(
            { error: "Puntaje invalido en un set" },
            { status: 400 }
          );
        }
        if (tiebreakAHas && tiebreakA === null) {
          return NextResponse.json(
            { error: "Puntaje invalido en tie-break" },
            { status: 400 }
          );
        }
        if (tiebreakBHas && tiebreakB === null) {
          return NextResponse.json(
            { error: "Puntaje invalido en tie-break" },
            { status: 400 }
          );
        }
        if (durationHas && duration === null) {
          return NextResponse.json(
            { error: "Duracion invalida en un set" },
            { status: 400 }
          );
        }
        if (!aHas && !bHas && !tiebreakAHas && !tiebreakBHas && !durationHas) {
          continue;
        }
        if (a === null || b === null) {
          return NextResponse.json(
            { error: "Completa ambos puntajes por set" },
            { status: 400 }
          );
        }
        if (tiebreakAHas !== tiebreakBHas) {
          return NextResponse.json(
            { error: "Completa ambos puntajes de tie-break" },
            { status: 400 }
          );
        }
        const entry: {
          a: number;
          b: number;
          tiebreakA?: number;
          tiebreakB?: number;
          durationMinutes?: number;
        } = { a, b };
        if (tiebreakA !== null && tiebreakB !== null) {
          entry.tiebreakA = tiebreakA;
          entry.tiebreakB = tiebreakB;
        }
        if (duration !== null) {
          entry.durationMinutes = duration;
        }
        parsedGames.push(entry);
      }
      data.games = parsedGames;
    }
  }

  const outcomeTypeRaw = "outcomeType" in body ? body.outcomeType : undefined;
  const outcomeSideRaw = "outcomeSide" in body ? body.outcomeSide : undefined;
  const winnerRaw = "winnerSide" in body ? body.winnerSide : undefined;

  const parsedOutcomeType =
    outcomeTypeRaw !== undefined ? parseOutcomeType(outcomeTypeRaw) : undefined;
  const parsedOutcomeSide =
    outcomeSideRaw !== undefined ? parseSide(outcomeSideRaw) : undefined;
  const parsedWinner =
    winnerRaw !== undefined ? parseSide(winnerRaw) : undefined;

  if (parsedOutcomeType === "INVALID") {
    return NextResponse.json({ error: "Resultado invalido" }, { status: 400 });
  }
  if (parsedOutcomeSide === "INVALID") {
    return NextResponse.json({ error: "Equipo invalido" }, { status: 400 });
  }
  if (parsedWinner === "INVALID") {
    return NextResponse.json({ error: "Ganador invalido" }, { status: 400 });
  }

  if (parsedOutcomeType !== undefined || parsedOutcomeSide !== undefined) {
    const nextOutcomeType =
      parsedOutcomeType ?? match.outcomeType ?? "PLAYED";
    let nextOutcomeSide =
      parsedOutcomeSide !== undefined
        ? parsedOutcomeSide
        : match.outcomeSide ?? null;

    if (nextOutcomeType === "PLAYED") {
      nextOutcomeSide = null;
    }

    if (nextOutcomeType !== "PLAYED" && !nextOutcomeSide) {
      return NextResponse.json(
        { error: "Selecciona el equipo afectado" },
        { status: 400 }
      );
    }

    data.outcomeType = nextOutcomeType;
    data.outcomeSide = nextOutcomeSide;
  }

  if (parsedWinner !== undefined) {
    data.winnerSide = parsedWinner;
  }

  if ("liveState" in body) {
    if (body.liveState === null) {
      data.liveState = null;
    } else if (typeof body.liveState === "object") {
      data.liveState = body.liveState;
    } else {
      return NextResponse.json({ error: "Estado en vivo invalido" }, { status: 400 });
    }
  }

  if ("refereeToken" in body) {
    const tokenRaw = body.refereeToken as string | null | undefined;
    if (tokenRaw === null || tokenRaw === "") {
      data.refereeToken = null;
    } else if (typeof tokenRaw === "string") {
      const trimmed = tokenRaw.trim();
      if (!trimmed) {
        data.refereeToken = null;
      } else {
        data.refereeToken = trimmed;
      }
    } else {
      return NextResponse.json({ error: "Token invalido" }, { status: 400 });
    }
  }

  if (body.generateRefereeToken === true) {
    if (!match.refereeToken) {
      data.refereeToken = `ref_${randomBytes(16).toString("hex")}`;
    }
  }

  const updated = await prisma.tournamentMatch.update({
    where: { id: matchId },
    data,
    select: {
      id: true,
      categoryId: true,
      groupName: true,
      scheduledDate: true,
      startTime: true,
      games: true,
      liveState: true,
      refereeToken: true,
      winnerSide: true,
      outcomeType: true,
      outcomeSide: true,
      teamAId: true,
      teamBId: true,
      clubId: true,
      courtNumber: true,
      stage: true,
      isBronzeMatch: true,
    },
  });

  if (match.stage === "PLAYOFF" && !match.isBronzeMatch) {
    const winnerTeamId = determineWinnerTeamId(updated);
    if (winnerTeamId) {
      await propagateWinnerToNextMatch({
        tournamentId,
        categoryId: updated.categoryId,
        matchId: updated.id,
        winnerTeamId,
      });
    }
    await propagateLosersToBronzeMatch({
      tournamentId,
      categoryId: updated.categoryId,
    });
  }

  return NextResponse.json({
    match: {
      id: updated.id,
      categoryId: updated.categoryId,
      groupName: updated.groupName,
      scheduledDate: updated.scheduledDate
        ? updated.scheduledDate.toISOString().split("T")[0]
        : null,
      startTime: updated.startTime,
      games: updated.games,
      liveState: updated.liveState,
      refereeToken: updated.refereeToken,
      winnerSide: updated.winnerSide,
      outcomeType: updated.outcomeType,
      outcomeSide: updated.outcomeSide,
      teamAId: updated.teamAId,
      teamBId: updated.teamBId,
      clubId: updated.clubId,
      courtNumber: updated.courtNumber,
      stage: updated.stage,
      isBronzeMatch: updated.isBronzeMatch,
    },
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  const resolvedParams = await params;
  const session = await getServerSession();
  if (
    !session?.user ||
    (session.user.role !== "ADMIN" && session.user.role !== "TOURNAMENT_ADMIN")
  ) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { tournamentId, matchId } = resolveIds(request, resolvedParams);
  if (!tournamentId || !matchId) {
    return NextResponse.json({ error: "Partido no encontrado" }, { status: 404 });
  }

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true, ownerId: true, status: true },
  });

  if (!tournament) {
    return NextResponse.json(
      { error: "Torneo no encontrado" },
      { status: 404 }
    );
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

  const match = await prisma.tournamentMatch.findUnique({
    where: { id: matchId },
    select: { id: true, tournamentId: true },
  });

  if (!match || match.tournamentId !== tournamentId) {
    return NextResponse.json({ error: "Partido no encontrado" }, { status: 404 });
  }

  await prisma.tournamentMatch.delete({ where: { id: matchId } });

  return NextResponse.json({ deleted: true });
}

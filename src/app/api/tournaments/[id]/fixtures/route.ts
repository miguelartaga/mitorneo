import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { getServerSession } from "@/lib/auth";
import { canManageTournament } from "@/lib/permissions";
import { NextResponse } from "next/server";
import { GET as getFixturePdf } from "./pdf/route";

const DEFAULT_TIEBREAKERS = [
  "SETS_DIFF",
  "MATCHES_WON",
  "POINTS_PER_MATCH",
  "POINTS_DIFF",
] as const;

const resolveId = (request: Request, resolvedParams?: { id?: string }) => {
  if (resolvedParams?.id) return resolvedParams.id;
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 2] : undefined;
};

const toDateOnly = (value?: Date | string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().split("T")[0];
};

const toISOStringOrNull = (value?: Date | string | null) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

const normalizeTiebreakerOrder = (value: unknown) => {
  if (!Array.isArray(value)) return [...DEFAULT_TIEBREAKERS];
  const list = value.filter(
    (item): item is string =>
      typeof item === "string" && DEFAULT_TIEBREAKERS.includes(item as never)
  );
  const unique = Array.from(new Set(list));
  const hasAll = DEFAULT_TIEBREAKERS.every((item) => unique.includes(item));
  if (!hasAll || unique.length !== DEFAULT_TIEBREAKERS.length) {
    return [...DEFAULT_TIEBREAKERS];
  }
  return unique;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const url = new URL(request.url);
  if (url.searchParams.get("format") === "pdf") {
    return getFixturePdf(request, { params });
  }
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
    select: {
      id: true,
      ownerId: true,
      playDays: true,
      status: true,
      paymentRate: true,
      groupsPublished: true,
      playoffsPublished: true,
    },
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

  const fetchFixtureData = async (tx: Prisma.TransactionClient) => {
    const categories = await tx.tournamentCategory.findMany({
      where: { tournamentId },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            abbreviation: true,
            modality: true,
            gender: true,
            sport: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { category: { name: "asc" } },
    });

    const registrations = await tx.tournamentRegistration.findMany({
      where: { tournamentId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        categoryId: true,
        groupName: true,
        seed: true,
        rankingNumber: true,
        createdAt: true,
        teamName: true,
        player: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            documentType: true,
            documentNumber: true,
          },
        },
        partner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            documentType: true,
            documentNumber: true,
          },
        },
        partnerTwo: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            documentType: true,
            documentNumber: true,
          },
        },
      },
    });

    const groupQualifiers = await tx.tournamentGroupQualifier.findMany({
      where: { tournamentId },
      select: { categoryId: true, groupName: true, qualifiers: true },
    });

    const clubs = await tx.tournamentClub.findMany({
      where: { tournamentId },
      select: { id: true, name: true, courtsCount: true },
      orderBy: { name: "asc" },
    });

    const matches = await tx.tournamentMatch.findMany({
      where: { tournamentId },
      orderBy: [
        { scheduledDate: "asc" },
        { startTime: "asc" },
        { createdAt: "asc" },
      ],
      select: {
        id: true,
        categoryId: true,
        groupName: true,
        stage: true,
        winnerSide: true,
        outcomeType: true,
        outcomeSide: true,
        roundNumber: true,
        orderHint: true,
        scheduledDate: true,
        startTime: true,
        games: true,
        liveState: true,
        refereeToken: true,
        teamAId: true,
        teamBId: true,
        clubId: true,
        courtNumber: true,
        createdAt: true,
        isBronzeMatch: true,
      },
    });

    const groupPoints = await tx.tournamentGroupPoints.findUnique({
      where: { tournamentId },
      select: {
        winPoints: true,
        winWithoutGameLossPoints: true,
        lossPoints: true,
        lossWithGameWinPoints: true,
        tiebreakerOrder: true,
      },
    });

    const playoffSlots = await tx.playoffSlot.findMany({
      where: { tournamentId },
      orderBy: [
        { categoryId: "asc" },
        { position: "asc" },
      ],
      select: {
        id: true,
        categoryId: true,
        position: true,
        entrantId: true,
        locked: true,
        bracketId: true,
      },
    });

    return {
      categories,
      registrations,
      groupQualifiers,
      clubs,
      matches,
      groupPoints,
      playoffSlots,
    };
  };

  let data: Awaited<ReturnType<typeof fetchFixtureData>>;

  try {
    data = await prisma.$transaction(
      async (tx) => fetchFixtureData(tx),
      { maxWait: 10000, timeout: 20000 }
    );
  } catch (error: unknown) {
    const detail =
      process.env.NODE_ENV !== "production" && error instanceof Error
        ? error.message
        : undefined;
    return NextResponse.json(
      detail
        ? { error: "No se pudo cargar el fixture", detail }
        : { error: "No se pudo cargar el fixture" },
      { status: 500 }
    );
  }

  const playDays = Array.isArray(tournament.playDays) ? tournament.playDays : [];

  return NextResponse.json({
    tournamentStatus: tournament.status,
    paymentRate: tournament.paymentRate.toString(),
    groupsPublished: tournament.groupsPublished,
    playoffsPublished: tournament.playoffsPublished,
    sessionRole: session.user.role,
    playDays,
    groupPoints: {
      winPoints: data.groupPoints?.winPoints ?? 0,
      winWithoutGameLossPoints: data.groupPoints?.winWithoutGameLossPoints ?? 0,
      lossPoints: data.groupPoints?.lossPoints ?? 0,
      lossWithGameWinPoints: data.groupPoints?.lossWithGameWinPoints ?? 0,
      tiebreakerOrder: normalizeTiebreakerOrder(data.groupPoints?.tiebreakerOrder),
    },
    categories: data.categories.map((item) => ({
      id: item.category.id,
      name: item.category.name,
      abbreviation: item.category.abbreviation,
      modality: item.category.modality,
      gender: item.category.gender,
      sport: item.category.sport,
      drawType: item.drawType,
      groupQualifiers: item.groupQualifiers ?? 2,
      hasBronzeMatch: item.hasBronzeMatch,
      playoffStatus: item.playoffStatus ?? "DRAFT",
    })),
    groupQualifiers: data.groupQualifiers.map((entry) => ({
      categoryId: entry.categoryId,
      groupName: entry.groupName,
      qualifiers: entry.qualifiers,
    })),
    clubs: data.clubs.map((club) => ({
      id: club.id,
      name: club.name,
      courtsCount: club.courtsCount,
    })),
    registrations: data.registrations.map((registration) => ({
      id: registration.id,
      categoryId: registration.categoryId,
      groupName: registration.groupName,
      seed: registration.seed,
      rankingNumber: registration.rankingNumber,
      createdAt: toISOStringOrNull(registration.createdAt),
      player: registration.player,
      partner: registration.partner,
      partnerTwo: registration.partnerTwo,
      teamName: registration.teamName,
    })),
    matches: data.matches.map((match) => ({
      id: match.id,
      categoryId: match.categoryId,
      groupName: match.groupName,
      isBronzeMatch: match.isBronzeMatch,
      stage: match.stage,
      winnerSide: match.winnerSide,
      outcomeType: match.outcomeType,
      outcomeSide: match.outcomeSide,
      roundNumber: match.roundNumber,
      orderHint: match.orderHint ?? null,
      scheduledDate: toDateOnly(match.scheduledDate),
      startTime: match.startTime,
      games: match.games,
      liveState: match.liveState,
      refereeToken: match.refereeToken,
      teamAId: match.teamAId,
      teamBId: match.teamBId,
      clubId: match.clubId,
      courtNumber: match.courtNumber,
      createdAt: toDateOnly(match.createdAt),
    })),
    playoffSlots: data.playoffSlots.map((slot) => ({
      id: slot.id,
      categoryId: slot.categoryId,
      position: slot.position,
      entrantId: slot.entrantId,
      locked: slot.locked,
      bracketId: slot.bracketId,
    })),
  });
}

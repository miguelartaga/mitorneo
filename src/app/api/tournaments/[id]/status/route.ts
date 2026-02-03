import { prisma } from "@/lib/prisma";
import { getServerSession } from "@/lib/auth";
import {
  computePlayerPointsByCategory,
  type TournamentRankingData,
} from "@/lib/ranking";
import { NextResponse } from "next/server";

type StatusInput = "WAITING" | "ACTIVE" | "FINISHED";

const resolveId = async (
  request: Request,
  params?: { id?: string } | Promise<{ id?: string }>
) => {
  if (params) {
    const resolved =
      typeof (params as Promise<{ id?: string }>).then === "function"
        ? await (params as Promise<{ id?: string }>)
        : (params as { id?: string });
    if (resolved?.id) return resolved.id;
  }
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 2] : undefined;
};

const parseStatus = (value: unknown): StatusInput | "INVALID" => {
  if (typeof value !== "string") return "INVALID";
  const trimmed = value.trim().toUpperCase();
  if (trimmed === "WAITING" || trimmed === "ACTIVE" || trimmed === "FINISHED") {
    return trimmed as StatusInput;
  }
  return "INVALID";
};

const countRegistrationPlayers = (registration: {
  playerId?: string | null;
  partnerId?: string | null;
  partnerTwoId?: string | null;
}) => {
  let count = 0;
  if (registration.playerId) count += 1;
  if (registration.partnerId) count += 1;
  if (registration.partnerTwoId) count += 1;
  return count;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const tournamentId = await resolveId(request, resolvedParams);
  if (!tournamentId) {
    return NextResponse.json({ error: "Torneo no encontrado" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const status = parseStatus((body as { status?: unknown }).status);
  if (status === "INVALID") {
    return NextResponse.json({ error: "Estado invalido" }, { status: 400 });
  }

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: {
      id: true,
      ownerId: true,
      status: true,
      leagueId: true,
      rankingEnabled: true,
      startDate: true,
      createdAt: true,
      paymentRate: true,
      paymentPaidAmount: true,
    },
  });

  if (!tournament) {
    return NextResponse.json({ error: "Torneo no encontrado" }, { status: 404 });
  }

  const isAdmin = session.user.role === "ADMIN";
  const isOwner =
    session.user.role === "TOURNAMENT_ADMIN" &&
    tournament.ownerId === session.user.id;

  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  if (!isAdmin) {
    if (status !== "FINISHED") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    if (tournament.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "El torneo debe estar activo para finalizar" },
        { status: 400 }
      );
    }
    // Permite finalizar aunque falten partidos, segun la solicitud del administrador.
  }

  if (status === "ACTIVE") {
    const registrations = await prisma.tournamentRegistration.findMany({
      where: { tournamentId },
      select: { playerId: true, partnerId: true, partnerTwoId: true },
    });
    const playersCount = registrations.reduce(
      (sum, registration) => sum + countRegistrationPlayers(registration),
      0
    );
    const rate = Number.parseFloat(String(tournament.paymentRate ?? 0));
    const paid = Number.parseFloat(String(tournament.paymentPaidAmount ?? 0));
    const total = rate * playersCount;
    if (paid + 0.005 < total) {
      return NextResponse.json(
        { error: "Aun hay saldo pendiente por pagar" },
        { status: 400 }
      );
    }
  }

  const shouldApplyRanking =
    status === "FINISHED" && tournament.status !== "FINISHED";

  if (shouldApplyRanking && tournament.rankingEnabled && tournament.leagueId) {
    const tournamentDate = tournament.startDate ?? tournament.createdAt;
    const season = await prisma.season.findFirst({
      where: {
        leagueId: tournament.leagueId,
        startDate: { lte: tournamentDate },
        endDate: { gte: tournamentDate },
      },
      select: { id: true },
    });

    if (!season) {
      return NextResponse.json(
        {
          error:
            "No hay una temporada activa para este torneo. Crea una nueva temporada.",
        },
        { status: 400 }
      );
    }

    const tournamentData = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        categories: { select: { categoryId: true, drawType: true } },
        registrations: {
          select: {
            id: true,
            categoryId: true,
            groupName: true,
            seed: true,
            rankingNumber: true,
            createdAt: true,
            playerId: true,
            partnerId: true,
            partnerTwoId: true,
          },
        },
        matches: {
          select: {
            categoryId: true,
            groupName: true,
            stage: true,
            roundNumber: true,
            games: true,
            teamAId: true,
            teamBId: true,
            winnerSide: true,
            outcomeType: true,
            outcomeSide: true,
            isBronzeMatch: true,
          },
        },
        groupPoints: {
          select: {
            winPoints: true,
            winWithoutGameLossPoints: true,
            lossPoints: true,
            lossWithGameWinPoints: true,
            tiebreakerOrder: true,
          },
        },
        rankingPoints: {
          select: { placeFrom: true, placeTo: true, points: true },
        },
      },
    });

    if (tournamentData) {
      const data: TournamentRankingData = {
        categories: tournamentData.categories.map((entry) => ({
          categoryId: entry.categoryId,
          drawType: entry.drawType as TournamentRankingData["categories"][number]["drawType"],
        })),
        registrations: tournamentData.registrations.map((registration) => ({
          id: registration.id,
          categoryId: registration.categoryId,
          groupName: registration.groupName,
          seed: registration.seed,
          rankingNumber: registration.rankingNumber,
          createdAt: registration.createdAt,
          playerId: registration.playerId,
          partnerId: registration.partnerId,
          partnerTwoId: registration.partnerTwoId,
        })),
        matches: tournamentData.matches.map((match) => ({
          categoryId: match.categoryId,
          groupName: match.groupName,
          stage: match.stage as TournamentRankingData["matches"][number]["stage"],
          roundNumber: match.roundNumber,
          games: match.games,
          teamAId: match.teamAId,
          teamBId: match.teamBId,
          winnerSide: match.winnerSide as TournamentRankingData["matches"][number]["winnerSide"],
          outcomeType: match.outcomeType as TournamentRankingData["matches"][number]["outcomeType"],
          outcomeSide: match.outcomeSide as TournamentRankingData["matches"][number]["outcomeSide"],
          isBronzeMatch: match.isBronzeMatch,
        })),
        groupPoints: tournamentData.groupPoints
          ? {
              winPoints: tournamentData.groupPoints.winPoints,
              winWithoutGameLossPoints:
                tournamentData.groupPoints.winWithoutGameLossPoints,
              lossPoints: tournamentData.groupPoints.lossPoints,
              lossWithGameWinPoints:
                tournamentData.groupPoints.lossWithGameWinPoints,
              tiebreakerOrder: tournamentData.groupPoints.tiebreakerOrder,
            }
          : null,
        rankingPoints: tournamentData.rankingPoints,
      };

      if (!(prisma as typeof prisma & { playerRanking?: unknown }).playerRanking) {
        return NextResponse.json(
          { error: "Prisma client desactualizado. Ejecuta prisma generate." },
          { status: 500 }
        );
      }

      const { pointsByPlayerCategory } = computePlayerPointsByCategory(data);
      const updates: ReturnType<typeof prisma.playerRanking.upsert>[] = [];
      pointsByPlayerCategory.forEach((categoryMap, playerId) => {
        categoryMap.forEach((points, categoryId) => {
          updates.push(
            prisma.playerRanking.upsert({
              where: {
                playerId_leagueId_seasonId_categoryId: {
                  playerId,
                  leagueId: tournament.leagueId as string,
                  seasonId: season.id,
                  categoryId,
                },
              },
              update: { points: { increment: points } },
              create: {
                playerId,
                leagueId: tournament.leagueId as string,
                seasonId: season.id,
                categoryId,
                points,
              },
            })
          );
        });
      });
      if (updates.length > 0) {
        await prisma.$transaction(updates);
      }
    }
  }

  const updated = await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status },
    select: { id: true, status: true },
  });

  return NextResponse.json({ tournament: updated });
}

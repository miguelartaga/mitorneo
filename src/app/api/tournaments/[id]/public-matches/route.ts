import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const resolveId = async (
  request: Request,
  params?: Promise<{ id?: string }>
) => {
  const resolved = params ? await params : undefined;
  if (resolved?.id) return resolved.id;
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const tournamentId = await resolveId(request, resolvedParams);
  if (!tournamentId) {
    return NextResponse.json({ error: "Torneo no encontrado" }, { status: 404 });
  }

  const matches = await prisma.tournamentMatch.findMany({
    where: { tournamentId },
    select: {
      id: true,
      categoryId: true,
      category: {
        select: { id: true, name: true, abbreviation: true },
      },
      groupName: true,
      stage: true,
      roundNumber: true,
      orderHint: true,
      createdAt: true,
      orderHint: true,
      isBronzeMatch: true,
      scheduledDate: true,
      startTime: true,
      games: true,
      liveState: true,
      winnerSide: true,
      outcomeType: true,
      outcomeSide: true,
      teamAId: true,
      teamA: {
        select: {
          id: true,
          teamName: true,
          player: { select: { id: true, firstName: true, lastName: true } },
          partner: { select: { id: true, firstName: true, lastName: true } },
          partnerTwo: { select: { id: true, firstName: true, lastName: true } },
        },
      },
      teamBId: true,
      teamB: {
        select: {
          id: true,
          teamName: true,
          player: { select: { id: true, firstName: true, lastName: true } },
          partner: { select: { id: true, firstName: true, lastName: true } },
          partnerTwo: { select: { id: true, firstName: true, lastName: true } },
        },
      },
      club: {
        select: { id: true, name: true },
      },
      courtNumber: true,
    },
    orderBy: [
      { scheduledDate: "asc" },
      { startTime: "asc" },
      { createdAt: "asc" },
    ],
  });

  const playoffSlots = await prisma.playoffSlot.findMany({
    where: { tournamentId },
    select: { categoryId: true, position: true, entrantId: true },
    orderBy: { position: "asc" },
  });

  return NextResponse.json({
    matches: matches.map((match) => ({
      id: match.id,
      categoryId: match.categoryId,
      category: match.category,
      groupName: match.groupName ?? null,
      stage: match.stage,
      roundNumber: match.roundNumber ?? null,
      orderHint: match.orderHint ?? null,
      createdAt: match.createdAt.toISOString(),
      orderHint: match.orderHint ?? null,
      isBronzeMatch: match.isBronzeMatch ?? null,
      scheduledDate: toDateOnly(match.scheduledDate),
      startTime: match.startTime,
      games: match.games,
      liveState: match.liveState,
      winnerSide: match.winnerSide,
      outcomeType: match.outcomeType,
      outcomeSide: match.outcomeSide,
      teamAId: match.teamAId ?? null,
      teamA: match.teamA,
      teamBId: match.teamBId ?? null,
      teamB: match.teamB,
      club: match.club,
      courtNumber: match.courtNumber ?? null,
    })),
    playoffSlots: playoffSlots.map((slot) => ({
      categoryId: slot.categoryId,
      position: slot.position,
      entrantId: slot.entrantId ?? null,
    })),
  });
}

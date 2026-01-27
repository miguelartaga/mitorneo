import { prisma } from "@/lib/prisma";
import { getServerSession } from "@/lib/auth";
import { canManageTournament } from "@/lib/permissions";
import { NextResponse } from "next/server";
import {
  buildGroupStandings,
  collectOrderedGroupQualifiers,
  GroupPointsConfig,
  normalizeGroupName,
  normalizeTiebreakerOrder,
  orderRegistrations,
} from "@/lib/playoff-utils";
import { syncRoundOneMatches } from "@/lib/playoff-match-utils";

const resolveId = (request: Request, resolvedParams?: { id?: string }) => {
  if (resolvedParams?.id) return resolvedParams.id;
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 4] : undefined;
};

const parseSlotBody = (value: unknown) => {
  if (!value || typeof value !== "object") return null;
  const categoryId = (value as { categoryId?: unknown }).categoryId;
  const position = Number((value as { position?: unknown }).position);
  const entrantId = (value as { entrantId?: unknown }).entrantId;
  const normalizedEntrant =
    typeof entrantId === "string" ? entrantId.trim() : null;
  return {
    categoryId: typeof categoryId === "string" ? categoryId : null,
    position: Number.isFinite(position) ? position : null,
    entrantId:
      normalizedEntrant && normalizedEntrant !== "__BYE__"
        ? normalizedEntrant
        : null,
  };
};

const buildGroupPointsConfig = (record: GroupPointsConfig | null) => ({
  winPoints: record?.winPoints ?? 0,
  winWithoutGameLossPoints: record?.winWithoutGameLossPoints ?? 0,
  lossPoints: record?.lossPoints ?? 0,
  lossWithGameWinPoints: record?.lossWithGameWinPoints ?? 0,
  tiebreakerOrder: normalizeTiebreakerOrder(record?.tiebreakerOrder),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
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
    select: { id: true, ownerId: true, status: true },
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

  const body = await request.json().catch(() => null);
  const payload = parseSlotBody(body);
  if (!payload?.categoryId || !payload.position) {
    return NextResponse.json(
      { error: "Datos invalidos para asignar el slot" },
      { status: 400 }
    );
  }
  const categoryId = payload.categoryId;
  const position = payload.position;
  const entrantId = payload.entrantId ?? null;

  const category = await prisma.tournamentCategory.findUnique({
    where: { tournamentId_categoryId: { tournamentId, categoryId } },
    select: {
      drawType: true,
      playoffStatus: true,
      groupQualifiers: true,
    },
  });

  if (!category) {
    return NextResponse.json(
      { error: "Categoria no habilitada para playoffs" },
      { status: 404 }
    );
  }

  if (
    category.drawType !== "PLAYOFF" &&
    category.drawType !== "GROUPS_PLAYOFF"
  ) {
    return NextResponse.json(
      { error: "Categoria no soporta llaves" },
      { status: 400 }
    );
  }

  if (category.playoffStatus !== "DRAFT") {
    return NextResponse.json(
      { error: "Las llaves estan bloqueadas" },
      { status: 409 }
    );
  }

  const registrations = await prisma.tournamentRegistration.findMany({
    where: { tournamentId, categoryId },
    select: {
      id: true,
      groupName: true,
      seed: true,
      rankingNumber: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const groupPointsRecord = await prisma.tournamentGroupPoints.findUnique({
    where: { tournamentId },
  });
  const groupPoints = buildGroupPointsConfig(groupPointsRecord);

  let qualifiedIds: string[] = [];

  if (category.drawType === "GROUPS_PLAYOFF") {
    const groupMatches = await prisma.tournamentMatch.findMany({
      where: { tournamentId, categoryId, stage: "GROUP" },
      select: {
        groupName: true,
        teamAId: true,
        teamBId: true,
        games: true,
        winnerSide: true,
        outcomeType: true,
        outcomeSide: true,
      },
    });
    const qualifiers = await prisma.tournamentGroupQualifier.findMany({
      where: { tournamentId, categoryId },
      select: { groupName: true, qualifiers: true },
    });
    const qualifiersByGroup = new Map<string, number>();
    qualifiers.forEach((entry) => {
      qualifiersByGroup.set(normalizeGroupName(entry.groupName), entry.qualifiers);
    });
    const defaultQualifiers =
      typeof category.groupQualifiers === "number" && category.groupQualifiers > 0
        ? category.groupQualifiers
        : 2;
    const standings = buildGroupStandings(
      registrations.map((registration) => ({
        id: registration.id,
        groupName: registration.groupName,
        seed: registration.seed,
        rankingNumber: registration.rankingNumber,
        createdAt: registration.createdAt,
      })),
      groupMatches,
      groupPoints
    );
    const qualifiersList = collectOrderedGroupQualifiers(
      standings,
      qualifiersByGroup,
      defaultQualifiers,
      groupPoints
    );
    qualifiedIds = qualifiersList.map((entry) => entry.id);
  } else {
    qualifiedIds = orderRegistrations(
      registrations.map((registration) => ({
        id: registration.id,
        seed: registration.seed ?? null,
        rankingNumber: registration.rankingNumber ?? null,
        createdAt: registration.createdAt,
      }))
    ).map((entry) => entry.id);
  }

  if (entrantId && !qualifiedIds.includes(entrantId)) {
    return NextResponse.json(
      { error: "El participante no esta clasificado" },
      { status: 400 }
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const slot = await tx.playoffSlot.findFirst({
        where: { tournamentId, categoryId, position },
      });
      if (!slot) {
        throw new Error("slot-not-found");
      }
      if (entrantId === slot.entrantId) {
        return { updated: 0 };
      }
      const occupiedSlot =
        entrantId &&
        (await tx.playoffSlot.findFirst({
          where: { tournamentId, categoryId, entrantId },
        }));
      if (occupiedSlot && occupiedSlot.id !== slot.id) {
        await tx.playoffSlot.update({
          where: { id: occupiedSlot.id },
          data: { entrantId: null },
        });
      }

      await tx.playoffSlot.update({
        where: { id: slot.id },
        data: { entrantId: entrantId ?? null },
      });

      const updatedSlots = await tx.playoffSlot.findMany({
        where: { tournamentId, categoryId },
        orderBy: { position: "asc" },
        select: { entrantId: true },
      });

      const bracketSlots = updatedSlots.map((slotEntry) =>
        slotEntry.entrantId ?? null
      );

      await syncRoundOneMatches({
        tx,
        tournamentId,
        categoryId,
        bracketSlots,
      });

      return { updated: 1 };
    });

    if (result.updated === 0) {
      return NextResponse.json({ updated: 0 });
    }

    return NextResponse.json({ updated: 1 });
  } catch (error) {
    const detail =
      error instanceof Error && error.message === "slot-not-found"
        ? "slot-not-found"
        : undefined;
    if (detail === "slot-not-found") {
      return NextResponse.json({ error: "Slot no encontrado" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "No se pudo actualizar el slot" },
      { status: 500 }
    );
  }
}

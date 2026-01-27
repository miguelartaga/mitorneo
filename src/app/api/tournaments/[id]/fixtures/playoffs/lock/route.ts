import { prisma } from "@/lib/prisma";
import { getServerSession } from "@/lib/auth";
import { canManageTournament } from "@/lib/permissions";
import { NextResponse } from "next/server";
import { syncRoundOneMatches } from "@/lib/playoff-match-utils";

const resolveId = (request: Request, resolvedParams?: { id?: string }) => {
  if (resolvedParams?.id) return resolvedParams.id;
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 4] : undefined;
};

export async function POST(
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

  const body = await request.json().catch(() => ({}));
  const categoryId =
    typeof body?.categoryId === "string" && body.categoryId.trim().length > 0
      ? body.categoryId.trim()
      : null;

  const categories = await prisma.tournamentCategory.findMany({
    where: {
      tournamentId,
      drawType: { in: ["PLAYOFF", "GROUPS_PLAYOFF"] },
      ...(categoryId ? { categoryId } : {}),
    },
    select: {
      categoryId: true,
      playoffStatus: true,
    },
  });

  if (categories.length === 0) {
    return NextResponse.json(
      { error: "No hay categorias para bloquear" },
      { status: 400 }
    );
  }

  const draftCategories = categories.filter(
    (category) => category.playoffStatus === "DRAFT"
  );

  if (draftCategories.length === 0) {
    return NextResponse.json(
      { error: "Las llaves ya estan bloqueadas" },
      { status: 400 }
    );
  }

  const lockedCategories: string[] = [];

  try {
    for (const category of draftCategories) {
      await prisma.$transaction(async (tx) => {
        const slots = await tx.playoffSlot.findMany({
          where: { tournamentId, categoryId: category.categoryId },
          orderBy: { position: "asc" },
          select: { entrantId: true },
        });

        if (slots.length === 0) {
          throw new Error("slots-required");
        }

        const entrants = slots
          .map((slotEntry) => slotEntry.entrantId)
          .filter((value): value is string => Boolean(value));

        if (entrants.length < 2) {
          throw new Error("not-enough-entrants");
        }

        const uniqueEntrants = new Set(entrants);
        if (uniqueEntrants.size !== entrants.length) {
          throw new Error("duplicate-entrant");
        }

        await tx.playoffSlot.updateMany({
          where: { tournamentId, categoryId: category.categoryId },
          data: { locked: true },
        });

        await syncRoundOneMatches({
          tx,
          tournamentId,
          categoryId: category.categoryId,
          bracketSlots: slots.map((slotEntry) => slotEntry.entrantId ?? null),
        });

        await tx.tournamentCategory.update({
          where: {
            tournamentId_categoryId: {
              tournamentId,
              categoryId: category.categoryId,
            },
          },
          data: {
            playoffStatus: "LOCKED",
          },
        });
      });
      lockedCategories.push(category.categoryId);
    }
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "lock-failed";
    let message = "No se pudo bloquear el bracket";
    let status = 500;
    if (detail === "slots-required") {
      message = "No hay slots disponibles para bloquear";
      status = 400;
    } else if (detail === "not-enough-entrants") {
      message = "Se necesitan al menos dos participantes para bloquear";
      status = 400;
    } else if (detail === "duplicate-entrant") {
      message = "Hay participantes duplicados en los slots";
      status = 400;
    }
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({
    locked: lockedCategories.length,
    categories: lockedCategories,
  });
}

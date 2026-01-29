import { prisma } from "@/lib/prisma";
import { getServerSession } from "@/lib/auth";
import { canManageTournament } from "@/lib/permissions";
import { NextResponse } from "next/server";

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

  if (!categoryId) {
    return NextResponse.json(
      { error: "Categoria requerida para desbloquear" },
      { status: 400 }
    );
  }

  const category = await prisma.tournamentCategory.findFirst({
    where: {
      tournamentId,
      categoryId,
      drawType: { in: ["PLAYOFF", "GROUPS_PLAYOFF"] },
    },
    select: { categoryId: true, playoffStatus: true },
  });

  if (!category) {
    return NextResponse.json({ error: "Categoria no encontrada" }, { status: 404 });
  }

  if (category.playoffStatus === "PUBLISHED") {
    return NextResponse.json(
      { error: "Primero oculta las llaves publicadas" },
      { status: 409 }
    );
  }

  if (category.playoffStatus !== "LOCKED") {
    return NextResponse.json(
      { error: "La llave ya esta en borrador" },
      { status: 400 }
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.playoffSlot.updateMany({
      where: { tournamentId, categoryId },
      data: { locked: false },
    });

    await tx.tournamentCategory.update({
      where: {
        tournamentId_categoryId: {
          tournamentId,
          categoryId,
        },
      },
      data: { playoffStatus: "DRAFT" },
    });
  });

  return NextResponse.json({ unlocked: true, categoryId });
}

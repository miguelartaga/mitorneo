import { prisma } from "@/lib/prisma";
import { getServerSession } from "@/lib/auth";
import { canManageTournament } from "@/lib/permissions";
import { NextResponse } from "next/server";

const resolveIds = (request: Request, resolvedParams?: { id?: string; categoryId?: string }) => {
  if (resolvedParams?.id && resolvedParams?.categoryId) {
    return { tournamentId: resolvedParams.id, categoryId: resolvedParams.categoryId };
  }
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const categoryIndex = parts.indexOf("categories");
  const tournamentId = categoryIndex > 1 ? parts[categoryIndex - 1] : undefined;
  const categoryId = categoryIndex >= 0 ? parts[categoryIndex + 1] : undefined;
  return { tournamentId, categoryId };
};

const parseBoolean = (value: unknown) => {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return null;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; categoryId: string }> }
) {
  const resolvedParams = await params;
  const session = await getServerSession();
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "TOURNAMENT_ADMIN")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { tournamentId, categoryId } = resolveIds(request, resolvedParams);
  if (!tournamentId || !categoryId) {
    return NextResponse.json({ error: "Categoria no encontrada" }, { status: 404 });
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
  const parsed = parseBoolean((body as { hasBronzeMatch?: unknown }).hasBronzeMatch);
  if (parsed === null) {
    return NextResponse.json(
      { error: "Valor invalido para partido por 3er lugar" },
      { status: 400 }
    );
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const category = await tx.tournamentCategory.update({
        where: {
          tournamentId_categoryId: { tournamentId, categoryId },
        },
        data: { hasBronzeMatch: parsed },
        select: { categoryId: true, hasBronzeMatch: true },
      });

      if (!parsed) {
        await tx.tournamentMatch.deleteMany({
          where: {
            tournamentId,
            categoryId,
            stage: "PLAYOFF",
            isBronzeMatch: true,
          },
        });
      }

      return category;
    });
    return NextResponse.json({ category: updated });
  } catch {
    return NextResponse.json({ error: "No se pudo actualizar la categoria" }, { status: 400 });
  }
}

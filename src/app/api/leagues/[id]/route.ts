import { prisma } from "@/lib/prisma";
import { getServerSession } from "@/lib/auth";
import { canManageLeague } from "@/lib/permissions";
import { NextResponse } from "next/server";

const resolveId = (request: Request, resolvedParams?: { id?: string }) => {
  if (resolvedParams?.id) return resolvedParams.id;
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : undefined;
};

const normalizeOptionalText = (value: unknown) => {
  if (value === undefined) return { provided: false };
  if (value === null) return { provided: true, value: null as string | null };
  if (typeof value !== "string") return { provided: true, invalid: true };
  const trimmed = value.trim();
  return { provided: true, value: trimmed.length > 0 ? trimmed : null };
};

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

  const leagueId = resolveId(request, resolvedParams);
  if (!leagueId) {
    return NextResponse.json({ error: "Liga no encontrada" }, { status: 404 });
  }

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { ownerId: true },
  });

  if (!league) {
    return NextResponse.json({ error: "Liga no encontrada" }, { status: 404 });
  }

  const canManage = await canManageLeague(session.user, leagueId, league.ownerId);
  if (!canManage) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { name } = body as { name?: unknown };
  const sportId = (body as { sportId?: unknown }).sportId;
  const description = normalizeOptionalText((body as { description?: unknown }).description);
  const photoUrl = normalizeOptionalText((body as { photoUrl?: unknown }).photoUrl);

  const data: {
    name?: string;
    description?: string | null;
    photoUrl?: string | null;
    sportId?: string;
  } = {};

  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
    }
    data.name = name.trim();
  }

  if (description.provided) {
    if ((description as { invalid?: boolean }).invalid) {
      return NextResponse.json({ error: "Descripcion invalida" }, { status: 400 });
    }
    data.description = (description as { value?: string | null }).value ?? null;
  }

  if (photoUrl.provided) {
    if ((photoUrl as { invalid?: boolean }).invalid) {
      return NextResponse.json({ error: "Foto invalida" }, { status: 400 });
    }
    data.photoUrl = (photoUrl as { value?: string | null }).value ?? null;
  }

  if (sportId !== undefined) {
    if (typeof sportId !== "string" || !sportId.trim()) {
      return NextResponse.json({ error: "Deporte requerido" }, { status: 400 });
    }
    const sport = await prisma.sport.findUnique({
      where: { id: sportId.trim() },
      select: { id: true },
    });
    if (!sport) {
      return NextResponse.json({ error: "Deporte no encontrado" }, { status: 404 });
    }
    data.sportId = sport.id;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Sin cambios" }, { status: 400 });
  }

  try {
    const updated = await prisma.league.update({
      where: { id: leagueId },
      data,
    });
    return NextResponse.json({ league: updated });
  } catch (error: unknown) {
    const detail =
      process.env.NODE_ENV !== "production" && error instanceof Error
        ? error.message
        : undefined;
    const message =
      error instanceof Error && error.message.includes("Unique constraint")
        ? "Ya existe una liga con ese nombre"
        : "No se pudo actualizar la liga";
    return NextResponse.json(
      detail ? { error: message, detail } : { error: message },
      { status: 400 }
    );
  }
}

export async function DELETE(
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

  const leagueId = resolveId(request, resolvedParams);
  if (!leagueId) {
    return NextResponse.json({ error: "Liga no encontrada" }, { status: 404 });
  }

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { ownerId: true },
  });

  if (!league) {
    return NextResponse.json({ error: "Liga no encontrada" }, { status: 404 });
  }

  const canManage = await canManageLeague(session.user, leagueId, league.ownerId);
  if (!canManage) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  await prisma.league.delete({ where: { id: leagueId } });
  return NextResponse.json({ ok: true });
}

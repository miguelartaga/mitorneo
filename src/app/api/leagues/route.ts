import { prisma } from "@/lib/prisma";
import { getServerSession } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getServerSession();
  if (
    !session?.user ||
    (session.user.role !== "ADMIN" && session.user.role !== "TOURNAMENT_ADMIN")
  ) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const includePermissions =
    session.user.role === "ADMIN"
      ? {}
      : {
          permissions: {
            where: { userId: session.user.id },
            select: { userId: true },
          },
        };

  const leagues = await prisma.league.findMany({
    where:
      session.user.role === "ADMIN"
        ? undefined
        : {
            OR: [
              { ownerId: session.user.id },
              { permissions: { some: { userId: session.user.id } } },
            ],
          },
    orderBy: { name: "asc" },
    include: {
      sport: { select: { id: true, name: true } },
      seasons: {
        orderBy: { startDate: "desc" },
      },
      ...includePermissions,
    },
  });

  const formatted = leagues.map((league) => ({
    ...league,
    canEdit:
      session.user.role === "ADMIN" ||
      league.ownerId === session.user.id ||
      (Array.isArray((league as { permissions?: unknown[] }).permissions) &&
        (league as { permissions?: unknown[] }).permissions!.length > 0),
  }));

  return NextResponse.json({ leagues: formatted });
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "TOURNAMENT_ADMIN")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { name, description, photoUrl, sportId } = body as {
    name?: string;
    description?: string;
    photoUrl?: string;
    sportId?: string;
  };

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
  }
  if (!sportId || typeof sportId !== "string" || !sportId.trim()) {
    return NextResponse.json({ error: "Deporte requerido" }, { status: 400 });
  }

  const sport = await prisma.sport.findUnique({
    where: { id: sportId.trim() },
    select: { id: true },
  });
  if (!sport) {
    return NextResponse.json({ error: "Deporte no encontrado" }, { status: 404 });
  }

  try {
    let owner = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true },
    });
    if (!owner && session.user.email) {
      owner = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      });
    }
    if (!owner) {
      return NextResponse.json(
        {
          error:
            "Usuario no encontrado. Vuelve a iniciar sesion o registra la cuenta.",
        },
        { status: 400 }
      );
    }

    const league = await prisma.league.create({
      data: {
        name: name.trim(),
        description: description ? description.trim() : null,
        photoUrl: photoUrl ? photoUrl.trim() : null,
        sportId: sport.id,
        ownerId: owner.id,
      },
    });
    return NextResponse.json({ league }, { status: 201 });
  } catch (error: unknown) {
    const detail =
      process.env.NODE_ENV !== "production" && error instanceof Error
        ? error.message
        : undefined;
    const message =
      error instanceof Error && error.message.includes("Unique constraint")
        ? "Ya existe una liga con ese nombre"
        : "No se pudo crear la liga";
    return NextResponse.json(
      detail ? { error: message, detail } : { error: message },
      { status: 400 }
    );
  }
}

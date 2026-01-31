import { prisma } from "@/lib/prisma";
import { getServerSession } from "@/lib/auth";
import { canManageTournament } from "@/lib/permissions";
import { NextResponse } from "next/server";

const resolveId = (request: Request, resolvedParams?: { id?: string }) => {
  if (resolvedParams?.id) return resolvedParams.id;
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 2] : undefined;
};

const normalizeLiveStreams = (value: unknown) => {
  const list = Array.isArray(value) ? value : [];
  const streams = list
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => {
      const title =
        typeof (entry as { title?: unknown }).title === "string"
          ? (entry as { title: string }).title.trim()
          : "";
      const url =
        typeof (entry as { url?: unknown }).url === "string"
          ? (entry as { url: string }).url.trim()
          : "";
      return { title, url };
    })
    .filter((entry) => entry.url);
  return streams;
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

  const canManageTournamentAccess = await canManageTournament(
    session.user,
    tournamentId,
    tournament.ownerId
  );
  if (!canManageTournamentAccess) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  if (tournament.status === "FINISHED") {
    return NextResponse.json(
      { error: "El torneo ya esta finalizado" },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const liveStreams = normalizeLiveStreams(body?.liveStreams);

  const updated = await prisma.tournament.update({
    where: { id: tournamentId },
    data: { liveStreams },
    select: { id: true, liveStreams: true },
  });

  return NextResponse.json({ tournament: updated });
}

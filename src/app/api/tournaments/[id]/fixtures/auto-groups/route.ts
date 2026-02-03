import { prisma } from "@/lib/prisma";
import { getServerSession } from "@/lib/auth";
import { canManageTournament } from "@/lib/permissions";
import { NextResponse } from "next/server";

const resolveId = (request: Request, resolvedParams?: { id?: string }) => {
  if (resolvedParams?.id) return resolvedParams.id;
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 3] : undefined;
};

const buildGroupLabel = (index: number) => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (index < alphabet.length) return alphabet[index];
  const first = Math.floor(index / alphabet.length) - 1;
  const second = index % alphabet.length;
  return `${alphabet[first]}${alphabet[second]}`;
};

const buildGroupLabels = (count: number) =>
  Array.from({ length: count }, (_, index) => buildGroupLabel(index));

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
    select: { id: true, ownerId: true, status: true, paymentRate: true, paymentPaidAmount: true },
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
    typeof body.categoryId === "string" && body.categoryId.trim()
      ? body.categoryId.trim()
      : null;

  if (!categoryId) {
    return NextResponse.json({ error: "Categoria requerida" }, { status: 400 });
  }

  const tournamentCategory = await prisma.tournamentCategory.findUnique({
    where: { tournamentId_categoryId: { tournamentId, categoryId } },
    select: { drawType: true, groupMinSize: true, groupMaxSize: true },
  });

  if (!tournamentCategory) {
    return NextResponse.json({ error: "Categoria no encontrada" }, { status: 404 });
  }

  if (
    tournamentCategory.drawType !== "ROUND_ROBIN" &&
    tournamentCategory.drawType !== "GROUPS_PLAYOFF"
  ) {
    return NextResponse.json(
      { error: "La categoria no usa grupos" },
      { status: 400 }
    );
  }

  const paymentRegistrations = await prisma.tournamentRegistration.findMany({
    where: { tournamentId },
    select: { playerId: true, partnerId: true, partnerTwoId: true },
  });
  const playersCount = paymentRegistrations.reduce(
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

  const registrations = await prisma.tournamentRegistration.findMany({
    where: { tournamentId, categoryId },
    select: { id: true, seed: true, rankingNumber: true, createdAt: true },
  });

  if (registrations.length === 0) {
    return NextResponse.json({ error: "No hay inscritos" }, { status: 400 });
  }

  const hasRanking = registrations.some(
    (registration) =>
      registration.seed !== null || registration.rankingNumber !== null
  );

  const ordered = [...registrations].sort((a, b) => {
    if (hasRanking) {
      const seedA =
        a.seed ?? a.rankingNumber ?? Number.MAX_SAFE_INTEGER;
      const seedB =
        b.seed ?? b.rankingNumber ?? Number.MAX_SAFE_INTEGER;
      if (seedA !== seedB) return seedA - seedB;
    }
    const timeA = a.createdAt.getTime();
    const timeB = b.createdAt.getTime();
    if (timeA !== timeB) return timeA - timeB;
    return a.id.localeCompare(b.id);
  });

  const minSize =
    typeof tournamentCategory.groupMinSize === "number" &&
    tournamentCategory.groupMinSize >= 2
      ? tournamentCategory.groupMinSize
      : 3;
  const maxSize =
    typeof tournamentCategory.groupMaxSize === "number" &&
    tournamentCategory.groupMaxSize >= minSize
      ? tournamentCategory.groupMaxSize
      : minSize;

  let groupCount = Math.max(1, Math.floor(ordered.length / minSize));
  if (Math.ceil(ordered.length / groupCount) > maxSize) {
    groupCount = Math.max(1, Math.ceil(ordered.length / maxSize));
  }
  const groupLabels = buildGroupLabels(groupCount);

  const assignments = ordered.map((registration, index) => ({
    registrationId: registration.id,
    groupName: groupLabels[index % groupLabels.length],
  }));

  await prisma.$transaction(
    assignments.map((assignment) =>
      prisma.tournamentRegistration.update({
        where: { id: assignment.registrationId },
        data: { groupName: assignment.groupName },
      })
    )
  );

  const groupCounts = assignments.reduce<Record<string, number>>((acc, item) => {
    acc[item.groupName] = (acc[item.groupName] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    groupCount,
    groups: groupCounts,
    assigned: assignments.length,
  });
}

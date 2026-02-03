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

const normalizeGroupName = (value: string | null) => {
  const trimmed = value?.trim() ?? "";
  return trimmed.length ? trimmed : "A";
};

const orderRegistrations = (
  items: { id: string; seed: number | null; createdAt: Date }[]
) => {
  return [...items].sort((a, b) => {
    const seedA = a.seed ?? Number.MAX_SAFE_INTEGER;
    const seedB = b.seed ?? Number.MAX_SAFE_INTEGER;
    if (seedA !== seedB) return seedA - seedB;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
};

const buildRoundRobinRounds = (ids: string[]) => {
  if (ids.length < 2) return [];
  if (ids.length === 2) {
    return [[{ teamAId: ids[0], teamBId: ids[1] }]];
  }
  if (ids.length === 4) {
    const [a, b, c, d] = ids;
    return [
      [
        { teamAId: a, teamBId: c },
        { teamAId: d, teamBId: b },
      ],
      [
        { teamAId: a, teamBId: b },
        { teamAId: c, teamBId: d },
      ],
      [
        { teamAId: a, teamBId: d },
        { teamAId: b, teamBId: c },
      ],
    ];
  }

  const entries = [...ids];
  if (entries.length % 2 !== 0) {
    entries.push("BYE");
  }

  const rounds: { teamAId: string; teamBId: string }[][] = [];
  const totalRounds = entries.length - 1;
  let rotation = [...entries];

  for (let round = 0; round < totalRounds; round += 1) {
    const pairs: { teamAId: string; teamBId: string }[] = [];
    const half = rotation.length / 2;
    for (let index = 0; index < half; index += 1) {
      const teamAId = rotation[index];
      const teamBId = rotation[rotation.length - 1 - index];
      if (teamAId === "BYE" || teamBId === "BYE") continue;
      pairs.push({ teamAId, teamBId });
    }
    rounds.push(pairs);

    const fixed = rotation[0];
    const rest = rotation.slice(1);
    rest.unshift(rest.pop() as string);
    rotation = [fixed, ...rest];
  }

  return rounds;
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
  const regenerate = Boolean(body.regenerate);

  if (!categoryId) {
    return NextResponse.json({ error: "Categoria requerida" }, { status: 400 });
  }

  const tournamentCategory = await prisma.tournamentCategory.findUnique({
    where: { tournamentId_categoryId: { tournamentId, categoryId } },
    select: { drawType: true },
  });

  if (!tournamentCategory) {
    return NextResponse.json({ error: "Categoria no encontrada" }, { status: 404 });
  }

  if (
    tournamentCategory.drawType !== "ROUND_ROBIN" &&
    tournamentCategory.drawType !== "GROUPS_PLAYOFF"
  ) {
    return NextResponse.json(
      { error: "Solo categorias con grupos pueden generar fixture" },
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
    select: { id: true, groupName: true, seed: true, createdAt: true },
  });

  if (registrations.length < 2) {
    return NextResponse.json(
      { error: "No hay suficientes inscritos para generar fixture" },
      { status: 400 }
    );
  }

  const registrationsWithGroup = registrations.map((registration) => ({
    id: registration.id,
    seed: registration.seed,
    createdAt: registration.createdAt,
    groupName: normalizeGroupName(registration.groupName),
  }));

  const updates = registrationsWithGroup.filter(
    (entry) =>
      registrations.find((reg) => reg.id === entry.id)?.groupName !== entry.groupName
  );

  if (updates.length > 0) {
    await prisma.$transaction(
      updates.map((entry) =>
        prisma.tournamentRegistration.update({
          where: { id: entry.id },
          data: { groupName: entry.groupName },
        })
      )
    );
  }

  if (regenerate) {
    await prisma.tournamentMatch.deleteMany({
      where: {
        tournamentId,
        categoryId,
        stage: "GROUP",
      },
    });
  }

  const existingMatches = await prisma.tournamentMatch.findMany({
    where: {
      tournamentId,
      categoryId,
      stage: "GROUP",
    },
    select: { id: true, teamAId: true, teamBId: true, groupName: true },
  });

  const existingKeys = new Set(
    existingMatches.map((match) => {
      const ids = [match.teamAId, match.teamBId].sort().join("|");
      const group = match.groupName ?? "";
      return `${group}:${ids}`;
    })
  );

  const matchesToCreate: {
    tournamentId: string;
    categoryId: string;
    groupName: string;
    roundNumber: number;
    teamAId: string;
    teamBId: string;
    stage: "GROUP";
  }[] = [];

  const groups = registrationsWithGroup.reduce<
    Record<string, { id: string; seed: number | null; createdAt: Date }[]>
  >((acc, registration) => {
    if (!acc[registration.groupName]) {
      acc[registration.groupName] = [];
    }
    acc[registration.groupName].push({
      id: registration.id,
      seed: registration.seed ?? null,
      createdAt: registration.createdAt,
    });
    return acc;
  }, {});

  for (const [groupName, items] of Object.entries(groups)) {
    const orderedIds = orderRegistrations(items).map((item) => item.id);
    const rounds = buildRoundRobinRounds(orderedIds);
    rounds.forEach((round, index) => {
      const roundNumber = index + 1;
      round.forEach((match) => {
        const key = `${groupName}:${[match.teamAId, match.teamBId]
          .sort()
          .join("|")}`;
        if (existingKeys.has(key)) return;
        matchesToCreate.push({
          tournamentId,
          categoryId,
          groupName,
          roundNumber,
          teamAId: match.teamAId,
          teamBId: match.teamBId,
          stage: "GROUP",
        });
      });
    });
  }

  if (matchesToCreate.length > 0) {
    await prisma.tournamentMatch.createMany({ data: matchesToCreate });
  }

  return NextResponse.json({ created: matchesToCreate.length });
}

import { prisma } from "@/lib/prisma";
import { getServerSession } from "@/lib/auth";
import { canManageTournament } from "@/lib/permissions";
import { NextResponse } from "next/server";

const parsePriceValue = (value: unknown) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseOptionalPriceValue = (value: unknown) => {
  if (value === undefined) return { provided: false as const };
  if (value === null) return { provided: true as const, value: null as number | null };
  if (typeof value === "string" && value.trim().length === 0) {
    return { provided: true as const, value: null as number | null };
  }
  const parsed = parsePriceValue(value);
  if (parsed === null) {
    return { provided: true as const, value: undefined };
  }
  return { provided: true as const, value: parsed };
};

const parseSeedValue = (value: unknown) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isInteger(value) ? value : null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) ? parsed : null;
};

const getTeamConfig = (category: {
  modality?: string | null;
  sport?: { name?: string | null } | null;
}) => {
  const sportName = category.sport?.name?.toLowerCase() ?? "";
  if (sportName.includes("fronton")) {
    return { minPlayers: 2, maxPlayers: 3, label: "equipo" };
  }
  if (category.modality === "DOUBLES") {
    return { minPlayers: 2, maxPlayers: 2, label: "equipo" };
  }
  return { minPlayers: 1, maxPlayers: 1, label: "jugador" };
};

const parseOptionalId = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const normalizeTeamIds = (
  playerId: string,
  partnerId?: string | null,
  partnerTwoId?: string | null
) =>
  [playerId, partnerId ?? null, partnerTwoId ?? null]
    .filter((value): value is string => Boolean(value))
    .sort();

const isSameTeam = (first: string[], second: string[]) => {
  if (first.length !== second.length) return false;
  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) return false;
  }
  return true;
};

const hasMemberConflict = (
  registrations: { playerId: string; partnerId: string | null; partnerTwoId: string | null }[],
  teamIds: string[]
) =>
  registrations.some(
    (registration) =>
      teamIds.includes(registration.playerId) ||
      (registration.partnerId && teamIds.includes(registration.partnerId)) ||
      (registration.partnerTwoId && teamIds.includes(registration.partnerTwoId))
  );

const registrationInclude = {
  category: {
    select: {
      id: true,
      name: true,
      abbreviation: true,
      modality: true,
      gender: true,
      sport: { select: { id: true, name: true } },
    },
  },
  player: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      documentType: true,
      documentNumber: true,
    },
  },
  partner: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      documentType: true,
      documentNumber: true,
    },
  },
  partnerTwo: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      documentType: true,
      documentNumber: true,
    },
  },
};

const resolveIds = (
  request: Request,
  resolvedParams?: { id?: string; registrationId?: string }
) => {
  if (resolvedParams?.id && resolvedParams?.registrationId) {
    return { tournamentId: resolvedParams.id, registrationId: resolvedParams.registrationId };
  }

  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const registrationsIndex = parts.indexOf("registrations");

  return {
    tournamentId:
      resolvedParams?.id ??
      (registrationsIndex > 0 ? parts[registrationsIndex - 1] : undefined),
    registrationId:
      resolvedParams?.registrationId ??
      (registrationsIndex >= 0 ? parts[registrationsIndex + 1] : undefined),
  };
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; registrationId: string }> }
) {
  const resolvedParams = await params;
  const session = await getServerSession();
  if (
    !session?.user ||
    (session.user.role !== "ADMIN" && session.user.role !== "TOURNAMENT_ADMIN")
  ) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { tournamentId, registrationId } = resolveIds(request, resolvedParams);

  if (!tournamentId || !registrationId) {
    return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
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
      { error: "El torneo ya esta finalizado y no permite cambios" },
      { status: 400 }
    );
  }

  const existingRegistration = await prisma.tournamentRegistration.findUnique({
    where: { id: registrationId },
    select: { id: true, tournamentId: true, seed: true },
  });

  if (!existingRegistration || existingRegistration.tournamentId !== tournamentId) {
    return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const {
    categoryId,
    playerId,
    partnerId,
    partnerTwoId,
    teamName,
    amountPaid,
    amountDue,
    seed,
  } = body as {
    categoryId?: unknown;
    playerId?: unknown;
    partnerId?: unknown;
    partnerTwoId?: unknown;
    teamName?: unknown;
    amountPaid?: unknown;
    amountDue?: unknown;
    seed?: unknown;
  };

  if (!categoryId || typeof categoryId !== "string") {
    return NextResponse.json({ error: "Categoria requerida" }, { status: 400 });
  }
  if (!playerId || typeof playerId !== "string") {
    return NextResponse.json({ error: "Jugador requerido" }, { status: 400 });
  }

  const tournamentCategory = await prisma.tournamentCategory.findUnique({
    where: {
      tournamentId_categoryId: { tournamentId, categoryId: categoryId.trim() },
    },
    include: { category: { select: { modality: true, sport: { select: { name: true } } } } },
  });

  if (!tournamentCategory) {
    return NextResponse.json(
      { error: "Categoria no registrada en el torneo" },
      { status: 400 }
    );
  }

  const teamConfig = getTeamConfig(tournamentCategory.category);
  const isFronton =
    (tournamentCategory.category.sport?.name ?? "")
      .toLowerCase()
      .includes("fronton");
  const teamNameValue =
    typeof teamName === "string" ? teamName.trim() : "";
  if (isFronton && !teamNameValue) {
    return NextResponse.json(
      { error: "Nombre de equipo requerido" },
      { status: 400 }
    );
  }
  const playerIdValue = playerId.trim();
  const partnerIdValue = parseOptionalId(partnerId);
  const partnerTwoIdValue = parseOptionalId(partnerTwoId);
  const teamIds = normalizeTeamIds(
    playerIdValue,
    partnerIdValue,
    partnerTwoIdValue
  );

  if (teamConfig.maxPlayers === 1 && (partnerIdValue || partnerTwoIdValue)) {
    return NextResponse.json(
      { error: "La categoria no requiere equipo" },
      { status: 400 }
    );
  }

  if (teamConfig.maxPlayers === 2) {
    if (!partnerIdValue) {
      return NextResponse.json(
        { error: "Debes seleccionar el companero del equipo" },
        { status: 400 }
      );
    }
    if (partnerTwoIdValue) {
      return NextResponse.json(
        { error: "La categoria solo permite 2 jugadores" },
        { status: 400 }
      );
    }
  }

  if (teamConfig.maxPlayers === 3) {
    if (!partnerIdValue) {
      return NextResponse.json(
        { error: "Debes seleccionar al segundo jugador" },
        { status: 400 }
      );
    }
  }

  if (teamIds.length < teamConfig.minPlayers) {
    return NextResponse.json(
      { error: "Faltan jugadores para esta categoria" },
      { status: 400 }
    );
  }

  if (teamIds.length !== new Set(teamIds).size) {
    return NextResponse.json(
      { error: "Los jugadores del equipo no pueden repetirse" },
      { status: 400 }
    );
  }

  const player = await prisma.player.findUnique({
    where: { id: playerIdValue },
    select: { id: true },
  });

  if (!player) {
    return NextResponse.json({ error: "Jugador no encontrado" }, { status: 404 });
  }

  if (partnerIdValue) {
    const partner = await prisma.player.findUnique({
      where: { id: partnerIdValue },
      select: { id: true },
    });
    if (!partner) {
      return NextResponse.json(
        { error: "Companero no encontrado" },
        { status: 404 }
      );
    }
  }

  if (partnerTwoIdValue) {
    const partnerTwo = await prisma.player.findUnique({
      where: { id: partnerTwoIdValue },
      select: { id: true },
    });
    if (!partnerTwo) {
      return NextResponse.json(
        { error: "Tercer jugador no encontrado" },
        { status: 404 }
      );
    }
  }

  const parsedAmount = parsePriceValue(amountPaid);
  if (parsedAmount === null || parsedAmount < 0) {
    return NextResponse.json({ error: "Monto pagado invalido" }, { status: 400 });
  }

  const amountDueResult = parseOptionalPriceValue(amountDue);
  if (amountDueResult.provided && amountDueResult.value === undefined) {
    return NextResponse.json({ error: "Monto a pagar invalido" }, { status: 400 });
  }

  let seedUpdate: number | null | undefined = undefined;
  if (seed !== undefined) {
    if (seed === null || (typeof seed === "string" && seed.trim().length === 0)) {
      seedUpdate = null;
    } else {
      const seedValue = parseSeedValue(seed);
      if (seedValue === null || seedValue < 1) {
        return NextResponse.json({ error: "Seed invalido" }, { status: 400 });
      }
      seedUpdate = seedValue;
    }
  }

  const existing = await prisma.tournamentRegistration.findMany({
    where: {
      tournamentId,
      categoryId: categoryId.trim(),
      id: { not: registrationId },
    },
    select: { id: true, playerId: true, partnerId: true, partnerTwoId: true },
  });

  const memberConflict = hasMemberConflict(existing, teamIds);
  if (memberConflict) {
    return NextResponse.json(
      {
        error: "Un jugador ya esta inscrito en esta categoria",
      },
      { status: 400 }
    );
  }

  const duplicate = existing.find((registration) =>
    isSameTeam(
      normalizeTeamIds(
        registration.playerId,
        registration.partnerId,
        registration.partnerTwoId
      ),
      teamIds
    )
  );

  if (duplicate) {
    return NextResponse.json(
      {
        error:
          teamIds.length > 1
            ? "Ese equipo ya esta inscrito en esa categoria"
            : "Ese jugador ya esta inscrito en esa categoria",
      },
      { status: 400 }
    );
  }

  const data = {
    categoryId: categoryId.trim(),
    playerId: playerIdValue,
    partnerId: partnerIdValue,
    partnerTwoId: partnerTwoIdValue,
    teamName: teamNameValue || null,
    amountPaid: parsedAmount.toFixed(2),
    ...(seedUpdate !== undefined ? { seed: seedUpdate } : {}),
    ...(amountDueResult.provided
      ? {
          amountDue:
            amountDueResult.value === null
              ? null
              : amountDueResult.value?.toFixed(2) ?? null,
        }
      : {}),
  };

  const registration = await prisma.tournamentRegistration.update({
    where: { id: registrationId },
    data,
    include: registrationInclude,
  });

  return NextResponse.json({ registration });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; registrationId: string }> }
) {
  const resolvedParams = await params;
  const session = await getServerSession();
  if (
    !session?.user ||
    (session.user.role !== "ADMIN" && session.user.role !== "TOURNAMENT_ADMIN")
  ) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { tournamentId, registrationId } = resolveIds(request, resolvedParams);

  if (!tournamentId || !registrationId) {
    return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
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
      { error: "El torneo ya esta finalizado y no permite cambios" },
      { status: 400 }
    );
  }

  const registration = await prisma.tournamentRegistration.findUnique({
    where: { id: registrationId },
    select: { id: true, tournamentId: true },
  });

  if (!registration || registration.tournamentId !== tournamentId) {
    return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
  }

  await prisma.tournamentRegistration.delete({ where: { id: registration.id } });
  return NextResponse.json({ ok: true });
}

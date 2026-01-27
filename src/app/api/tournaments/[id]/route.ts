import { prisma } from "@/lib/prisma";
import { getServerSession } from "@/lib/auth";
import { canManageLeague, canManageTournament } from "@/lib/permissions";
import { NextResponse } from "next/server";

type ClubInput = {
  name?: unknown;
  address?: unknown;
  courtsCount?: unknown;
};

type CategoryEntryInput = {
  categoryId?: unknown;
  price?: unknown;
  secondaryPrice?: unknown;
  siblingPrice?: unknown;
};

type SponsorEntryInput = {
  name?: unknown;
  imageUrl?: unknown;
  linkUrl?: unknown;
};

const parseDateOnly = (value: unknown) => {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
};

const toDateKey = (value: Date) => value.toISOString().split("T")[0];

const normalizePlayDates = (
  value: unknown,
  startKey: string,
  endKey: string | null
) => {
  const raw = Array.isArray(value) ? value : [];
  const dates: string[] = [];

  for (const entry of raw) {
    if (typeof entry !== "string") {
      return { error: "Fecha de juego invalida" };
    }
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const parsed = parseDateOnly(trimmed);
    if (!parsed) {
      return { error: "Fecha de juego invalida" };
    }
    const key = toDateKey(parsed);
    if (key < startKey || (endKey && key > endKey)) {
      return { error: "Las fechas de juego deben estar dentro del rango" };
    }
    dates.push(key);
  }

  return { dates: Array.from(new Set(dates)) };
};

const parseCourtsCount = (value: unknown) => {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return parsed;
};

const normalizeClubs = (value: unknown) => {
  const list = Array.isArray(value) ? (value as ClubInput[]) : [];
  const normalized: { name: string; address: string; courtsCount: number }[] = [];

  for (const club of list) {
    const name = typeof club.name === "string" ? club.name.trim() : "";
    const address = typeof club.address === "string" ? club.address.trim() : "";
    if (!name) continue;
    const courtsProvided =
      club.courtsCount !== undefined &&
      club.courtsCount !== null &&
      !(typeof club.courtsCount === "string" && club.courtsCount.trim() === "");
    const parsedCourts = parseCourtsCount(club.courtsCount);
    if (courtsProvided && parsedCourts === null) {
      return { error: "Cantidad de canchas invalida" };
    }
    normalized.push({
      name,
      address,
      courtsCount: parsedCourts ?? 1,
    });
  }

  return { clubs: normalized };
};

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

const normalizeCategoryEntries = (value: unknown) => {
  const list = Array.isArray(value) ? (value as CategoryEntryInput[]) : [];
  const entries = new Map<
    string,
    { price: string; secondaryPrice: string; siblingPrice: string }
  >();

  for (const entry of list) {
    if (!entry || typeof entry !== "object") {
      return { error: "Categorias invalidas" };
    }
    const categoryId =
      typeof entry.categoryId === "string" ? entry.categoryId.trim() : "";
    if (!categoryId) {
      return { error: "Categoria invalida" };
    }
    const parsedPrice = parsePriceValue(entry.price);
    if (parsedPrice === null) {
      return { error: "Precio de inscripcion invalido" };
    }
    if (parsedPrice < 0) {
      return { error: "El precio de inscripcion debe ser mayor o igual a 0" };
    }
    const secondaryProvided =
      entry.secondaryPrice !== undefined &&
      entry.secondaryPrice !== null &&
      !(typeof entry.secondaryPrice === "string" && entry.secondaryPrice.trim() === "");
    const parsedSecondary = parsePriceValue(entry.secondaryPrice);
    if (secondaryProvided && parsedSecondary === null) {
      return { error: "Precio segunda categoria invalido" };
    }
    const secondaryValue = secondaryProvided ? parsedSecondary : parsedPrice;
    if (secondaryValue === null || secondaryValue < 0) {
      return {
        error: "El precio segunda categoria debe ser mayor o igual a 0",
      };
    }
    const siblingProvided =
      entry.siblingPrice !== undefined &&
      entry.siblingPrice !== null &&
      !(typeof entry.siblingPrice === "string" && entry.siblingPrice.trim() === "");
    const parsedSibling = parsePriceValue(entry.siblingPrice);
    if (siblingProvided && parsedSibling === null) {
      return { error: "Precio hermano invalido" };
    }
    const siblingValue = siblingProvided ? parsedSibling : parsedPrice;
    if (siblingValue === null || siblingValue < 0) {
      return {
        error: "El precio hermano debe ser mayor o igual a 0",
      };
    }
    entries.set(categoryId, {
      price: parsedPrice.toFixed(2),
      secondaryPrice: secondaryValue.toFixed(2),
      siblingPrice: siblingValue.toFixed(2),
    });
  }

  return {
    entries: Array.from(entries).map(([categoryId, values]) => ({
      categoryId,
      price: values.price,
      secondaryPrice: values.secondaryPrice,
      siblingPrice: values.siblingPrice,
    })),
  };
};

const normalizeSponsorEntries = (value: unknown) => {
  const list = Array.isArray(value) ? (value as SponsorEntryInput[]) : [];
  const sponsors: {
    name: string | null;
    imageUrl: string;
    linkUrl: string | null;
    sortOrder: number;
  }[] = [];

  for (let index = 0; index < list.length; index += 1) {
    const entry = list[index];
    if (!entry || typeof entry !== "object") {
      return { error: "Auspiciadores invalidos" };
    }
    const imageUrl =
      typeof entry.imageUrl === "string" ? entry.imageUrl.trim() : "";
    if (!imageUrl) {
      return { error: "Imagen de auspiciador requerida" };
    }
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    const linkUrl = typeof entry.linkUrl === "string" ? entry.linkUrl.trim() : "";
    sponsors.push({
      name: name || null,
      imageUrl,
      linkUrl: linkUrl || null,
      sortOrder: index,
    });
  }

  return { sponsors };
};

const resolveId = (request: Request, resolvedParams?: { id?: string }) => {
  if (resolvedParams?.id) return resolvedParams.id;
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : undefined;
};

const tournamentInclude = {
  league: { select: { id: true, name: true } },
  clubs: true,
  sponsors: {
    orderBy: { sortOrder: "asc" },
  },
  categories: {
    include: {
      category: {
        select: {
          id: true,
          name: true,
          abbreviation: true,
          sport: { select: { id: true, name: true } },
        },
      },
    },
  },
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
  const {
    name,
    sportId,
    leagueId,
    address,
    clubs,
    rankingEnabled,
    startDate,
    endDate,
    registrationDeadline,
    rulesText,
    photoUrl,
    playDays,
    categoryEntries,
    sponsors,
  } = body as {
    name?: unknown;
    sportId?: unknown;
    leagueId?: unknown;
    address?: unknown;
    clubs?: unknown;
    rankingEnabled?: unknown;
    startDate?: unknown;
    endDate?: unknown;
    registrationDeadline?: unknown;
    rulesText?: unknown;
    photoUrl?: unknown;
    playDays?: unknown;
    categoryEntries?: unknown;
    sponsors?: unknown;
  };

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    return NextResponse.json({ error: "Nombre del torneo requerido" }, { status: 400 });
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

  const start = parseDateOnly(startDate);
  if (!start) {
    return NextResponse.json({ error: "Fecha de inicio requerida" }, { status: 400 });
  }

  const registration = parseDateOnly(registrationDeadline);
  if (!registration) {
    return NextResponse.json(
      { error: "Fecha de cierre de inscripcion requerida" },
      { status: 400 }
    );
  }

  let end: Date | null = null;
  if (endDate === null || endDate === "" || endDate === undefined) {
    end = null;
  } else {
    end = parseDateOnly(endDate);
    if (!end) {
      return NextResponse.json({ error: "Fecha de fin invalida" }, { status: 400 });
    }
    if (end < start) {
      return NextResponse.json(
        { error: "La fecha de fin debe ser mayor o igual a la fecha de inicio" },
        { status: 400 }
      );
    }
  }

  const rankingEnabledValue =
    typeof rankingEnabled === "boolean" ? rankingEnabled : true;

  const normalizedClubsResult = normalizeClubs(clubs);
  if (normalizedClubsResult.error) {
    return NextResponse.json(
      { error: normalizedClubsResult.error },
      { status: 400 }
    );
  }
  const normalizedClubs = normalizedClubsResult.clubs ?? [];
  if (normalizedClubs.length === 0) {
    return NextResponse.json(
      { error: "Debes agregar al menos un club" },
      { status: 400 }
    );
  }

  const hasInvalidClub = normalizedClubs.some(
    (club) => club.name.length < 2 || club.courtsCount < 1
  );
  if (hasInvalidClub) {
    return NextResponse.json(
      { error: "El nombre del club debe tener al menos 2 caracteres" },
      { status: 400 }
    );
  }

  const startKey = toDateKey(start);
  const endKey = end ? toDateKey(end) : null;
  const playDatesResult = normalizePlayDates(playDays, startKey, endKey);
  if (playDatesResult.error) {
    return NextResponse.json({ error: playDatesResult.error }, { status: 400 });
  }

  const normalizedDays = playDatesResult.dates ?? [];
  if (normalizedDays.length === 0) {
    return NextResponse.json(
      { error: "Selecciona al menos una fecha de juego" },
      { status: 400 }
    );
  }

  const categoryEntriesResult = normalizeCategoryEntries(categoryEntries);
  if (categoryEntriesResult.error) {
    return NextResponse.json({ error: categoryEntriesResult.error }, { status: 400 });
  }
  const normalizedCategoryEntries = categoryEntriesResult.entries ?? [];
  if (normalizedCategoryEntries.length === 0) {
    return NextResponse.json(
      { error: "Selecciona al menos una categoria" },
      { status: 400 }
    );
  }

  const existingTournamentCategories = await prisma.tournamentCategory.findMany({
    where: { tournamentId: tournament.id },
    select: {
      categoryId: true,
      drawType: true,
      groupMinSize: true,
      groupMaxSize: true,
      groupQualifiers: true,
      hasBronzeMatch: true,
    },
  });
  const tournamentCategoryById = new Map(
    existingTournamentCategories.map((entry) => [entry.categoryId, entry])
  );

  const existingCategories = await prisma.category.findMany({
    where: {
      id: { in: normalizedCategoryEntries.map((entry) => entry.categoryId) },
    },
    select: { id: true, sportId: true },
  });

  if (existingCategories.length !== normalizedCategoryEntries.length) {
    return NextResponse.json(
      { error: "Algunas categorias no existen" },
      { status: 400 }
    );
  }

  const hasMixedSports = existingCategories.some(
    (category) => category.sportId !== sport.id
  );
  if (hasMixedSports) {
    return NextResponse.json(
      { error: "Las categorias deben pertenecer al deporte seleccionado" },
      { status: 400 }
    );
  }

  const sponsorsResult = normalizeSponsorEntries(sponsors);
  if (sponsorsResult.error) {
    return NextResponse.json({ error: sponsorsResult.error }, { status: 400 });
  }
  const normalizedSponsors = sponsorsResult.sponsors ?? [];

  let leagueIdValue: string | null = null;

  if (rankingEnabledValue) {
    if (!leagueId || typeof leagueId !== "string") {
      return NextResponse.json({ error: "Liga requerida" }, { status: 400 });
    }

    const league = await prisma.league.findUnique({
      where: { id: leagueId.trim() },
      select: { id: true, ownerId: true },
    });

    if (!league) {
      return NextResponse.json({ error: "Liga no encontrada" }, { status: 404 });
    }

    const canManageLeagueAccess = await canManageLeague(
      session.user,
      league.id,
      league.ownerId
    );
    if (!canManageLeagueAccess) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    leagueIdValue = league.id;
  }

  const addressValue =
    typeof address === "string" && address.trim().length > 0
      ? address.trim()
      : null;
  const rulesValue =
    typeof rulesText === "string" && rulesText.trim().length > 0
      ? rulesText.trim()
      : null;
  const photoUrlValue =
    typeof photoUrl === "string" && photoUrl.trim().length > 0
      ? photoUrl.trim()
      : null;

  try {
    const updated = await prisma.tournament.update({
      where: { id: tournament.id },
      data: {
        name: name.trim(),
        sportId: sport.id,
        leagueId: leagueIdValue,
        address: addressValue,
        rankingEnabled: rankingEnabledValue,
        startDate: start,
        endDate: end,
        registrationDeadline: registration,
        rulesText: rulesValue,
        photoUrl: photoUrlValue,
        playDays: normalizedDays,
        clubs: {
          deleteMany: {},
          create: normalizedClubs.map((club) => ({
            name: club.name,
            address: club.address.length > 0 ? club.address : null,
            courtsCount: club.courtsCount,
          })),
        },
        categories: {
          deleteMany: {},
          create: normalizedCategoryEntries.map((entry) => ({
            ...tournamentCategoryById.get(entry.categoryId),
            categoryId: entry.categoryId,
            price: entry.price,
            secondaryPrice: entry.secondaryPrice,
            siblingPrice: entry.siblingPrice,
          })),
        },
        sponsors: {
          deleteMany: {},
          create: normalizedSponsors,
        },
      },
      include: tournamentInclude,
    });

    return NextResponse.json({ tournament: updated });
  } catch (error: unknown) {
    const detail =
      process.env.NODE_ENV !== "production" && error instanceof Error
        ? error.message
        : undefined;
    return NextResponse.json(
      detail
        ? { error: "No se pudo actualizar el torneo", detail }
        : { error: "No se pudo actualizar el torneo" },
      { status: 400 }
    );
  }
}

export async function GET(
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
    select: {
      id: true,
      ownerId: true,
      leagueId: true,
      rankingEnabled: true,
      league: { select: { id: true, name: true } },
    },
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

  return NextResponse.json({
    tournament: {
      id: tournament.id,
      leagueId: tournament.leagueId,
      rankingEnabled: tournament.rankingEnabled,
      league: tournament.league,
    },
  });
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

  await prisma.tournament.delete({ where: { id: tournament.id } });
  return NextResponse.json({ ok: true });
}

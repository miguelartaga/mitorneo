import { prisma } from "@/lib/prisma";
import { getServerSession } from "@/lib/auth";
import { canManageTournament } from "@/lib/permissions";
import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const runtime = "nodejs";

type MatchStage = "GROUP" | "PLAYOFF";
type DrawType = "ROUND_ROBIN" | "GROUPS_PLAYOFF" | "PLAYOFF";
type Tiebreaker =
  | "SETS_DIFF"
  | "MATCHES_WON"
  | "POINTS_PER_MATCH"
  | "POINTS_DIFF";

type Registration = {
  id: string;
  player: { firstName: string; lastName: string };
  partner: { firstName: string; lastName: string } | null;
  partnerTwo: { firstName: string; lastName: string } | null;
  teamName?: string | null;
  createdAt?: Date | string | null;
  seed?: number | null;
  rankingNumber?: number | null;
};

type StandingEntry = {
  id: string;
  categoryId: string;
  groupName: string;
  points: number;
  matchesWon: number;
  matchesLost: number;
  setsWon: number;
  setsLost: number;
  pointsWon: number;
  pointsLost: number;
  seed: number | null;
  rankingNumber: number | null;
  createdAt: Date;
};

const formatTeamName = (
  registration?: Registration | null,
  options?: { fronton?: boolean }
) => {
  if (!registration) return "Por definir";
  if (options?.fronton) {
    const teamName = registration.teamName?.trim();
    return teamName && teamName.length > 0 ? teamName : "Equipo";
  }
  const teamName = registration.teamName?.trim();
  const players = [
    registration.player,
    registration.partner,
    registration.partnerTwo,
  ].filter(Boolean) as { firstName: string; lastName: string }[];
  const playersLabel = players
    .map((player) => `${player.firstName} ${player.lastName}`)
    .join(" / ");
  if (teamName) {
    return playersLabel ? `${teamName} (${playersLabel})` : teamName;
  }
  return playersLabel || "Por definir";
};

const nextPowerOfTwo = (value: number) => {
  if (value <= 1) return 1;
  let size = 1;
  while (size < value) size *= 2;
  return size;
};

const DEFAULT_TIEBREAKERS: Tiebreaker[] = [
  "SETS_DIFF",
  "MATCHES_WON",
  "POINTS_PER_MATCH",
  "POINTS_DIFF",
];

const normalizeTiebreakerOrder = (value?: string[]) => {
  const filtered = Array.isArray(value)
    ? value.filter((item): item is Tiebreaker =>
        DEFAULT_TIEBREAKERS.includes(item as Tiebreaker)
      )
    : [];
  const unique = Array.from(new Set(filtered));
  const hasAll = DEFAULT_TIEBREAKERS.every((item) => unique.includes(item));
  if (!hasAll || unique.length !== DEFAULT_TIEBREAKERS.length) {
    return [...DEFAULT_TIEBREAKERS];
  }
  return unique;
};

const formatOrdinal = (value: number) => {
  if (value === 1) return "1ro";
  if (value === 2) return "2do";
  if (value === 3) return "3ro";
  return `${value}to`;
};

const parseGames = (value: unknown) => {
  if (!Array.isArray(value)) return [] as { a: number; b: number }[];
  const games: { a: number; b: number }[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const a = (entry as { a?: unknown }).a;
    const b = (entry as { b?: unknown }).b;
    if (typeof a !== "number" || typeof b !== "number") continue;
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    games.push({ a, b });
  }
  return games;
};

const computeMatchResult = (games: { a: number; b: number }[]) => {
  if (games.length === 0) return null;
  let setsA = 0;
  let setsB = 0;
  let pointsA = 0;
  let pointsB = 0;
  for (const game of games) {
    pointsA += game.a;
    pointsB += game.b;
    if (game.a > game.b) {
      setsA += 1;
    } else if (game.b > game.a) {
      setsB += 1;
    }
  }
  if (setsA === 0 && setsB === 0) return null;
  if (setsA === setsB) return null;
  return {
    setsA,
    setsB,
    pointsA,
    pointsB,
    winner: setsA > setsB ? "A" : "B",
  } as const;
};

const compareStandings = (
  a: {
    points: number;
    matchesWon: number;
    setsWon: number;
    setsLost: number;
    pointsWon: number;
    pointsLost: number;
    seed: number | null;
    rankingNumber: number | null;
    createdAt: Date;
  },
  b: {
    points: number;
    matchesWon: number;
    setsWon: number;
    setsLost: number;
    pointsWon: number;
    pointsLost: number;
    seed: number | null;
    rankingNumber: number | null;
    createdAt: Date;
  },
  order: Tiebreaker[]
) => {
  const metrics: Record<Tiebreaker, (item: typeof a) => number> = {
    SETS_DIFF: (item) => item.setsWon - item.setsLost,
    MATCHES_WON: (item) => item.matchesWon,
    POINTS_PER_MATCH: (item) => item.points,
    POINTS_DIFF: (item) => item.pointsWon - item.pointsLost,
  };
  for (const rule of order) {
    const diff = metrics[rule](b) - metrics[rule](a);
    if (diff !== 0) return diff;
  }
  const seedA = a.seed ?? a.rankingNumber ?? Number.MAX_SAFE_INTEGER;
  const seedB = b.seed ?? b.rankingNumber ?? Number.MAX_SAFE_INTEGER;
  if (seedA !== seedB) return seedA - seedB;
  return a.createdAt.getTime() - b.createdAt.getTime();
};

const formatPlayoffRoundLabel = (roundSize: number, roundNumber: number) => {
  if (roundSize === 2) return "Final";
  if (roundSize === 4) return "Semifinal";
  if (roundSize === 8) return "Cuartos";
  if (roundSize === 16) return "Ronda de 16";
  if (roundSize === 32) return "Ronda de 32";
  if (roundSize === 64) return "Ronda de 64";
  if (roundSize > 1) return `Ronda de ${roundSize}`;
  return `Ronda ${roundNumber}`;
};

const formatPrintDate = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const weekdays = [
    "domingo",
    "lunes",
    "martes",
    "miercoles",
    "jueves",
    "viernes",
    "sabado",
  ];
  const months = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];
  return `${weekdays[date.getDay()]} ${date.getDate()} de ${
    months[date.getMonth()]
  } del ${date.getFullYear()}`;
};

const resolveCourtLabel = (
  club: { courtLabels?: unknown } | undefined,
  courtNumber?: number | null
) => {
  if (!club || !courtNumber || courtNumber < 1) return "-";
  const labels = Array.isArray(club.courtLabels) ? club.courtLabels : [];
  const label =
    typeof labels[courtNumber - 1] === "string"
      ? labels[courtNumber - 1].trim()
      : "";
  return label.length > 0 ? label : String(courtNumber);
};

const resolveId = async (
  request: Request,
  params?: { id?: string } | Promise<{ id?: string }>
) => {
  if (params) {
    const resolved =
      typeof (params as Promise<{ id?: string }>).then === "function"
        ? await (params as Promise<{ id?: string }>)
        : (params as { id?: string });
    if (resolved?.id) return resolved.id;
  }
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 2] : undefined;
};

const fetchImage = async (url: string) => {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    const buffer = await res.arrayBuffer();
    return { contentType, buffer };
  } catch {
    return null;
  }
};

const isByeMatch = (match: {
  stage: MatchStage | null;
  roundNumber: number | null;
  teamAId?: string | null;
  teamBId?: string | null;
  isBronzeMatch?: boolean | null;
}) => {
  if (match.stage !== "PLAYOFF" || match.isBronzeMatch) return false;
  const round = match.roundNumber ?? 1;
  if (round !== 1) return false;
  const hasA = Boolean(match.teamAId);
  const hasB = Boolean(match.teamBId);
  return (hasA && !hasB) || (hasB && !hasA);
};

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

  const tournamentId = await resolveId(request, resolvedParams);
  if (!tournamentId) {
    return NextResponse.json({ error: "Torneo no encontrado" }, { status: 404 });
  }

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: {
      id: true,
      ownerId: true,
      name: true,
      league: {
        select: { name: true, photoUrl: true },
      },
    },
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

  const categories = await prisma.tournamentCategory.findMany({
    where: { tournamentId },
    select: {
      drawType: true,
      groupQualifiers: true,
      category: {
        select: {
          id: true,
          name: true,
          abbreviation: true,
          sport: { select: { name: true } },
        },
      },
    },
  });

  const registrations = await prisma.tournamentRegistration.findMany({
    where: { tournamentId },
    select: {
      id: true,
      teamName: true,
      categoryId: true,
      groupName: true,
      createdAt: true,
      seed: true,
      rankingNumber: true,
      player: { select: { firstName: true, lastName: true } },
      partner: { select: { firstName: true, lastName: true } },
      partnerTwo: { select: { firstName: true, lastName: true } },
    },
  });

  const qualifiers = await prisma.tournamentGroupQualifier.findMany({
    where: { tournamentId },
    select: { categoryId: true, groupName: true, qualifiers: true },
  });

  const groupPoints = await prisma.tournamentGroupPoints.findUnique({
    where: { tournamentId },
    select: {
      winPoints: true,
      winWithoutGameLossPoints: true,
      lossPoints: true,
      lossWithGameWinPoints: true,
      tiebreakerOrder: true,
    },
  });

  const clubs = await prisma.tournamentClub.findMany({
    where: { tournamentId },
    select: { id: true, name: true, courtLabels: true },
  });

  const matches = await prisma.tournamentMatch.findMany({
    where: { tournamentId },
    orderBy: [
      { scheduledDate: "asc" },
      { startTime: "asc" },
      { createdAt: "asc" },
    ],
    select: {
      id: true,
      categoryId: true,
      groupName: true,
      stage: true,
      winnerSide: true,
      outcomeType: true,
      outcomeSide: true,
      games: true,
      roundNumber: true,
      scheduledDate: true,
      startTime: true,
      teamAId: true,
      teamBId: true,
      clubId: true,
      courtNumber: true,
      isBronzeMatch: true,
    },
  });

  const categoryMap = new Map(
    categories.map((item) => [item.category.id, item.category])
  );
  const categoryDrawTypeMap = new Map(
    categories.map((item) => [item.category.id, item.drawType as DrawType | null])
  );
  const registrationMap = new Map(
    registrations.map((registration) => [registration.id, registration])
  );
  const clubMap = new Map(clubs.map((club) => [club.id, club]));
  const qualifiersByGroup = new Map(
    qualifiers.map((entry) => [
      `${entry.categoryId}:${(entry.groupName || "A").trim() || "A"}`,
      entry.qualifiers,
    ])
  );

  const tiebreakerOrder = normalizeTiebreakerOrder(
    Array.isArray(groupPoints?.tiebreakerOrder)
      ? (groupPoints?.tiebreakerOrder as string[])
      : undefined
  );
  const groupPointsConfig = {
    winPoints: groupPoints?.winPoints ?? 0,
    winWithoutGameLossPoints: groupPoints?.winWithoutGameLossPoints ?? 0,
    lossPoints: groupPoints?.lossPoints ?? 0,
    lossWithGameWinPoints: groupPoints?.lossWithGameWinPoints ?? 0,
  };

  const standingsById = new Map<string, StandingEntry>();

  registrations.forEach((registration) => {
    const createdAt = registration.createdAt
      ? new Date(registration.createdAt)
      : new Date(0);
    standingsById.set(registration.id, {
      id: registration.id,
      categoryId: registration.categoryId,
      groupName: (registration.groupName || "A").trim() || "A",
      points: 0,
      matchesWon: 0,
      matchesLost: 0,
      setsWon: 0,
      setsLost: 0,
      pointsWon: 0,
      pointsLost: 0,
      seed: registration.seed ?? null,
      rankingNumber: registration.rankingNumber ?? null,
      createdAt,
    });
  });

  matches
    .filter((match) => match.stage === "GROUP")
    .forEach((match) => {
      const result = computeMatchResult(parseGames(match.games));
      if (!result) return;
      const teamA = match.teamAId ? standingsById.get(match.teamAId) : null;
      const teamB = match.teamBId ? standingsById.get(match.teamBId) : null;
      if (!teamA || !teamB) return;

      teamA.setsWon += result.setsA;
      teamA.setsLost += result.setsB;
      teamA.pointsWon += result.pointsA;
      teamA.pointsLost += result.pointsB;
      teamB.setsWon += result.setsB;
      teamB.setsLost += result.setsA;
      teamB.pointsWon += result.pointsB;
      teamB.pointsLost += result.pointsA;

      if (result.winner === "A") {
        teamA.matchesWon += 1;
        teamB.matchesLost += 1;
        teamA.points +=
          result.setsB === 0
            ? groupPointsConfig.winWithoutGameLossPoints
            : groupPointsConfig.winPoints;
        teamB.points +=
          result.setsB > 0
            ? groupPointsConfig.lossWithGameWinPoints
            : groupPointsConfig.lossPoints;
      } else {
        teamB.matchesWon += 1;
        teamA.matchesLost += 1;
        teamB.points +=
          result.setsA === 0
            ? groupPointsConfig.winWithoutGameLossPoints
            : groupPointsConfig.winPoints;
        teamA.points +=
          result.setsA > 0
            ? groupPointsConfig.lossWithGameWinPoints
            : groupPointsConfig.lossPoints;
      }
    });

  const playoffLabelMap = new Map<string, string>();
  const groupStandingsByCategory = new Map<string, Map<string, StandingEntry[]>>();
  standingsById.forEach((entry) => {
    if (!groupStandingsByCategory.has(entry.categoryId)) {
      groupStandingsByCategory.set(entry.categoryId, new Map());
    }
    const groupMap = groupStandingsByCategory.get(entry.categoryId);
    if (!groupMap) return;
    if (!groupMap.has(entry.groupName)) {
      groupMap.set(entry.groupName, []);
    }
    groupMap.get(entry.groupName)?.push(entry);
  });

  groupStandingsByCategory.forEach((groups) => {
    groups.forEach((entries, groupName) => {
      const ordered = [...entries].sort((a, b) =>
        compareStandings(a, b, tiebreakerOrder)
      );
      ordered.forEach((entry, index) => {
        const position = index + 1;
        playoffLabelMap.set(
          entry.id,
          `${formatOrdinal(position)} Grupo ${groupName}`
        );
      });
    });
  });

  const qualifiedCountByCategory = new Map<string, number>();
  categories.forEach((category) => {
    if (category.drawType === "PLAYOFF") {
      const count = registrations.filter(
        (registration) => registration.categoryId === category.category.id
      ).length;
      qualifiedCountByCategory.set(category.category.id, count);
      return;
    }
    if (category.drawType !== "GROUPS_PLAYOFF") return;
    const categoryRegistrations = registrations.filter(
      (registration) => registration.categoryId === category.category.id
    );
    const groupCounts = new Map<string, number>();
    categoryRegistrations.forEach((registration) => {
      const groupName = (registration.groupName || "A").trim() || "A";
      groupCounts.set(groupName, (groupCounts.get(groupName) ?? 0) + 1);
    });
    let total = 0;
    const defaultQualifiers =
      typeof category.groupQualifiers === "number" && category.groupQualifiers > 0
        ? category.groupQualifiers
        : 2;
    groupCounts.forEach((count, groupName) => {
      const qualifiersCount =
        qualifiersByGroup.get(`${category.category.id}:${groupName}`) ??
        defaultQualifiers;
      total += Math.min(count, Math.max(1, qualifiersCount));
    });
    qualifiedCountByCategory.set(category.category.id, total);
  });

  const playoffRoundLabels = new Map<string, Map<number, string>>();
  const byCategory = new Map<string, typeof matches>();
  matches
    .filter((match) => match.stage === "PLAYOFF")
    .forEach((match) => {
      if (!byCategory.has(match.categoryId)) {
        byCategory.set(match.categoryId, []);
      }
      byCategory.get(match.categoryId)?.push(match);
    });

  byCategory.forEach((list, categoryId) => {
    const roundCounts = new Map<number, number>();
    list.forEach((match) => {
      const round = match.roundNumber ?? 1;
      roundCounts.set(round, (roundCounts.get(round) ?? 0) + 1);
    });
    const rounds = Array.from(roundCounts.keys()).sort((a, b) => a - b);
    if (rounds.length === 0) return;
    const qualifiedCount = qualifiedCountByCategory.get(categoryId) ?? 0;
    const bracketSize = qualifiedCount > 1 ? nextPowerOfTwo(qualifiedCount) : 0;
    if (bracketSize < 2) return;
    const labelMap = new Map<number, string>();
    rounds.forEach((round) => {
      const roundSize = Math.round(bracketSize / 2 ** (round - (rounds[0] ?? 1)));
      labelMap.set(round, formatPlayoffRoundLabel(roundSize, round));
    });
    playoffRoundLabels.set(categoryId, labelMap);
  });

  const hasMatchScore = (match: (typeof matches)[number]) => {
    if (Array.isArray(match.games) && match.games.length > 0) return true;
    if (match.outcomeType && match.outcomeType !== "PLAYED") {
      return Boolean(match.outcomeSide || match.winnerSide);
    }
    return false;
  };

  const groupStageCompleteByCategory = new Map<string, boolean>();
  const groupMatchesByCategory = new Map<string, typeof matches>();
  matches
    .filter((match) => match.stage === "GROUP")
    .forEach((match) => {
      if (!groupMatchesByCategory.has(match.categoryId)) {
        groupMatchesByCategory.set(match.categoryId, []);
      }
      groupMatchesByCategory.get(match.categoryId)?.push(match);
    });
  groupMatchesByCategory.forEach((list, categoryId) => {
    const complete = list.length > 0 && list.every((match) => hasMatchScore(match));
    groupStageCompleteByCategory.set(categoryId, complete);
  });

  const scheduledMatches = matches
    .filter((match) => match.scheduledDate && match.startTime && match.clubId)
    .filter((match) => !isByeMatch(match))
    .sort((a, b) => {
      const dateA = a.scheduledDate ? a.scheduledDate.getTime() : 0;
      const dateB = b.scheduledDate ? b.scheduledDate.getTime() : 0;
      if (dateA !== dateB) return dateA - dateB;
      if (a.startTime !== b.startTime) {
        return (a.startTime ?? "").localeCompare(b.startTime ?? "");
      }
      const clubA = clubMap.get(a.clubId ?? "")?.name ?? "";
      const clubB = clubMap.get(b.clubId ?? "")?.name ?? "";
      if (clubA !== clubB) return clubA.localeCompare(clubB);
      return (a.courtNumber ?? 0) - (b.courtNumber ?? 0);
    });

  const grouped = new Map<string, typeof scheduledMatches>();
  scheduledMatches.forEach((match) => {
    const date = match.scheduledDate?.toISOString().split("T")[0];
    if (!date) return;
    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date)?.push(match);
  });

  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const leagueLogo =
    tournament.league?.photoUrl ? await fetchImage(tournament.league.photoUrl) : null;
  let embeddedLogo: { width: number; height: number; image: any } | null = null;
  if (leagueLogo) {
    if (leagueLogo.contentType.includes("png")) {
      const image = await pdfDoc.embedPng(leagueLogo.buffer);
      embeddedLogo = { width: image.width, height: image.height, image };
    } else if (leagueLogo.contentType.includes("jpeg") || leagueLogo.contentType.includes("jpg")) {
      const image = await pdfDoc.embedJpg(leagueLogo.buffer);
      embeddedLogo = { width: image.width, height: image.height, image };
    }
  }

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 36;
  const columnDefs = [
    { label: "Hora", width: 40 },
    { label: "Club", width: 70 },
    { label: "Cancha", width: 35 },
    { label: "Categoria", width: 55 },
    { label: "Grupo", width: 55 },
    { label: "Equipo 1", width: 115 },
    { label: "VS", width: 20 },
    { label: "Equipo 2", width: 115 },
  ];

  const truncateText = (text: string, width: number, size: number) => {
    if (fontRegular.widthOfTextAtSize(text, size) <= width) return text;
    let clipped = text;
    while (clipped.length > 0 && fontRegular.widthOfTextAtSize(`${clipped}...`, size) > width) {
      clipped = clipped.slice(0, -1);
    }
    return `${clipped}...`;
  };

  const drawHeader = (page: any, dateLabel: string) => {
    let y = pageHeight - margin;
    if (embeddedLogo) {
      const logoSize = 40;
      const ratio = embeddedLogo.width / embeddedLogo.height;
      const logoWidth = logoSize * ratio;
      page.drawImage(embeddedLogo.image, {
        x: pageWidth - margin - logoWidth,
        y: y - logoSize + 6,
        width: logoWidth,
        height: logoSize,
      });
    }
    page.drawText(`Fixture del torneo ${tournament.name}`, {
      x: margin,
      y,
      size: 10,
      font: fontRegular,
      color: rgb(0.28, 0.33, 0.39),
    });
    y -= 16;
    page.drawText(dateLabel, {
      x: margin,
      y,
      size: 12,
      font: fontRegular,
      color: rgb(0.06, 0.09, 0.14),
    });
    y -= 18;
    let x = margin;
    columnDefs.forEach((col) => {
      page.drawText(col.label, {
        x,
        y,
        size: 9,
        font: fontRegular,
        color: rgb(0.39, 0.45, 0.51),
      });
      x += col.width;
    });
    y -= 8;
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 1,
      color: rgb(0.89, 0.91, 0.94),
    });
    y -= 8;
    return y;
  };

  const drawRow = (page: any, y: number, row: string[]) => {
    let x = margin;
    row.forEach((value, index) => {
      const width = columnDefs[index]?.width ?? 60;
      const text = truncateText(value, width, 9);
      page.drawText(text, {
        x,
        y,
        size: 9,
        font: fontRegular,
        color: rgb(0.06, 0.09, 0.14),
      });
      x += width;
    });
    return y - 14;
  };

  if (grouped.size === 0) {
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = drawHeader(page, "Sin fechas con partidos");
    page.drawText("No hay partidos con horario asignado.", {
      x: margin,
      y,
      size: 10,
      font: fontRegular,
      color: rgb(0.39, 0.45, 0.51),
    });
  } else {
    for (const [date, dayMatches] of grouped.entries()) {
      let page = pdfDoc.addPage([pageWidth, pageHeight]);
      let y = drawHeader(page, formatPrintDate(date));
      dayMatches.forEach((match) => {
        if (y < margin + 20) {
          const newPage = pdfDoc.addPage([pageWidth, pageHeight]);
          y = drawHeader(newPage, formatPrintDate(date));
          page = newPage;
        }
          const category = categoryMap.get(match.categoryId);
          const isFronton = (category?.sport?.name ?? "")
            .toLowerCase()
            .includes("fronton");
          const drawType = categoryDrawTypeMap.get(match.categoryId) ?? null;
          const showPlayoffLabel =
            match.stage === "PLAYOFF" && drawType === "GROUPS_PLAYOFF";
          const allowPlayoffNames =
            !showPlayoffLabel ||
            (groupStageCompleteByCategory.get(match.categoryId) ?? false);
          const groupLabel =
            match.stage === "PLAYOFF"
              ? match.isBronzeMatch
                ? "Bronce"
                : playoffRoundLabels.get(match.categoryId)?.get(match.roundNumber ?? 1) ??
                  `Ronda ${match.roundNumber ?? 1}`
              : match.groupName ?? "-";
          const teamALabel = match.teamAId
            ? playoffLabelMap.get(match.teamAId) ?? null
            : null;
          const teamBLabel = match.teamBId
            ? playoffLabelMap.get(match.teamBId) ?? null
            : null;
          const teamA = allowPlayoffNames
            ? formatTeamName(
                match.teamAId ? registrationMap.get(match.teamAId) : null,
                { fronton: isFronton }
              )
            : teamALabel ?? "Por definir";
          const teamB = allowPlayoffNames
            ? formatTeamName(
                match.teamBId ? registrationMap.get(match.teamBId) : null,
                { fronton: isFronton }
              )
            : teamBLabel ?? "Por definir";
          const club = clubMap.get(match.clubId ?? "");
          const row = [
            match.startTime ?? "",
            club?.name ?? "-",
            resolveCourtLabel(club, match.courtNumber ?? null),
            category?.abbreviation ?? "N/D",
            groupLabel,
            teamA,
            "vs",
            teamB,
          ];
        y = drawRow(page, y, row);
      });
    }
  }

  const pdfBytes = await pdfDoc.save();
  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=\"fixture-${tournamentId}.pdf\"`,
    },
  });
}

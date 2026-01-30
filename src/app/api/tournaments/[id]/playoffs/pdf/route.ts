import { prisma } from "@/lib/prisma";
import { getServerSession } from "@/lib/auth";
import { canManageTournament } from "@/lib/permissions";
import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { computeTournamentStandingsByCategory } from "@/lib/ranking";
import { computePlayoffMatchOrder } from "@/lib/playoff-match-utils";
import { nextPowerOfTwo } from "@/lib/playoff-utils";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

type DrawType = "ROUND_ROBIN" | "GROUPS_PLAYOFF" | "PLAYOFF";
type MatchStage = "GROUP" | "PLAYOFF";

type Registration = {
  id: string;
  categoryId: string;
  groupName?: string | null;
  rankingNumber?: number | null;
  createdAt?: Date | string | null;
  teamName?: string | null;
  playerId: string;
  partnerId?: string | null;
  partnerTwoId?: string | null;
  player: { firstName: string; lastName: string };
  partner: { firstName: string; lastName: string } | null;
  partnerTwo: { firstName: string; lastName: string } | null;
};

type Match = {
  id: string;
  categoryId: string;
  stage: MatchStage | null;
  groupName?: string | null;
  roundNumber?: number | null;
  orderHint?: number | null;
  createdAt?: Date | string | null;
  winnerSide?: "A" | "B" | null;
  outcomeType?: string | null;
  outcomeSide?: "A" | "B" | null;
  games?: unknown;
  teamAId?: string | null;
  teamBId?: string | null;
  isBronzeMatch?: boolean | null;
};

const playoffDrawTypes = new Set<DrawType>(["PLAYOFF", "GROUPS_PLAYOFF"]);

const formatOrdinal = (value: number) => {
  if (value === 1) return "1ro";
  if (value === 2) return "2do";
  if (value === 3) return "3ro";
  return `${value}to`;
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

const parseGames = (value: unknown) => {
  if (!Array.isArray(value)) return [] as { a: number; b: number; tiebreakA?: number; tiebreakB?: number }[];
  const games: { a: number; b: number; tiebreakA?: number; tiebreakB?: number }[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const a = (entry as { a?: unknown }).a;
    const b = (entry as { b?: unknown }).b;
    const tiebreakA = (entry as { tiebreakA?: unknown }).tiebreakA;
    const tiebreakB = (entry as { tiebreakB?: unknown }).tiebreakB;
    if (typeof a !== "number" || typeof b !== "number") continue;
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const record: { a: number; b: number; tiebreakA?: number; tiebreakB?: number } = { a, b };
    if (typeof tiebreakA === "number" && Number.isFinite(tiebreakA)) {
      record.tiebreakA = tiebreakA;
    }
    if (typeof tiebreakB === "number" && Number.isFinite(tiebreakB)) {
      record.tiebreakB = tiebreakB;
    }
    games.push(record);
  }
  return games;
};

const formatMatchScore = (match: Match) => {
  const outcomeType = match.outcomeType ?? "PLAYED";
  if (outcomeType !== "PLAYED") {
    return outcomeType === "WALKOVER"
      ? "WO"
      : outcomeType === "INJURY"
      ? "Lesion"
      : "Resultado";
  }
  const games = parseGames(match.games);
  if (games.length === 0) return null;
  return games
    .map((game) => {
      const tiebreak =
        typeof game.tiebreakA === "number" && typeof game.tiebreakB === "number"
          ? `(${game.tiebreakA}-${game.tiebreakB})`
          : "";
      return `${game.a}-${game.b}${tiebreak}`;
    })
    .join(" | ");
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

const loadLocalImage = async (relativePath: string) => {
  try {
    const filePath = path.join(process.cwd(), "public", relativePath.replace(/^\//, ""));
    const buffer = await readFile(filePath);
    return buffer;
  } catch {
    return null;
  }
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
    select: { id: true, ownerId: true, name: true },
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
      categoryId: true,
      groupName: true,
      rankingNumber: true,
      createdAt: true,
      teamName: true,
      playerId: true,
      partnerId: true,
      partnerTwoId: true,
      player: { select: { firstName: true, lastName: true } },
      partner: { select: { firstName: true, lastName: true } },
      partnerTwo: { select: { firstName: true, lastName: true } },
    },
  });

  const matches = await prisma.tournamentMatch.findMany({
    where: { tournamentId },
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      categoryId: true,
      stage: true,
      groupName: true,
      roundNumber: true,
      orderHint: true,
      createdAt: true,
      winnerSide: true,
      outcomeType: true,
      outcomeSide: true,
      games: true,
      teamAId: true,
      teamBId: true,
      isBronzeMatch: true,
    },
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

  const playoffSlots = await prisma.playoffSlot.findMany({
    where: { tournamentId },
    orderBy: [{ categoryId: "asc" }, { position: "asc" }],
    select: {
      id: true,
      categoryId: true,
      position: true,
      entrantId: true,
    },
  });

  const categoryMap = new Map(categories.map((item) => [item.category.id, item]));
  const registrationMap = new Map(
    registrations.map((registration) => [registration.id, registration])
  );

  const standingsData = computeTournamentStandingsByCategory({
    categories: categories.map((entry) => ({
      categoryId: entry.category.id,
      drawType: entry.drawType as DrawType | null,
    })),
    registrations: registrations.map((registration) => ({
      id: registration.id,
      categoryId: registration.categoryId,
      groupName: registration.groupName ?? null,
      seed: null,
      rankingNumber: registration.rankingNumber ?? null,
      createdAt: registration.createdAt,
      playerId: registration.playerId,
      partnerId: registration.partnerId ?? null,
      partnerTwoId: registration.partnerTwoId ?? null,
    })),
    matches: matches.map((match) => ({
      categoryId: match.categoryId,
      groupName: match.groupName ?? null,
      stage: match.stage,
      roundNumber: match.roundNumber ?? null,
      games: match.games,
      teamAId: match.teamAId ?? null,
      teamBId: match.teamBId ?? null,
      winnerSide: match.winnerSide ?? null,
      outcomeType: match.outcomeType ?? null,
      outcomeSide: match.outcomeSide ?? null,
      isBronzeMatch: match.isBronzeMatch ?? null,
    })),
    groupPoints: groupPoints ?? null,
    rankingPoints: [],
  });

  const labelByRegistration = new Map<string, string>();
  if (standingsData instanceof Map) {
    standingsData.forEach((entries) => {
      if (!Array.isArray(entries)) return;
      const groupMap = new Map<string, typeof entries>();
      entries.forEach((entry) => {
        const groupKey = entry.groupName ?? "A";
        const list = groupMap.get(groupKey) ?? [];
        list.push(entry);
        groupMap.set(groupKey, list);
      });
      groupMap.forEach((list, groupKey) => {
        list.forEach((entry, index) => {
          labelByRegistration.set(entry.id, `${formatOrdinal(index + 1)} Grupo ${groupKey}`);
        });
      });
    });
  }

  const playoffMatchesByCategory = new Map<string, Match[]>();
  matches
    .filter((match) => match.stage === "PLAYOFF")
    .forEach((match) => {
      if (!playoffMatchesByCategory.has(match.categoryId)) {
        playoffMatchesByCategory.set(match.categoryId, []);
      }
      playoffMatchesByCategory.get(match.categoryId)?.push(match);
    });

  const slotMapByCategory = new Map<string, typeof playoffSlots>();
  playoffSlots.forEach((slot) => {
    const list = slotMapByCategory.get(slot.categoryId) ?? [];
    list.push(slot);
    slotMapByCategory.set(slot.categoryId, list);
  });
  slotMapByCategory.forEach((list) => list.sort((a, b) => a.position - b.position));

  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const logoBuffer = await loadLocalImage("/logo/logo1.png");
  const logoImage = logoBuffer ? await pdfDoc.embedPng(logoBuffer) : null;

  const matchWidth = 300;
  const matchHeight = 120;
  const columnGap = 140;
  const step = matchHeight + 52;
  const margin = 36;
  const headerHeight = 48;

  const truncateText = (text: string, width: number, size: number) => {
    if (fontRegular.widthOfTextAtSize(text, size) <= width) return text;
    let clipped = text;
    while (clipped.length > 0 && fontRegular.widthOfTextAtSize(`${clipped}...`, size) > width) {
      clipped = clipped.slice(0, -1);
    }
    return `${clipped}...`;
  };

  const drawRoundedRect = (
    page: any,
    x: number,
    y: number,
    width: number,
    height: number,
    options: { border?: { color: number[]; width: number }; fill?: number[] }
  ) => {
    page.drawRectangle({
      x,
      y,
      width,
      height,
      color: options.fill ? rgb(options.fill[0], options.fill[1], options.fill[2]) : undefined,
      borderColor: options.border
        ? rgb(options.border.color[0], options.border.color[1], options.border.color[2])
        : undefined,
      borderWidth: options.border?.width ?? 0,
    });
  };

  const getCenterY = (roundIndex: number, matchIndex: number) => {
    const stepR = step * Math.pow(2, roundIndex);
    const offset = stepR / 2;
    return offset + stepR * matchIndex;
  };

  for (const [categoryId, categoryMatches] of playoffMatchesByCategory.entries()) {
    const categoryEntry = categoryMap.get(categoryId);
    if (!categoryEntry || !playoffDrawTypes.has(categoryEntry.drawType as DrawType)) continue;

    const sportName = categoryEntry.category.sport?.name ?? "";
    const isFronton = sportName.toLowerCase().includes("fronton");

    const mainMatches = categoryMatches.filter((match) => !match.isBronzeMatch);
    const bronzeMatches = categoryMatches.filter((match) => match.isBronzeMatch);
    if (mainMatches.length === 0) continue;

    const roundNumbers = Array.from(
      new Set(mainMatches.map((match) => match.roundNumber ?? 1))
    ).sort((a, b) => a - b);
    const firstRoundNumber = roundNumbers[0] ?? 1;

    const slotEntries = slotMapByCategory.get(categoryId) ?? [];
    const derivedBracketSize = slotEntries.length > 0
      ? slotEntries.length
      : (() => {
          const roundCounts = new Map<number, number>();
          mainMatches.forEach((match) => {
            const round = match.roundNumber ?? 1;
            roundCounts.set(round, (roundCounts.get(round) ?? 0) + 1);
          });
          let maxSize = 0;
          roundCounts.forEach((count, round) => {
            const size = count * 2 ** Math.max(0, round - 1);
            if (size > maxSize) maxSize = size;
          });
          return maxSize > 1 ? maxSize : 0;
        })();

    const filledSlotCount = slotEntries.filter((slot) => slot.entrantId).length;
    const displayBracketSize =
      filledSlotCount > 1 ? nextPowerOfTwo(filledSlotCount) : null;
    const labelBracketSize = displayBracketSize ?? derivedBracketSize ?? 0;
    if (!labelBracketSize || labelBracketSize < 2) continue;

    const expectedRounds = Math.max(1, Math.round(Math.log2(labelBracketSize)));
    const normalizedRoundNumbers = Array.from({ length: expectedRounds }, (_, index) => index + 1);
    const labelMap = new Map<number, string>();
    normalizedRoundNumbers.forEach((round) => {
      labelMap.set(round, formatPlayoffRoundLabel(labelBracketSize, round));
    });

    const slotEntriesForOrder = slotEntries.map((slot) => ({
      position: slot.position,
      entrantId: slot.entrantId ?? null,
    }));
    const matchesForBracket = mainMatches.map((match) => {
      if (slotEntriesForOrder.length === 0) return match;
      const orderHint = computePlayoffMatchOrder({
        match: {
          teamAId: match.teamAId ?? null,
          teamBId: match.teamBId ?? null,
          roundNumber: match.roundNumber ?? firstRoundNumber,
        },
        slots: slotEntriesForOrder,
      });
      if (typeof orderHint === "number") {
        return { ...match, orderHint };
      }
      return match;
    });

    const matchStatusByMatchId = new Map<string, string>();
    matchesForBracket.forEach((match) => {
      const score = formatMatchScore(match);
      if (score) matchStatusByMatchId.set(match.id, score);
    });

    const roundIndexMap = new Map<number, number>();
    normalizedRoundNumbers.forEach((roundNumber, index) => {
      roundIndexMap.set(roundNumber, index);
    });
    const orderTracker = new Map<number, number>();
    const bracketMatches = matchesForBracket
      .slice()
      .sort((a, b) => {
        const roundA = roundIndexMap.get(a.roundNumber ?? normalizedRoundNumbers[0]) ?? 0;
        const roundB = roundIndexMap.get(b.roundNumber ?? normalizedRoundNumbers[0]) ?? 0;
        if (roundA !== roundB) return roundA - roundB;
        const orderA = typeof a.orderHint === "number" ? a.orderHint : null;
        const orderB = typeof b.orderHint === "number" ? b.orderHint : null;
        if (orderA !== null || orderB !== null) {
          if (orderA === null) return 1;
          if (orderB === null) return -1;
          if (orderA !== orderB) return orderA - orderB;
        }
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeA - timeB;
      })
      .map((match) => {
        const roundNumber = match.roundNumber ?? normalizedRoundNumbers[0];
        const roundIndex = roundIndexMap.get(roundNumber) ?? 0;
        const nextOrder = orderTracker.get(roundNumber) ?? 0;
        orderTracker.set(roundNumber, nextOrder + 1);
        return {
          matchId: match.id,
          roundIndex,
          order: nextOrder,
          match,
        };
      });

    const roundsMatches = normalizedRoundNumbers.map((roundNumber, roundIndex) => ({
      roundIndex,
      name: labelMap.get(roundNumber) ?? formatPlayoffRoundLabel(labelBracketSize, roundNumber),
      matches: bracketMatches
        .filter((entry) => entry.roundIndex === roundIndex)
        .sort((a, b) => a.order - b.order),
    }));

    const roundCount = roundsMatches.length;
    const firstCount = Math.max(1, roundsMatches[0]?.matches.length ?? 1);
    const bronzeExtra = bronzeMatches.length > 0 ? matchHeight + 56 : 0;
    const totalWidth = roundCount * matchWidth + Math.max(0, roundCount - 1) * columnGap;
    const totalHeight = firstCount * step + bronzeExtra;

    const pageWidth = Math.max(842, totalWidth + margin * 2);
    const pageHeight = Math.max(595, totalHeight + margin * 2 + headerHeight);
    const page = pdfDoc.addPage([pageWidth, pageHeight]);

    const headerY = pageHeight - margin - 16;
    page.drawText(`Llaves ${tournament.name}`, {
      x: margin,
      y: headerY,
      size: 12,
      font: fontBold,
      color: rgb(0.06, 0.09, 0.14),
    });
    page.drawText(categoryEntry.category.name, {
      x: margin,
      y: headerY - 16,
      size: 10,
      font: fontRegular,
      color: rgb(0.39, 0.45, 0.51),
    });

    if (logoImage) {
      const logoSize = 60;
      const ratio = logoImage.width / logoImage.height;
      const logoWidth = logoSize * ratio;
      page.drawImage(logoImage, {
        x: pageWidth - margin - logoWidth,
        y: pageHeight - margin - logoSize,
        width: logoWidth,
        height: logoSize,
        opacity: 0.35,
      });
    }

    const originY = pageHeight - margin - headerHeight;

    // Watermark (center)
    if (logoImage) {
      const wmSize = Math.min(totalWidth, totalHeight) * 0.45;
      const ratio = logoImage.width / logoImage.height;
      const wmWidth = wmSize * ratio;
      page.drawImage(logoImage, {
        x: margin + totalWidth / 2 - wmWidth / 2,
        y: originY - totalHeight / 2 - wmSize / 2,
        width: wmWidth,
        height: wmSize,
        opacity: 0.08,
      });
    }

    // Connection lines
    roundsMatches.forEach((round, roundIndex) => {
      if (roundIndex >= roundCount - 1) return;
      const currentLeft = margin + roundIndex * (matchWidth + columnGap) + matchWidth;
      const nextLeft = margin + roundIndex * (matchWidth + columnGap) + matchWidth + columnGap;
      const midX = currentLeft + columnGap / 2;
      round.matches.forEach((entry, matchIndex) => {
        const targetIndex = Math.floor(matchIndex / 2);
        const y1 = originY - (getCenterY(roundIndex, matchIndex));
        const y2 = originY - (getCenterY(roundIndex + 1, targetIndex));
        page.drawLine({
          start: { x: currentLeft, y: y1 },
          end: { x: midX, y: y1 },
          thickness: 1.2,
          color: rgb(0.74, 0.79, 0.87),
        });
        page.drawLine({
          start: { x: midX, y: y1 },
          end: { x: midX, y: y2 },
          thickness: 1.2,
          color: rgb(0.74, 0.79, 0.87),
        });
        page.drawLine({
          start: { x: midX, y: y2 },
          end: { x: nextLeft - columnGap, y: y2 },
          thickness: 1.2,
          color: rgb(0.74, 0.79, 0.87),
        });
      });
    });

    const drawSide = (
      match: Match,
      x: number,
      yTop: number,
      label: string,
      badge?: string,
      isWinner?: boolean,
      isLoser?: boolean
    ) => {
      const sideHeight = 22;
      const y = originY - yTop - sideHeight;
      drawRoundedRect(page, x, y, matchWidth, sideHeight, {
        border: { color: isWinner ? [0.39, 0.4, 0.88] : [0.89, 0.91, 0.94], width: 1 },
        fill: isWinner ? [0.93, 0.95, 1] : [0.97, 0.98, 0.99],
      });
      const text = truncateText(label, matchWidth - 70, 9);
      page.drawText(text, {
        x: x + 8,
        y: y + 6,
        size: 9,
        font: fontRegular,
        color: isLoser ? rgb(0.58, 0.63, 0.72) : rgb(0.06, 0.09, 0.14),
      });
      if (badge) {
        const badgeText = badge.toUpperCase();
        page.drawText(badgeText, {
          x: x + matchWidth - 62,
          y: y + 6,
          size: 7,
          font: fontBold,
          color: badgeText === "CAMPEON" ? rgb(0.26, 0.35, 0.86) : rgb(0.39, 0.45, 0.51),
        });
      }
    };

    roundsMatches.forEach((round, roundIndex) => {
      const columnLeft = margin + roundIndex * (matchWidth + columnGap);
      const titleY = originY - 12;
      page.drawText(round.name.toUpperCase(), {
        x: columnLeft + matchWidth / 2 - fontBold.widthOfTextAtSize(round.name.toUpperCase(), 8) / 2,
        y: titleY,
        size: 8,
        font: fontBold,
        color: rgb(0.39, 0.45, 0.51),
      });

      round.matches.forEach((entry) => {
        const matchIndex = entry.order ?? 0;
        const top = getCenterY(roundIndex, matchIndex) - matchHeight / 2;
        const matchTop = originY - top;
        const matchBottom = matchTop - matchHeight;

        drawRoundedRect(page, columnLeft, matchBottom, matchWidth, matchHeight, {
          border: { color: [0.89, 0.91, 0.94], width: 1 },
          fill: [1, 1, 1],
        });

        const matchLabel = matchStatusByMatchId.get(entry.matchId) ?? round.name;
        page.drawText(matchLabel, {
          x: columnLeft + 10,
          y: matchTop - 16,
          size: 8,
          font: fontBold,
          color: rgb(0.31, 0.39, 0.94),
        });

        const sideAWon = entry.match.winnerSide === "A";
        const sideBWon = entry.match.winnerSide === "B";
        const isFinal = roundIndex === roundCount - 1;

        const teamA = entry.match.teamAId
          ? registrationMap.get(entry.match.teamAId)
          : null;
        const teamB = entry.match.teamBId
          ? registrationMap.get(entry.match.teamBId)
          : null;
        const labelA = entry.match.teamAId
          ? `${labelByRegistration.get(entry.match.teamAId) ?? ""} ${formatTeamName(teamA, { fronton: isFronton })}`.trim()
          : "Por definir";
        const labelB = entry.match.teamBId
          ? `${labelByRegistration.get(entry.match.teamBId) ?? ""} ${formatTeamName(teamB, { fronton: isFronton })}`.trim()
          : "Por definir";

        const badgeA =
          isFinal && sideAWon
            ? "Campeon"
            : isFinal && sideBWon
            ? "2do lugar"
            : null;
        const badgeB =
          isFinal && sideBWon
            ? "Campeon"
            : isFinal && sideAWon
            ? "2do lugar"
            : null;

        drawSide(entry.match, columnLeft + 6, top + 24, labelA, badgeA, sideAWon, sideBWon);
        drawSide(entry.match, columnLeft + 6, top + 52, labelB, badgeB, sideBWon, sideAWon);
      });
    });

    if (bronzeMatches.length > 0) {
      const match = bronzeMatches[0];
      const columnLeft = margin + (roundCount - 1) * (matchWidth + columnGap);
      const top = firstCount * step + 32;
      const matchTop = originY - top;
      const matchBottom = matchTop - matchHeight;

      drawRoundedRect(page, columnLeft, matchBottom, matchWidth, matchHeight, {
        border: { color: [0.89, 0.91, 0.94], width: 1 },
        fill: [1, 1, 1],
      });
      page.drawText("3ER LUGAR", {
        x: columnLeft + 10,
        y: matchTop - 16,
        size: 8,
        font: fontBold,
        color: rgb(0.31, 0.39, 0.94),
      });

      const teamA = match.teamAId ? registrationMap.get(match.teamAId) : null;
      const teamB = match.teamBId ? registrationMap.get(match.teamBId) : null;
      const labelA = match.teamAId
        ? `${labelByRegistration.get(match.teamAId) ?? ""} ${formatTeamName(teamA, { fronton: isFronton })}`.trim()
        : "Por definir";
      const labelB = match.teamBId
        ? `${labelByRegistration.get(match.teamBId) ?? ""} ${formatTeamName(teamB, { fronton: isFronton })}`.trim()
        : "Por definir";
      const sideAWon = match.winnerSide === "A";
      const sideBWon = match.winnerSide === "B";

      drawSide(match, columnLeft + 6, top + 24, labelA, sideAWon ? "3er lugar" : null, sideAWon, sideBWon);
      drawSide(match, columnLeft + 6, top + 52, labelB, sideBWon ? "3er lugar" : null, sideBWon, sideAWon);
    }
  }

  const pdfBytes = await pdfDoc.save();
  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=\"llaves-${tournamentId}.pdf\"`,
    },
  });
}

import { getServerSession } from "@/lib/auth";
import { canManageTournament } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  computeTournamentPlacements,
  computeTournamentStandingsByCategory,
  type TournamentRankingData,
} from "@/lib/ranking";
import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const runtime = "nodejs";

const resolveId = (request: Request, resolvedParams?: { id?: string }) => {
  if (resolvedParams?.id) return resolvedParams.id;
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 3] : undefined;
};

const formatTeamName = (registration?: {
  teamName?: string | null;
  player?: { firstName: string; lastName: string };
  partner?: { firstName: string; lastName: string } | null;
  partnerTwo?: { firstName: string; lastName: string } | null;
}) => {
  if (!registration) return "N/D";
  const teamName = registration.teamName?.trim();
  const players = [
    registration.player,
    registration.partner,
    registration.partnerTwo,
  ].filter(Boolean) as { firstName: string; lastName: string }[];
  const playersLabel = players
    .map((player) => `${player.firstName} ${player.lastName}`.trim())
    .join(" / ");
  if (teamName) {
    return playersLabel ? `${teamName} (${playersLabel})` : teamName;
  }
  return playersLabel || "N/D";
};

const truncate = (value: string, max: number) => {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trim()}…`;
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

  const tournamentId = resolveId(request, resolvedParams);
  if (!tournamentId) {
    return NextResponse.json({ error: "Torneo no encontrado" }, { status: 404 });
  }

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true, ownerId: true, name: true, status: true },
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

  const [categories, registrations, matches, groupPoints, rankingPoints] =
    await Promise.all([
      prisma.tournamentCategory.findMany({
        where: { tournamentId },
        select: {
          categoryId: true,
          drawType: true,
          category: { select: { id: true, name: true, abbreviation: true } },
        },
      }),
      prisma.tournamentRegistration.findMany({
        where: { tournamentId },
        select: {
          id: true,
          categoryId: true,
          groupName: true,
          seed: true,
          rankingNumber: true,
          createdAt: true,
          teamName: true,
          player: { select: { firstName: true, lastName: true } },
          partner: { select: { firstName: true, lastName: true } },
          partnerTwo: { select: { firstName: true, lastName: true } },
          playerId: true,
          partnerId: true,
          partnerTwoId: true,
        },
      }),
      prisma.tournamentMatch.findMany({
        where: { tournamentId },
        select: {
          categoryId: true,
          groupName: true,
          stage: true,
          roundNumber: true,
          games: true,
          teamAId: true,
          teamBId: true,
          winnerSide: true,
          outcomeType: true,
          outcomeSide: true,
          isBronzeMatch: true,
        },
      }),
      prisma.tournamentGroupPoints.findUnique({
        where: { tournamentId },
        select: {
          winPoints: true,
          winWithoutGameLossPoints: true,
          lossPoints: true,
          lossWithGameWinPoints: true,
          tiebreakerOrder: true,
        },
      }),
      prisma.tournamentRankingPoints.findMany({
        where: { tournamentId },
        orderBy: [{ placeFrom: "asc" }],
      }),
    ]);

  const data: TournamentRankingData = {
    categories: categories.map((entry) => ({
      categoryId: entry.categoryId,
      drawType: entry.drawType ?? null,
    })),
    registrations: registrations.map((registration) => ({
      id: registration.id,
      categoryId: registration.categoryId,
      groupName: registration.groupName ?? null,
      seed: registration.seed ?? null,
      rankingNumber: registration.rankingNumber ?? null,
      createdAt: registration.createdAt,
      playerId: registration.playerId,
      partnerId: registration.partnerId ?? null,
      partnerTwoId: registration.partnerTwoId ?? null,
    })),
    matches: matches.map((match) => ({
      categoryId: match.categoryId,
      groupName: match.groupName ?? null,
      stage: match.stage as TournamentRankingData["matches"][number]["stage"],
      roundNumber: match.roundNumber ?? null,
      games: match.games,
      teamAId: match.teamAId ?? null,
      teamBId: match.teamBId ?? null,
      winnerSide: match.winnerSide as TournamentRankingData["matches"][number]["winnerSide"],
      outcomeType: match.outcomeType as TournamentRankingData["matches"][number]["outcomeType"],
      outcomeSide: match.outcomeSide as TournamentRankingData["matches"][number]["outcomeSide"],
      isBronzeMatch: match.isBronzeMatch ?? null,
    })),
    groupPoints: groupPoints,
    rankingPoints: rankingPoints.map((entry) => ({
      placeFrom: entry.placeFrom,
      placeTo: entry.placeTo,
      points: entry.points,
    })),
  };

  const standingsByCategory = computeTournamentStandingsByCategory(data);
  const placementsByCategory = computeTournamentPlacements(data);

  const registrationMap = new Map(
    registrations.map((registration) => [registration.id, registration])
  );
  const categoryMap = new Map(
    categories.map((entry) => [entry.categoryId, entry.category])
  );

  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 40;
  const lineHeight = 14;
  const headerLineHeight = 18;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const wrapHeaderLines = (text: string, maxWidth: number) => {
    const lines: string[] = [];
    const rawLines = text.split("\n");
    rawLines.forEach((line) => {
      const words = line.split(" ").filter(Boolean);
      let current = "";
      words.forEach((word) => {
        const candidate = current ? `${current} ${word}` : word;
        const width = fontBold.widthOfTextAtSize(candidate, 14);
        if (width <= maxWidth) {
          current = candidate;
          return;
        }
        if (current) lines.push(current);
        current = word;
      });
      if (current) lines.push(current);
    });
    return lines.length > 0 ? lines : [text];
  };

  const drawHeader = (title: string) => {
    const maxWidth = pageWidth - margin * 2;
    const lines = wrapHeaderLines(title, maxWidth);
    lines.forEach((line) => {
      page.drawText(line, {
        x: margin,
        y,
        size: 14,
        font: fontBold,
        color: rgb(0.12, 0.15, 0.2),
      });
      y -= headerLineHeight;
    });
    y -= 6;
  };

  const drawColumns = () => {
    page.drawText("Pos", { x: margin, y, size: 9, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
    page.drawText("Equipo", { x: margin + 40, y, size: 9, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
    page.drawText("Pts actuales", { x: pageWidth - 200, y, size: 9, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
    page.drawText("Pts torneo", { x: pageWidth - 120, y, size: 9, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
    page.drawText("Total", { x: pageWidth - 60, y, size: 9, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
    y -= 12;
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 1,
      color: rgb(0.85, 0.88, 0.92),
    });
    y -= 10;
  };

  drawHeader(`Posiciones generales\n${tournament.name}`);



  const categoryEntries = Array.from(placementsByCategory.entries());
  for (const [categoryId, placements] of categoryEntries) {
    const category = categoryMap.get(categoryId);
    const standings = standingsByCategory.get(categoryId) ?? [];
    if (!placements.length) continue;

    if (y < margin + 80) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }

    page.drawText(`${category?.name ?? "Categoria"} (${category?.abbreviation ?? "-"})`, {
      x: margin,
      y,
      size: 12,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= headerLineHeight;
    drawColumns();

    placements.forEach((registrationId, index) => {
      const registration = registrationMap.get(registrationId);
      if (!registration) return;
      if (y < margin + 40) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
        drawColumns();
      }
      const place = index + 1;
      const pointsAdd = data.rankingPoints
        ? data.rankingPoints.reduce((value, entry) => {
          const to = entry.placeTo ?? Number.POSITIVE_INFINITY;
          if (place >= entry.placeFrom && place <= to) return entry.points;
          return value;
        }, 0)
        : 0;
      const pointsCurrent =
        typeof registration.rankingNumber === "number"
          ? registration.rankingNumber
          : null;
      const pointsTotal =
        pointsCurrent !== null ? pointsCurrent + pointsAdd : null;

      page.drawText(String(place), {
        x: margin,
        y,
        size: 9,
        font: fontRegular,
        color: rgb(0.15, 0.15, 0.15),
      });
      page.drawText(truncate(formatTeamName(registration), 46), {
        x: margin + 40,
        y,
        size: 9,
        font: fontRegular,
        color: rgb(0.15, 0.15, 0.15),
      });
      page.drawText(pointsCurrent !== null ? String(pointsCurrent) : "-", {
        x: pageWidth - 200,
        y,
        size: 9,
        font: fontRegular,
        color: rgb(0.15, 0.15, 0.15),
      });
      page.drawText(String(pointsAdd), {
        x: pageWidth - 120,
        y,
        size: 9,
        font: fontRegular,
        color: rgb(0.15, 0.15, 0.15),
      });
      page.drawText(pointsTotal !== null ? String(pointsTotal) : "-", {
        x: pageWidth - 60,
        y,
        size: 9,
        font: fontRegular,
        color: rgb(0.15, 0.15, 0.15),
      });

      y -= lineHeight;
    });

    y -= 10;
  }

  const pdfBytes = await pdfDoc.save();
  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=\"ranking-${tournamentId}.pdf\"`,
    },
  });
}

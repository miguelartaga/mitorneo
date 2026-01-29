import { prisma } from "@/lib/prisma";
import { getServerSession } from "@/lib/auth";
import { canManageTournament } from "@/lib/permissions";
import { NextResponse } from "next/server";
import { buildSlotPositionMap } from "@/lib/playoff-match-utils";

type MatchSide = "A" | "B";

const resolveId = (request: Request, resolvedParams?: { id?: string }) => {
  if (resolvedParams?.id) return resolvedParams.id;
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 4] : undefined;
};

const parseSide = (value: unknown): MatchSide | null => {
  if (value === "A" || value === "B") return value;
  return null;
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
      { error: "El torneo ya esta finalizado" },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));

  const assignMatchId =
    typeof body?.assign?.matchId === "string" ? body.assign.matchId : null;
  const assignSide = parseSide(body?.assign?.side);
  const assignRegistrationRaw = body?.assign?.registrationId;
  const assignRegistrationId =
    typeof assignRegistrationRaw === "string" && assignRegistrationRaw.trim()
      ? assignRegistrationRaw.trim()
      : null;

  if (assignMatchId && assignSide) {
    const targetMatch = await prisma.tournamentMatch.findFirst({
      where: {
        id: assignMatchId,
        tournamentId,
        stage: "PLAYOFF",
      },
      select: {
        id: true,
        categoryId: true,
        teamAId: true,
        teamBId: true,
      },
    });

    if (!targetMatch) {
      return NextResponse.json(
        { error: "Partido no encontrado" },
        { status: 404 }
      );
    }

    const resetData = {
      games: null,
      winnerSide: null,
      outcomeType: "PLAYED" as const,
      outcomeSide: null,
    };

    const updates = [];

    if (assignRegistrationId) {
      const existingMatch = await prisma.tournamentMatch.findFirst({
        where: {
          tournamentId,
          categoryId: targetMatch.categoryId,
          stage: "PLAYOFF",
          OR: [
            { teamAId: assignRegistrationId },
            { teamBId: assignRegistrationId },
          ],
        },
        select: {
          id: true,
          teamAId: true,
          teamBId: true,
        },
      });

      if (existingMatch) {
        if (existingMatch.id === targetMatch.id) {
          const alreadyOnTarget =
            (assignSide === "A" &&
              targetMatch.teamAId === assignRegistrationId) ||
            (assignSide === "B" &&
              targetMatch.teamBId === assignRegistrationId);
          if (alreadyOnTarget) {
            return NextResponse.json({ updated: 0 });
          }
          const data: {
            teamAId: string | null;
            teamBId: string | null;
          } = {
            teamAId: targetMatch.teamAId,
            teamBId: targetMatch.teamBId,
          };
          if (assignSide === "A") {
            if (targetMatch.teamBId === assignRegistrationId) {
              data.teamBId = null;
            }
            data.teamAId = assignRegistrationId;
          } else {
            if (targetMatch.teamAId === assignRegistrationId) {
              data.teamAId = null;
            }
            data.teamBId = assignRegistrationId;
          }
          updates.push(
            prisma.tournamentMatch.update({
              where: { id: targetMatch.id },
              data: {
                ...data,
                ...resetData,
              },
            })
          );
          await prisma.$transaction(updates);
          return NextResponse.json({ updated: updates.length });
        }

        updates.push(
          prisma.tournamentMatch.update({
            where: { id: existingMatch.id },
            data: {
              teamAId:
                existingMatch.teamAId === assignRegistrationId
                  ? null
                  : existingMatch.teamAId,
              teamBId:
                existingMatch.teamBId === assignRegistrationId
                  ? null
                  : existingMatch.teamBId,
              ...resetData,
            },
          })
        );
      }

      const currentTarget =
        assignSide === "A" ? targetMatch.teamAId : targetMatch.teamBId;
      if (currentTarget !== assignRegistrationId) {
        updates.push(
          prisma.tournamentMatch.update({
            where: { id: targetMatch.id },
            data: {
              ...(assignSide === "A"
                ? { teamAId: assignRegistrationId }
                : { teamBId: assignRegistrationId }),
              ...resetData,
            },
          })
        );
      }
    } else {
      const currentTarget =
        assignSide === "A" ? targetMatch.teamAId : targetMatch.teamBId;
      if (!currentTarget) {
        return NextResponse.json({ updated: 0 });
      }
      updates.push(
        prisma.tournamentMatch.update({
          where: { id: targetMatch.id },
          data: {
            ...(assignSide === "A" ? { teamAId: null } : { teamBId: null }),
            ...resetData,
          },
        })
      );
    }

    if (updates.length > 0) {
      await prisma.$transaction(updates);
    }

    return NextResponse.json({ updated: updates.length });
  }

  const fromMatchId =
    typeof body?.from?.matchId === "string" ? body.from.matchId : null;
  const toMatchId =
    typeof body?.to?.matchId === "string" ? body.to.matchId : null;
  const fromSide = parseSide(body?.from?.side);
  const toSide = parseSide(body?.to?.side);

  if (!fromMatchId || !toMatchId || !fromSide || !toSide) {
    return NextResponse.json(
      { error: "Datos invalidos para actualizar la llave" },
      { status: 400 }
    );
  }

  if (fromMatchId === toMatchId && fromSide === toSide) {
    return NextResponse.json({ updated: 0 });
  }

  const matchIds = Array.from(new Set([fromMatchId, toMatchId]));
  const matches = await prisma.tournamentMatch.findMany({
    where: {
      id: { in: matchIds },
      tournamentId,
      stage: "PLAYOFF",
    },
    select: {
      id: true,
      categoryId: true,
      teamAId: true,
      teamBId: true,
    },
  });

  if (matches.length !== matchIds.length) {
    return NextResponse.json(
      { error: "Partido no encontrado" },
      { status: 404 }
    );
  }

  const matchMap = new Map(matches.map((match) => [match.id, match]));
  const fromMatch = matchMap.get(fromMatchId);
  const toMatch = matchMap.get(toMatchId);

  if (!fromMatch || !toMatch) {
    return NextResponse.json(
      { error: "Partido no encontrado" },
      { status: 404 }
    );
  }

  if (fromMatch.categoryId !== toMatch.categoryId) {
    return NextResponse.json(
      { error: "No se puede mover entre categorias" },
      { status: 400 }
    );
  }

  const slotEntries = await prisma.playoffSlot.findMany({
    where: { tournamentId, categoryId: fromMatch.categoryId },
    orderBy: { position: "asc" },
    select: { position: true, entrantId: true },
  });
  const categoryMatches = await prisma.tournamentMatch.findMany({
    where: { tournamentId, categoryId: fromMatch.categoryId, stage: "PLAYOFF" },
    orderBy: [
      { roundNumber: "asc" },
      { createdAt: "asc" },
    ],
    select: { id: true, roundNumber: true, orderHint: true, createdAt: true },
  });
  const slotPositionMap = buildSlotPositionMap({
    slots: slotEntries,
    matches: categoryMatches,
  });

  const fromPosition = slotPositionMap.get(`${fromMatchId}:${fromSide}`);
  const toPosition = slotPositionMap.get(`${toMatchId}:${toSide}`);
  const slotOperations: ReturnType<typeof prisma.playoffSlot.update>[] = [];
  const addSlotUpdate = (position: number | undefined, entrantId: string | null) => {
    if (!position) return;
    slotOperations.push(
      prisma.playoffSlot.update({
        where: {
          tournamentId_categoryId_position: {
            tournamentId,
            categoryId: fromMatch.categoryId,
            position,
          },
        },
        data: { entrantId: entrantId ?? null },
      })
    );
  };

  const getTeam = (match: typeof fromMatch, side: MatchSide) =>
    side === "A" ? match.teamAId : match.teamBId;

  const fromTeam = getTeam(fromMatch, fromSide);
  const toTeam = getTeam(toMatch, toSide);

  if (!fromTeam) {
    return NextResponse.json(
      { error: "No hay equipo para mover" },
      { status: 400 }
    );
  }

  if (fromTeam === toTeam && fromMatchId === toMatchId) {
    return NextResponse.json({ updated: 0 });
  }

  const resetData = {
    games: null,
    winnerSide: null,
    outcomeType: "PLAYED" as const,
    outcomeSide: null,
  };

  if (fromMatchId === toMatchId) {
    const nextTeamAId = fromSide === "A" ? toTeam : fromTeam;
    const nextTeamBId = fromSide === "B" ? toTeam : fromTeam;
    const operations = [
      prisma.tournamentMatch.update({
        where: { id: fromMatchId },
        data: {
          teamAId: nextTeamAId,
          teamBId: nextTeamBId,
          ...resetData,
        },
      }),
    ];
    addSlotUpdate(fromPosition, toTeam ?? null);
    addSlotUpdate(toPosition, fromTeam ?? null);
    if (slotOperations.length > 0) {
      operations.push(...slotOperations);
    }
    await prisma.$transaction(operations);
    return NextResponse.json({ updated: 1 });
  }

  const matchUpdates = [
    prisma.tournamentMatch.update({
      where: { id: fromMatchId },
      data: {
        teamAId: fromSide === "A" ? toTeam : fromMatch.teamAId,
        teamBId: fromSide === "B" ? toTeam : fromMatch.teamBId,
        ...resetData,
      },
    }),
    prisma.tournamentMatch.update({
      where: { id: toMatchId },
      data: {
        teamAId: toSide === "A" ? fromTeam : toMatch.teamAId,
        teamBId: toSide === "B" ? fromTeam : toMatch.teamBId,
        ...resetData,
      },
    }),
  ];
  addSlotUpdate(fromPosition, toTeam ?? null);
  addSlotUpdate(toPosition, fromTeam ?? null);

  await prisma.$transaction([...matchUpdates, ...slotOperations]);

  return NextResponse.json({ updated: matchUpdates.length });
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

import TournamentPublic from "@/components/tournaments/tournament-public";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

const toISOStringOrNull = (value?: Date | null) =>
  value ? value.toISOString() : null;

import { type TournamentPublicData } from "@/types/tournament-public";

export default async function TournamentPublicPage({
  params,
}: {
  params: { id: string } | Promise<{ id: string }>;
}) {
  const resolvedParams =
    typeof (params as Promise<{ id: string }>).then === "function"
      ? await (params as Promise<{ id: string }>)
      : (params as { id: string });

  const tournament = await prisma.tournament.findUnique({
    where: { id: resolvedParams?.id },
    include: {
      league: { select: { id: true, name: true, photoUrl: true } },
      sport: { select: { id: true, name: true } },
      owner: { select: { name: true, email: true } },
      clubs: true,
      sponsors: { orderBy: { sortOrder: "asc" } },
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
      registrations: {
        orderBy: { createdAt: "asc" },
        include: {
          player: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              city: true,
              country: true,
              photoUrl: true,
            },
          },
          partner: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              city: true,
              country: true,
              photoUrl: true,
            },
          },
          partnerTwo: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              city: true,
              country: true,
              photoUrl: true,
            },
          },
        },
      },
      matches: {
        orderBy: [{ scheduledDate: "asc" }, { startTime: "asc" }],
        include: {
          club: { select: { id: true, name: true, address: true, courtsCount: true } },
          category: {
            select: { id: true, name: true, abbreviation: true },
          },
          teamA: {
            include: {
              player: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  city: true,
                  country: true,
                  photoUrl: true,
                },
              },
              partner: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  city: true,
                  country: true,
                  photoUrl: true,
                },
              },
              partnerTwo: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  city: true,
                  country: true,
                  photoUrl: true,
                },
              },
            },
          },
          teamB: {
            include: {
              player: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  city: true,
                  country: true,
                  photoUrl: true,
                },
              },
              partner: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  city: true,
                  country: true,
                  photoUrl: true,
                },
              },
              partnerTwo: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  city: true,
                  country: true,
                  photoUrl: true,
                },
              },
            },
          },
        },
      },
      playoffSlots: {
        select: {
          categoryId: true,
          position: true,
          entrantId: true,
        },
        orderBy: { position: "asc" },
      },
      prizes: {
        orderBy: [{ categoryId: "asc" }, { placeFrom: "asc" }],
        include: {
          category: { select: { id: true, name: true, abbreviation: true } },
        },
      },
      groupPoints: {
        select: {
          winPoints: true,
          winWithoutGameLossPoints: true,
          lossPoints: true,
          lossWithGameWinPoints: true,
          tiebreakerOrder: true,
        },
      },
    },
  });

  if (!tournament) {
    notFound();
  }

  const normalized = {
    id: tournament.id,
    name: tournament.name,
    description: tournament.description,
    photoUrl: tournament.photoUrl,
    address: tournament.address,
    startDate: toISOStringOrNull(tournament.startDate),
    endDate: toISOStringOrNull(tournament.endDate),
    registrationDeadline: toISOStringOrNull(tournament.registrationDeadline),
    rulesText: tournament.rulesText,
    liveStreamTitle: tournament.liveStreamTitle,
    liveStreamUrl: tournament.liveStreamUrl,
    liveStreams: Array.isArray(tournament.liveStreams) ? tournament.liveStreams : [],
    rankingEnabled: tournament.rankingEnabled,
    playDays: Array.isArray(tournament.playDays)
      ? tournament.playDays.filter((day): day is string => typeof day === "string")
      : [],
    schedulePublished: tournament.schedulePublished,
    groupsPublished: tournament.groupsPublished,
    playoffsPublished: tournament.playoffsPublished,
    sport: tournament.sport,
    league: tournament.league,
    owner: tournament.owner,
    clubs: tournament.clubs,
    sponsors: tournament.sponsors.map((sponsor) => ({
      id: sponsor.id,
      name: sponsor.name,
      imageUrl: sponsor.imageUrl,
      linkUrl: sponsor.linkUrl,
    })),
    categories: tournament.categories.map((entry) => ({
      categoryId: entry.categoryId,
      price: entry.price.toString(),
      secondaryPrice: entry.secondaryPrice.toString(),
      siblingPrice: entry.siblingPrice.toString(),
      drawType: entry.drawType,
      category: entry.category,
    })),
    registrations: tournament.registrations.map((registration) => ({
      id: registration.id,
      categoryId: registration.categoryId,
      playerId: registration.player.id,
      partnerId: registration.partner?.id ?? null,
      partnerTwoId: registration.partnerTwo?.id ?? null,
      teamName: registration.teamName,
      groupName: registration.groupName,
      rankingNumber: registration.rankingNumber,
      player: registration.player,
      partner: registration.partner,
      partnerTwo: registration.partnerTwo,
      createdAt: registration.createdAt.toISOString(),
    })),
      matches: tournament.matches.map((match) => ({
        id: match.id,
        categoryId: match.categoryId,
        groupName: match.groupName,
        stage: match.stage,
        isBronzeMatch: match.isBronzeMatch,
        roundNumber: match.roundNumber,
        orderHint: match.orderHint ?? null,
        createdAt: match.createdAt.toISOString(),
        scheduledDate: toISOStringOrNull(match.scheduledDate),
        startTime: match.startTime,
        courtNumber: match.courtNumber,
      club: match.club,
      games: match.games,
      liveState: match.liveState as any,
      winnerSide: match.winnerSide as "A" | "B" | null,
      outcomeType: match.outcomeType,
      outcomeSide: match.outcomeSide as "A" | "B" | null,
      teamAId: match.teamAId,
      teamBId: match.teamBId,
      category: match.category,
      teamA: match.teamA
        ? {
          id: match.teamA.id,
          categoryId: match.teamA.categoryId,
          playerId: match.teamA.player.id,
          teamName: match.teamA.teamName,
          groupName: match.teamA.groupName,
          rankingNumber: match.teamA.rankingNumber,
          player: match.teamA.player,
          partner: match.teamA.partner,
          partnerTwo: match.teamA.partnerTwo,
          createdAt: match.teamA.createdAt.toISOString(),
        }
        : null,
        teamB: match.teamB
          ? {
            id: match.teamB.id,
          categoryId: match.teamB.categoryId,
          playerId: match.teamB.player.id,
          teamName: match.teamB.teamName,
          groupName: match.teamB.groupName,
          rankingNumber: match.teamB.rankingNumber,
          player: match.teamB.player,
          partner: match.teamB.partner,
          partnerTwo: match.teamB.partnerTwo,
          createdAt: match.teamB.createdAt.toISOString(),
        }
        : null,
    })),
    playoffSlots: tournament.playoffSlots.map((slot) => ({
      categoryId: slot.categoryId,
      position: slot.position,
      entrantId: slot.entrantId ?? null,
    })),
    prizes: tournament.prizes.map((prize) => ({
      id: prize.id,
      categoryId: prize.categoryId,
      placeFrom: prize.placeFrom,
      placeTo: prize.placeTo,
      amount: prize.amount ? prize.amount.toString() : null,
      prizeText: prize.prizeText,
      category: prize.category,
    })),
    groupPoints: tournament.groupPoints
      ? {
        winPoints: tournament.groupPoints.winPoints,
        winWithoutGameLossPoints: tournament.groupPoints.winWithoutGameLossPoints,
        lossPoints: tournament.groupPoints.lossPoints,
        lossWithGameWinPoints: tournament.groupPoints.lossWithGameWinPoints,
        tiebreakerOrder: tournament.groupPoints.tiebreakerOrder,
      }
      : null,
  };

  return <TournamentPublic tournament={normalized} />;
}

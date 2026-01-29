"use client";

import { useEffect, useMemo, useState } from "react";

type DrawType = "ROUND_ROBIN" | "GROUPS_PLAYOFF" | "PLAYOFF";
type MatchStage = "GROUP" | "PLAYOFF";
type OutcomeType = "PLAYED" | "WALKOVER" | "INJURY";
type Tiebreaker =
  | "SETS_DIFF"
  | "MATCHES_WON"
  | "POINTS_PER_MATCH"
  | "POINTS_DIFF";

type Player = {
  id: string;
  firstName: string;
  lastName: string;
};

type Registration = {
  id: string;
  categoryId: string;
  groupName: string | null;
  seed?: number | null;
  rankingNumber?: number | null;
  createdAt?: string;
  player: Player;
  partner: Player | null;
  partnerTwo: Player | null;
  teamName?: string | null;
};

type Category = {
  id: string;
  name: string;
  abbreviation: string;
  drawType?: DrawType | null;
};

type Match = {
  id: string;
  categoryId: string;
  groupName: string | null;
  stage: MatchStage | null;
  roundNumber: number | null;
  games?: unknown;
  teamAId?: string | null;
  teamBId?: string | null;
  winnerSide?: "A" | "B" | null;
  outcomeType?: OutcomeType | null;
  outcomeSide?: "A" | "B" | null;
  isBronzeMatch?: boolean | null;
};

type FixtureResponse = {
  categories: Category[];
  registrations: Registration[];
  matches: Match[];
  tournamentStatus?: "WAITING" | "ACTIVE" | "FINISHED";
  sessionRole?: "ADMIN" | "TOURNAMENT_ADMIN";
  groupPoints?: {
    winPoints?: number;
    winWithoutGameLossPoints?: number;
    lossPoints?: number;
    lossWithGameWinPoints?: number;
    tiebreakerOrder?: string[];
  };
};

type RankingPoint = {
  id: string;
  placeFrom: number;
  placeTo: number | null;
  points: number;
};

type RankingPointsResponse = {
  points: RankingPoint[];
};

type Props = {
  tournamentId: string;
  tournamentName: string;
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

type FinalRow = {
  place: number;
  registration: Registration;
  category: Category;
  pointsCurrent: number | null;
  pointsAdd: number;
  pointsTotal: number | null;
};

const groupDrawTypes = new Set<DrawType>(["ROUND_ROBIN", "GROUPS_PLAYOFF"]);
const playoffDrawTypes = new Set<DrawType>(["PLAYOFF", "GROUPS_PLAYOFF"]);
const DEFAULT_TIEBREAKERS: Tiebreaker[] = [
  "SETS_DIFF",
  "MATCHES_WON",
  "POINTS_PER_MATCH",
  "POINTS_DIFF",
];

const formatTeamName = (registration?: Registration) => {
  if (!registration) return "N/D";
  const teamName = registration.teamName?.trim();
  const players = [
    registration.player,
    registration.partner,
    registration.partnerTwo,
  ].filter(Boolean) as Player[];
  const playersLabel = players
    .map((player) => `${player.firstName} ${player.lastName}`.trim())
    .join(" / ");
  if (teamName) {
    return playersLabel ? `${teamName} (${playersLabel})` : teamName;
  }
  return playersLabel || "N/D";
};

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
    const record: { a: number; b: number; tiebreakA?: number; tiebreakB?: number } = {
      a,
      b,
    };
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

const resolveWinnerSide = (match: Match) => {
  if (match.winnerSide) return match.winnerSide;
  if (match.outcomeType && match.outcomeType !== "PLAYED" && match.outcomeSide) {
    return match.outcomeSide === "A" ? "B" : "A";
  }
  const result = computeMatchResult(parseGames(match.games));
  return result?.winner ?? null;
};

const compareStandings = (
  a: StandingEntry,
  b: StandingEntry,
  order: Tiebreaker[]
) => {
  const metrics: Record<Tiebreaker, (item: StandingEntry) => number> = {
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

const getPointsForPlace = (entries: RankingPoint[], place: number) => {
  for (const entry of entries) {
    const to = entry.placeTo ?? Number.POSITIVE_INFINITY;
    if (place >= entry.placeFrom && place <= to) return entry.points;
  }
  return 0;
};

export default function TournamentFinalStandings({
  tournamentId,
  tournamentName,
}: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [groupPoints, setGroupPoints] = useState({
    winPoints: 0,
    winWithoutGameLossPoints: 0,
    lossPoints: 0,
    lossWithGameWinPoints: 0,
    tiebreakerOrder: [...DEFAULT_TIEBREAKERS],
  });
  const [rankingPoints, setRankingPoints] = useState<RankingPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [tournamentStatus, setTournamentStatus] = useState<
    "WAITING" | "ACTIVE" | "FINISHED"
  >("WAITING");
  const [sessionRole, setSessionRole] = useState<"ADMIN" | "TOURNAMENT_ADMIN">(
    "TOURNAMENT_ADMIN"
  );

  const loadData = async () => {
    setLoading(true);
    setError(null);
    const [fixtureRes, rankingRes] = await Promise.all([
      fetch(`/api/tournaments/${tournamentId}/fixtures`, { cache: "no-store" }),
      fetch(`/api/tournaments/${tournamentId}/ranking-points`, {
        cache: "no-store",
      }),
    ]);

    const fixtureData = (await fixtureRes.json().catch(() => ({}))) as FixtureResponse;
    const rankingData = (await rankingRes.json().catch(() => ({}))) as RankingPointsResponse;

    setLoading(false);

    if (!fixtureRes.ok) {
      const detail = (fixtureData as { detail?: string })?.detail
        ? ` (${(fixtureData as { detail?: string }).detail})`
        : "";
      setError(
        `${(fixtureData as { error?: string })?.error ?? "No se pudo cargar el fixture"}${detail}`
      );
      return;
    }

    setCategories(Array.isArray(fixtureData.categories) ? fixtureData.categories : []);
    setRegistrations(
      Array.isArray(fixtureData.registrations) ? fixtureData.registrations : []
    );
    setMatches(Array.isArray(fixtureData.matches) ? fixtureData.matches : []);
    if (fixtureData.tournamentStatus) {
      setTournamentStatus(fixtureData.tournamentStatus);
    }
    if (fixtureData.sessionRole) {
      setSessionRole(fixtureData.sessionRole);
    }
    if (fixtureData.groupPoints) {
      setGroupPoints({
        winPoints:
          typeof fixtureData.groupPoints.winPoints === "number"
            ? fixtureData.groupPoints.winPoints
            : 0,
        winWithoutGameLossPoints:
          typeof fixtureData.groupPoints.winWithoutGameLossPoints === "number"
            ? fixtureData.groupPoints.winWithoutGameLossPoints
            : 0,
        lossPoints:
          typeof fixtureData.groupPoints.lossPoints === "number"
            ? fixtureData.groupPoints.lossPoints
            : 0,
        lossWithGameWinPoints:
          typeof fixtureData.groupPoints.lossWithGameWinPoints === "number"
            ? fixtureData.groupPoints.lossWithGameWinPoints
            : 0,
        tiebreakerOrder: normalizeTiebreakerOrder(
          fixtureData.groupPoints.tiebreakerOrder
        ),
      });
    }
    setRankingPoints(Array.isArray(rankingData.points) ? rankingData.points : []);
  };

  useEffect(() => {
    loadData();
  }, [tournamentId]);

  const isMatchComplete = (match: Match) => {
    const outcomeType = match.outcomeType ?? "PLAYED";
    if (match.stage !== "GROUP" && (!match.teamAId || !match.teamBId)) {
      return false;
    }
    if (outcomeType !== "PLAYED") {
      return Boolean(match.outcomeSide || match.winnerSide);
    }
    if (match.winnerSide) return true;
    return Array.isArray(match.games) && match.games.length > 0;
  };

  const allMatchesComplete = useMemo(
    () => matches.length > 0 && matches.every((match) => isMatchComplete(match)),
    [matches]
  );

  const handleFinishTournament = async () => {
    if (finishing) return;
    setError(null);
    setFinishing(true);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "FINISHED" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = data?.detail ? ` (${data.detail})` : "";
        throw new Error(`${data?.error ?? "No se pudo finalizar"}${detail}`);
      }
      setTournamentStatus("FINISHED");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo finalizar");
    } finally {
      setFinishing(false);
    }
  };


  const standingsByCategory = useMemo(() => {
    const standingsMap = new Map<string, StandingEntry[]>();
    const standingsById = new Map<string, StandingEntry>();

    registrations.forEach((registration) => {
      const createdAt = registration.createdAt
        ? new Date(registration.createdAt)
        : new Date(0);
      const entry: StandingEntry = {
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
      };
      standingsById.set(registration.id, entry);
      if (!standingsMap.has(entry.categoryId)) {
        standingsMap.set(entry.categoryId, []);
      }
      standingsMap.get(entry.categoryId)?.push(entry);
    });

    matches
      .filter((match) => match.stage === "GROUP")
      .forEach((match) => {
        const teamA = match.teamAId ? standingsById.get(match.teamAId) : undefined;
        const teamB = match.teamBId ? standingsById.get(match.teamBId) : undefined;
        if (!teamA || !teamB) return;

        const outcomeType = match.outcomeType ?? "PLAYED";
        const outcomeSide = match.outcomeSide ?? null;

        if (outcomeType !== "PLAYED") {
          const winnerSide =
            outcomeSide === "A"
              ? "B"
              : outcomeSide === "B"
              ? "A"
              : match.winnerSide ?? null;
          if (!winnerSide) return;
          if (winnerSide === "A") {
            teamA.matchesWon += 1;
            teamB.matchesLost += 1;
            teamA.points += groupPoints.winWithoutGameLossPoints;
            teamB.points += groupPoints.lossPoints;
          } else {
            teamB.matchesWon += 1;
            teamA.matchesLost += 1;
            teamB.points += groupPoints.winWithoutGameLossPoints;
            teamA.points += groupPoints.lossPoints;
          }
          return;
        }

        const result = computeMatchResult(parseGames(match.games));
        if (!result) return;

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
              ? groupPoints.winWithoutGameLossPoints
              : groupPoints.winPoints;
          teamB.points +=
            result.setsB > 0
              ? groupPoints.lossWithGameWinPoints
              : groupPoints.lossPoints;
        } else {
          teamB.matchesWon += 1;
          teamA.matchesLost += 1;
          teamB.points +=
            result.setsA === 0
              ? groupPoints.winWithoutGameLossPoints
              : groupPoints.winPoints;
          teamA.points +=
            result.setsA > 0
              ? groupPoints.lossWithGameWinPoints
              : groupPoints.lossPoints;
        }
      });

    standingsMap.forEach((entries, categoryId) => {
      entries.sort((a, b) => compareStandings(a, b, groupPoints.tiebreakerOrder));
      standingsMap.set(categoryId, entries);
    });

    return standingsMap;
  }, [registrations, matches, groupPoints]);

  const finalStandings = useMemo(() => {
    const rows: FinalRow[] = [];

    const categoryMap = new Map(categories.map((category) => [category.id, category]));
    const registrationMap = new Map(
      registrations.map((registration) => [registration.id, registration])
    );

    categories.forEach((category) => {
      const categoryRegs = registrations.filter(
        (registration) => registration.categoryId === category.id
      );
      if (categoryRegs.length === 0) return;

      const playoffMatches = matches.filter(
        (match) => match.categoryId === category.id && match.stage === "PLAYOFF"
      );
      const mainPlayoffMatches = playoffMatches.filter(
        (match) => !match.isBronzeMatch
      );
      const bronzeMatches = playoffMatches.filter((match) => match.isBronzeMatch);

      const placements: string[] = [];
      const placementSet = new Set<string>();
      const hasPlayoff = playoffDrawTypes.has(category.drawType ?? "ROUND_ROBIN");

      if (hasPlayoff && mainPlayoffMatches.length > 0) {
        const rounds = Array.from(
          new Set(mainPlayoffMatches.map((match) => match.roundNumber ?? 1))
        ).sort((a, b) => a - b);
        const finalRound = rounds[rounds.length - 1] ?? 1;
        const finalMatch = mainPlayoffMatches.find(
          (match) => (match.roundNumber ?? 1) === finalRound
        );
        const finalWinner = finalMatch ? resolveWinnerSide(finalMatch) : null;
        if (finalMatch && finalWinner) {
          const winnerId =
            finalWinner === "A" ? finalMatch.teamAId : finalMatch.teamBId;
          const loserId =
            finalWinner === "A" ? finalMatch.teamBId : finalMatch.teamAId;
          if (winnerId) {
            placements.push(winnerId);
            placementSet.add(winnerId);
          }
          if (loserId) {
            placements.push(loserId);
            placementSet.add(loserId);
          }
        }

        const bronzeMatch = bronzeMatches.find(
          (match) => resolveWinnerSide(match)
        );
        const bronzeWinner = bronzeMatch ? resolveWinnerSide(bronzeMatch) : null;
        if (bronzeMatch && bronzeWinner) {
          const thirdId =
            bronzeWinner === "A" ? bronzeMatch.teamAId : bronzeMatch.teamBId;
          const fourthId =
            bronzeWinner === "A" ? bronzeMatch.teamBId : bronzeMatch.teamAId;
          if (thirdId) {
            placements.push(thirdId);
            placementSet.add(thirdId);
          }
          if (fourthId) {
            placements.push(fourthId);
            placementSet.add(fourthId);
          }
        }

        const eliminationRound = new Map<string, number>();
        mainPlayoffMatches.forEach((match) => {
          const winner = resolveWinnerSide(match);
          if (!winner) return;
          const round = match.roundNumber ?? 1;
          const loserId =
            winner === "A" ? match.teamBId : match.teamAId;
          if (loserId) {
            eliminationRound.set(loserId, round);
          }
        });

        const playoffParticipants = new Set<string>();
        mainPlayoffMatches.forEach((match) => {
          if (match.teamAId) playoffParticipants.add(match.teamAId);
          if (match.teamBId) playoffParticipants.add(match.teamBId);
        });

        const remainingPlayoff = Array.from(playoffParticipants).filter(
          (id) => !placementSet.has(id)
        );
        remainingPlayoff.sort((a, b) => {
          const roundA = eliminationRound.get(a) ?? 0;
          const roundB = eliminationRound.get(b) ?? 0;
          if (roundA !== roundB) return roundB - roundA;
          const regA = registrationMap.get(a);
          const regB = registrationMap.get(b);
          const seedA = regA?.seed ?? regA?.rankingNumber ?? Number.MAX_SAFE_INTEGER;
          const seedB = regB?.seed ?? regB?.rankingNumber ?? Number.MAX_SAFE_INTEGER;
          if (seedA !== seedB) return seedA - seedB;
          const createdA = regA?.createdAt ? new Date(regA.createdAt).getTime() : 0;
          const createdB = regB?.createdAt ? new Date(regB.createdAt).getTime() : 0;
          return createdA - createdB;
        });
        remainingPlayoff.forEach((id) => {
          placements.push(id);
          placementSet.add(id);
        });

        const nonQualifiers = categoryRegs.filter(
          (registration) => !playoffParticipants.has(registration.id)
        );
        const standings = standingsByCategory.get(category.id) ?? [];
        nonQualifiers.sort((a, b) => {
          const indexA = standings.findIndex((entry) => entry.id === a.id);
          const indexB = standings.findIndex((entry) => entry.id === b.id);
          if (indexA !== indexB) return indexA - indexB;
          return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
        });
        nonQualifiers.forEach((registration) => {
          placements.push(registration.id);
        });
      } else {
        const standings = standingsByCategory.get(category.id) ?? [];
        standings.forEach((entry) => {
          placements.push(entry.id);
        });
      }

      placements.forEach((registrationId, index) => {
        const registration = registrationMap.get(registrationId);
        if (!registration) return;
        const place = index + 1;
        const pointsAdd = getPointsForPlace(rankingPoints, place);
        const pointsCurrent =
          typeof registration.rankingNumber === "number"
            ? registration.rankingNumber
            : null;
        const pointsTotal =
          pointsCurrent !== null ? pointsCurrent + pointsAdd : null;
        rows.push({
          place,
          registration,
          category,
          pointsCurrent,
          pointsAdd,
          pointsTotal,
        });
      });
    });

    return rows;
  }, [categories, registrations, matches, standingsByCategory, rankingPoints]);

  const rowsByCategory = useMemo(() => {
    const map = new Map<string, FinalRow[]>();
    finalStandings.forEach((row) => {
      if (!map.has(row.category.id)) map.set(row.category.id, []);
      map.get(row.category.id)?.push(row);
    });
    return map;
  }, [finalStandings]);

  if (loading) {
    return <p className="text-sm text-slate-500">Cargando posiciones finales...</p>;
  }

  const handleDownloadPdf = async () => {
    if (downloadingPdf) return;
    setDownloadingPdf(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tournaments/${tournamentId}/final-standings/pdf`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const detail = data?.detail ? ` (${data.detail})` : "";
        throw new Error(
          `${data?.error ?? "No se pudo descargar el PDF"}${detail}`
        );
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `ranking-${tournamentName || "torneo"}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo descargar el PDF"
      );
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="admin-fade-up relative overflow-hidden rounded-[24px] border border-white/70 bg-white/80 p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/70 backdrop-blur">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-indigo-300/70 via-sky-300/60 to-amber-200/70" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-500">
              Paso 9
            </p>
            <h2 className="text-2xl font-semibold text-slate-900">
              Posiciones finales
            </h2>
            <p className="text-sm text-slate-600">
              Torneo: <span className="font-semibold">{tournamentName}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={downloadingPdf}
              className="inline-flex items-center justify-center rounded-full border border-indigo-200 bg-white px-4 py-2 text-xs font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {downloadingPdf ? "Descargando..." : "Descargar PDF"}
            </button>
            {tournamentStatus === "ACTIVE" &&
              (sessionRole === "ADMIN" || sessionRole === "TOURNAMENT_ADMIN") && (
              <button
                type="button"
                onClick={handleFinishTournament}
                disabled={finishing}
                className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {finishing ? "Finalizando..." : "Terminar torneo"}
              </button>
            )}
          </div>
        </div>
        {!allMatchesComplete && tournamentStatus === "ACTIVE" && (
          <p className="mt-3 text-xs text-amber-600">
            Aun hay partidos sin marcador, pero puedes finalizar si ya estas seguro.
          </p>
        )}
        <p className="mt-3 text-sm text-slate-600">
          La tabla se calcula con los resultados finales del torneo.
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {rowsByCategory.size === 0 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Todavia no hay datos suficientes para las posiciones finales.
        </p>
      ) : (
        Array.from(rowsByCategory.entries()).map(([categoryId, rows]) => {
          const category = categories.find((item) => item.id === categoryId);
          return (
            <div
              key={categoryId}
              className="admin-fade-up overflow-hidden rounded-[24px] border border-slate-200/70 bg-white/90 p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.35)]"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    {category?.name ?? "Categoria"}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {category?.abbreviation ?? "-"}
                  </p>
                </div>
                <span className="text-xs text-slate-500">
                  {rows.length} inscritos
                </span>
              </div>
                <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200/70 bg-white">
                  <table className="min-w-[520px] divide-y divide-slate-200/70 text-xs">
                  <thead className="bg-slate-50/80 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                    <tr>
                      <th className="px-3 py-3 text-left font-semibold">
                        Pos
                      </th>
                      <th className="px-3 py-3 text-left font-semibold">
                        Equipo
                      </th>
                      <th className="px-3 py-3 text-left font-semibold">
                        Puntos actuales
                      </th>
                      <th className="px-3 py-3 text-left font-semibold">
                        Puntos a sumar
                      </th>
                      <th className="px-3 py-3 text-left font-semibold">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {rows.map((row) => (
                      <tr key={row.registration.id}>
                        <td className="px-3 py-2 font-semibold text-slate-900">
                          {row.place}
                        </td>
                        <td className="px-3 py-2 text-slate-900">
                          {formatTeamName(row.registration)}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {row.pointsCurrent ?? "-"}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {row.pointsAdd}
                        </td>
                        <td className="px-3 py-2 text-slate-900">
                          {row.pointsTotal ?? "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

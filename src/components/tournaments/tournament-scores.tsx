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
  documentType: string;
  documentNumber: string;
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
  sport?: { id?: string; name?: string } | null;
};

type Match = {
  id: string;
  categoryId: string;
  groupName: string | null;
  stage: MatchStage | null;
  roundNumber: number | null;
  scheduledDate: string | null;
  startTime: string | null;
  games?: unknown;
  teamAId?: string | null;
  teamBId?: string | null;
  winnerSide?: "A" | "B" | null;
  outcomeType?: OutcomeType | null;
  outcomeSide?: "A" | "B" | null;
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

type Props = {
  tournamentId: string;
  tournamentName: string;
  onStatusChange?: (status: "WAITING" | "ACTIVE" | "FINISHED") => void;
  onCompletionChange?: (complete: boolean) => void;
  onUnlockStepNine?: () => void;
};

type StandingEntry = {
  id: string;
  categoryId: string;
  groupName: string;
  points: number;
  matchesPlayed: number;
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

const groupDrawTypes = new Set<DrawType>(["ROUND_ROBIN", "GROUPS_PLAYOFF"]);
const playoffDrawTypes = new Set<DrawType>(["PLAYOFF", "GROUPS_PLAYOFF"]);
const DEFAULT_TIEBREAKERS: Tiebreaker[] = [
  "SETS_DIFF",
  "MATCHES_WON",
  "POINTS_PER_MATCH",
  "POINTS_DIFF",
];
const TIEBREAKER_LABELS: Record<
  Tiebreaker,
  { title: string; description: string }
> = {
  POINTS_PER_MATCH: {
    title: "Puntos por partido",
    description: "Suma de puntos por victoria o derrota.",
  },
  SETS_DIFF: {
    title: "Diferencia de sets",
    description: "Sets ganados menos sets perdidos.",
  },
  POINTS_DIFF: {
    title: "Diferencia de puntos",
    description: "Puntos ganados menos puntos perdidos.",
  },
  MATCHES_WON: {
    title: "Partidos ganados",
    description: "Cantidad total de victorias.",
  },
};

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

const isFrontonCategory = (category?: Category | null) =>
  (category?.sport?.name ?? "").toLowerCase().includes("fronton");

const formatGroupTeamName = (
  registration: Registration | undefined,
  category?: Category | null
) => {
  if (!registration) return "N/D";
  const teamName = registration.teamName?.trim();
  if (teamName && isFrontonCategory(category)) {
    return teamName;
  }
  return formatTeamName(registration);
};

const getGroupKey = (value?: string | null) => value?.trim() || "A";

const isMatchComplete = (match: Match) => {
  const outcomeType = match.outcomeType ?? "PLAYED";
  if (outcomeType !== "PLAYED") {
    return Boolean(match.outcomeSide || match.winnerSide);
  }
  if (match.winnerSide) return true;
  return Array.isArray(match.games) && match.games.length > 0;
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

export default function TournamentScores({
  tournamentId,
  tournamentName,
  onStatusChange,
  onCompletionChange,
  onUnlockStepNine,
}: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [tournamentStatus, setTournamentStatus] = useState<
    "WAITING" | "ACTIVE" | "FINISHED"
  >("WAITING");
  const [sessionRole, setSessionRole] = useState<
    "ADMIN" | "TOURNAMENT_ADMIN"
  >("TOURNAMENT_ADMIN");
  const [groupPoints, setGroupPoints] = useState({
    winPoints: 0,
    winWithoutGameLossPoints: 0,
    lossPoints: 0,
    lossWithGameWinPoints: 0,
    tiebreakerOrder: [...DEFAULT_TIEBREAKERS],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/fixtures`, {
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as FixtureResponse;
    setLoading(false);
    if (!res.ok) {
      const detail = (data as { detail?: string })?.detail
        ? ` (${(data as { detail?: string }).detail})`
        : "";
      setError(
        `${(data as { error?: string })?.error ?? "No se pudo cargar la tabla de posiciones"}${detail}`
      );
      return;
    }

    setCategories(Array.isArray(data.categories) ? data.categories : []);
    setRegistrations(Array.isArray(data.registrations) ? data.registrations : []);
    setMatches(Array.isArray(data.matches) ? data.matches : []);
    if (data.tournamentStatus) {
      setTournamentStatus(data.tournamentStatus);
    }
    if (data.sessionRole) {
      setSessionRole(data.sessionRole);
    }
    if (data.groupPoints) {
      setGroupPoints({
        winPoints:
          typeof data.groupPoints.winPoints === "number"
            ? data.groupPoints.winPoints
            : 0,
        winWithoutGameLossPoints:
          typeof data.groupPoints.winWithoutGameLossPoints === "number"
            ? data.groupPoints.winWithoutGameLossPoints
            : 0,
        lossPoints:
          typeof data.groupPoints.lossPoints === "number"
            ? data.groupPoints.lossPoints
            : 0,
        lossWithGameWinPoints:
          typeof data.groupPoints.lossWithGameWinPoints === "number"
            ? data.groupPoints.lossWithGameWinPoints
            : 0,
        tiebreakerOrder: normalizeTiebreakerOrder(
          data.groupPoints.tiebreakerOrder
        ),
      });
    }
  };

  useEffect(() => {
    loadData();
  }, [tournamentId]);

  const registrationMap = useMemo(() => {
    const map = new Map<string, Registration>();
    registrations.forEach((registration) => map.set(registration.id, registration));
    return map;
  }, [registrations]);

  const groupCategories = useMemo(
    () =>
      categories.filter((category) =>
        groupDrawTypes.has(category.drawType ?? "ROUND_ROBIN")
      ),
    [categories]
  );

  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>();
    categories.forEach((category) => {
      map.set(category.id, category);
    });
    return map;
  }, [categories]);

  const allRoundRobin = useMemo(
    () =>
      categories.length > 0 &&
      categories.every((c) => (c.drawType ?? "ROUND_ROBIN") === "ROUND_ROBIN"),
    [categories]
  );

  const hasPlayoffCategories = useMemo(
    () => categories.some((c) => playoffDrawTypes.has(c.drawType ?? "ROUND_ROBIN")),
    [categories]
  );

  const groupCompleteByCategory = useMemo(() => {
    const map = new Map<string, boolean>();
    const matchesByCategory = new Map<string, Match[]>();
    matches
      .filter((match) => match.stage === "GROUP")
      .forEach((match) => {
        if (!matchesByCategory.has(match.categoryId)) {
          matchesByCategory.set(match.categoryId, []);
        }
        matchesByCategory.get(match.categoryId)?.push(match);
      });
    groupCategories.forEach((category) => {
      const list = matchesByCategory.get(category.id) ?? [];
      const hasRegistrations = registrations.some(
        (registration) => registration.categoryId === category.id
      );
      const complete =
        !hasRegistrations || (list.length > 0 && list.every(isMatchComplete));
      map.set(category.id, complete);
    });
    return map;
  }, [matches, groupCategories, registrations]);

  const allGroupMatchesComplete = useMemo(
    () =>
      groupCategories.length > 0 &&
      groupCategories.every(
        (category) => groupCompleteByCategory.get(category.id) === true
      ),
    [groupCategories, groupCompleteByCategory]
  );

  const allMatchesComplete = useMemo(() => {
    const relevantMatches = matches.filter((match) => {
      if (match.stage === "GROUP") return true;
      return Boolean(match.teamAId && match.teamBId);
    });
    return relevantMatches.length > 0 && relevantMatches.every(isMatchComplete);
  }, [matches]);

  useEffect(() => {
    if (!onCompletionChange) return;
    onCompletionChange(allRoundRobin && allGroupMatchesComplete);
  }, [allRoundRobin, allGroupMatchesComplete, onCompletionChange]);


  const standingsByCategory = useMemo(() => {
    const result = new Map<string, Map<string, StandingEntry[]>>();
    const entriesById = new Map<string, StandingEntry>();

    groupCategories.forEach((category) => {
      const categoryGroups = new Map<string, StandingEntry[]>();
      result.set(category.id, categoryGroups);
    });

    registrations.forEach((registration) => {
      if (!result.has(registration.categoryId)) return;
      const groupName = getGroupKey(registration.groupName);
      const createdAt = registration.createdAt
        ? new Date(registration.createdAt)
        : new Date(0);
      const entry: StandingEntry = {
        id: registration.id,
        categoryId: registration.categoryId,
        groupName,
        points: 0,
        matchesPlayed: 0,
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
      entriesById.set(registration.id, entry);
      const groupMap = result.get(registration.categoryId);
      if (!groupMap) return;
      if (!groupMap.has(groupName)) {
        groupMap.set(groupName, []);
      }
      groupMap.get(groupName)?.push(entry);
    });

    matches
      .filter((match) => match.stage === "GROUP")
      .forEach((match) => {
        if (!result.has(match.categoryId)) return;
        const teamA = match.teamAId ? entriesById.get(match.teamAId) : undefined;
        const teamB = match.teamBId ? entriesById.get(match.teamBId) : undefined;
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
          teamA.matchesPlayed += 1;
          teamB.matchesPlayed += 1;
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

        const games = parseGames(match.games);
        const resultMatch = computeMatchResult(games);
        if (resultMatch) {
          teamA.matchesPlayed += 1;
          teamB.matchesPlayed += 1;
          teamA.setsWon += resultMatch.setsA;
          teamA.setsLost += resultMatch.setsB;
          teamA.pointsWon += resultMatch.pointsA;
          teamA.pointsLost += resultMatch.pointsB;
          teamB.setsWon += resultMatch.setsB;
          teamB.setsLost += resultMatch.setsA;
          teamB.pointsWon += resultMatch.pointsB;
          teamB.pointsLost += resultMatch.pointsA;

          if (resultMatch.winner === "A") {
            teamA.matchesWon += 1;
            teamB.matchesLost += 1;
            const winPoints =
              resultMatch.setsB === 0
                ? groupPoints.winWithoutGameLossPoints
                : groupPoints.winPoints;
            teamA.points += winPoints;
            teamB.points +=
              resultMatch.setsB > 0
                ? groupPoints.lossWithGameWinPoints
                : groupPoints.lossPoints;
          } else {
            teamB.matchesWon += 1;
            teamA.matchesLost += 1;
            const winPoints =
              resultMatch.setsA === 0
                ? groupPoints.winWithoutGameLossPoints
                : groupPoints.winPoints;
            teamB.points += winPoints;
            teamA.points +=
              resultMatch.setsA > 0
                ? groupPoints.lossWithGameWinPoints
                : groupPoints.lossPoints;
          }
          return;
        }

        if (match.winnerSide) {
          teamA.matchesPlayed += 1;
          teamB.matchesPlayed += 1;
          if (match.winnerSide === "A") {
            teamA.matchesWon += 1;
            teamB.matchesLost += 1;
            teamA.points += groupPoints.winPoints;
            teamB.points += groupPoints.lossPoints;
          } else {
            teamB.matchesWon += 1;
            teamA.matchesLost += 1;
            teamB.points += groupPoints.winPoints;
            teamA.points += groupPoints.lossPoints;
          }
        }
      });

    result.forEach((groups) => {
      groups.forEach((entries, groupName) => {
        const ordered = [...entries].sort((a, b) =>
          compareStandings(a, b, groupPoints.tiebreakerOrder)
        );
        groups.set(groupName, ordered);
      });
    });

    return result;
  }, [groupCategories, registrations, matches, groupPoints]);

  const overallStandingsByCategory = useMemo(() => {
    const map = new Map<string, StandingEntry[]>();
    standingsByCategory.forEach((groups, categoryId) => {
      const entries = Array.from(groups.values()).flat();
      if (!entries.length) return;
      const ordered = [...entries].sort((a, b) =>
        compareStandings(a, b, groupPoints.tiebreakerOrder)
      );
      map.set(categoryId, ordered);
    });
    return map;
  }, [standingsByCategory, groupPoints.tiebreakerOrder]);

  if (loading) {
    return <p className="text-sm text-slate-500">Cargando posiciones...</p>;
  }

  return (
    <div className="space-y-8">
      <div className="admin-fade-up relative overflow-hidden rounded-[24px] border border-white/70 bg-white/80 p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/70 backdrop-blur">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-indigo-300/70 via-sky-300/60 to-amber-200/70" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-500">
              Paso 7
            </p>
            <h2 className="text-2xl font-semibold text-slate-900">
              Tabla de posiciones
            </h2>
            <p className="text-sm text-slate-600">
              Torneo: <span className="font-semibold">{tournamentName}</span>
            </p>
          </div>
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
            Posiciones
          </span>
        </div>
        <p className="mt-3 text-sm text-slate-600">
          Posiciones por grupo con sets y puntos acumulados.
        </p>
        {tournamentStatus === "ACTIVE" &&
          (sessionRole === "ADMIN" || sessionRole === "TOURNAMENT_ADMIN") &&
          allMatchesComplete &&
          onUnlockStepNine && (
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-200/70 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-900">
            <p className="text-sm font-semibold">
              Felicidades culminaste el torneo. Si quieres terminar, presiona en habilitar paso 9 y veras la tabla de posiciones generales de todos.
            </p>
            <button
              type="button"
              onClick={onUnlockStepNine}
              className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_16px_36px_-18px_rgba(5,150,105,0.55)] transition hover:bg-emerald-700"
            >
              Habilitar paso 9
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="admin-fade-up rounded-[24px] border border-white/70 bg-white/80 p-6 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/70 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                Puntos por partido
              </h3>
              <p className="text-sm text-slate-600">
                Reglas usadas para asignar puntos a cada jugador o equipo.
              </p>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              Grupos
            </span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Victoria sin perder cancha
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {groupPoints.winWithoutGameLossPoints}
              </p>
              <p className="text-xs text-slate-500">
                El rival no gana ningun set.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Victoria con cancha perdida
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {groupPoints.winPoints}
              </p>
              <p className="text-xs text-slate-500">
                El rival gana al menos un set.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Derrota con cancha ganada
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {groupPoints.lossWithGameWinPoints}
              </p>
              <p className="text-xs text-slate-500">
                El equipo pierde pero gana un set.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Derrota sin cancha
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {groupPoints.lossPoints}
              </p>
              <p className="text-xs text-slate-500">
                No gana ningun set.
              </p>
            </div>
          </div>
        </div>

        <div className="admin-fade-up rounded-[24px] border border-white/70 bg-white/80 p-6 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/70 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                Reglas de desempate
              </h3>
              <p className="text-sm text-slate-600">
                Orden configurado en el sorteo.
              </p>
            </div>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
              Orden
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {groupPoints.tiebreakerOrder.map((rule, index) => {
              const meta = TIEBREAKER_LABELS[rule];
              return (
                <div
                  key={`${rule}-${index}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white/90 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {meta?.title ?? rule}
                      </p>
                      <p className="text-xs text-slate-500">
                        {meta?.description ?? "Criterio de desempate"}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    #{index + 1}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {groupCategories.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          No hay categorias con grupos.
        </p>
      ) : (
        groupCategories.map((category) => {
          const groups = standingsByCategory.get(category.id);
          const groupEntries = groups
            ? Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]))
            : [];
          return (
            <div
              key={category.id}
              className="admin-fade-up space-y-4 rounded-[24px] border border-white/70 bg-white/80 p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/70 backdrop-blur"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    {category.name}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {category.abbreviation}
                  </p>
                </div>
                <span className="text-xs text-slate-500">
                  {groupEntries.length} grupos
                </span>
              </div>

              {groupEntries.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No hay inscritos para esta categoria.
                </p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {groupEntries.map(([groupName, entries]) => (
                    <div
                      key={`${category.id}-${groupName}`}
                      className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.25)]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="text-sm font-semibold text-slate-900">
                          Grupo {groupName}
                        </h4>
                        <span className="text-xs text-slate-500">
                          {entries.length} equipos
                        </span>
                      </div>
                      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200/70">
                        <div className="overflow-x-auto">
                          <table className="min-w-[760px] w-full divide-y divide-slate-200/70 text-[11px]">
                            <thead className="bg-slate-50/90 text-[10px] uppercase tracking-[0.2em] text-slate-500">
                            <tr>
                              <th className="px-2 py-2 text-left font-semibold">
                                Pos
                              </th>
                              <th className="px-2 py-2 text-left font-semibold">
                                Equipo
                              </th>
                              <th
                                className="px-2 py-2 text-center font-semibold"
                                title="Partidos jugados"
                              >
                                PJ
                              </th>
                              <th
                                className="px-2 py-2 text-center font-semibold"
                                title="Partidos ganados"
                              >
                                PG
                              </th>
                              <th
                                className="px-2 py-2 text-center font-semibold"
                                title="Partidos perdidos"
                              >
                                PP
                              </th>
                              <th
                                className="px-2 py-2 text-center font-semibold"
                                title="Puntos por partido"
                              >
                                Pts partido
                              </th>
                              <th
                                className="px-2 py-2 text-center font-semibold"
                                title="Sets ganados"
                              >
                                SG
                              </th>
                              <th
                                className="px-2 py-2 text-center font-semibold"
                                title="Sets perdidos"
                              >
                                SP
                              </th>
                              <th
                                className="px-2 py-2 text-center font-semibold"
                                title="Diferencia de sets"
                              >
                                DS
                              </th>
                              <th
                                className="px-2 py-2 text-center font-semibold"
                                title="Puntos a favor"
                              >
                                PF
                              </th>
                              <th
                                className="px-2 py-2 text-center font-semibold"
                                title="Puntos en contra"
                              >
                                PC
                              </th>
                              <th
                                className="px-2 py-2 text-center font-semibold"
                                title="Diferencia de puntos"
                              >
                                DP
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {entries.map((entry, index) => {
                              const registration = registrationMap.get(entry.id);
                              const category = categoryMap.get(entry.categoryId);
                              const setDiff = entry.setsWon - entry.setsLost;
                              const diff = entry.pointsWon - entry.pointsLost;
                              return (
                                <tr
                                  key={entry.id}
                                  className="transition hover:bg-slate-50/80"
                                >
                                  <td className="px-2 py-2 text-slate-500">
                                    {index + 1}
                                  </td>
                                  <td className="px-2 py-2 font-semibold text-slate-900">
                                    {formatGroupTeamName(registration, category)}
                                  </td>
                                  <td className="px-2 py-2 text-center text-slate-700 tabular-nums">
                                    {entry.matchesPlayed}
                                  </td>
                                  <td className="px-2 py-2 text-center text-slate-700 tabular-nums">
                                    {entry.matchesWon}
                                  </td>
                                  <td className="px-2 py-2 text-center text-slate-700 tabular-nums">
                                    {entry.matchesLost}
                                  </td>
                                  <td className="px-2 py-2 text-center font-semibold text-slate-900 tabular-nums">
                                    {entry.points}
                                  </td>
                                  <td className="px-2 py-2 text-center text-slate-700 tabular-nums">
                                    {entry.setsWon}
                                  </td>
                                  <td className="px-2 py-2 text-center text-slate-700 tabular-nums">
                                    {entry.setsLost}
                                  </td>
                                  <td className="px-2 py-2 text-center text-slate-700 tabular-nums">
                                    {setDiff}
                                  </td>
                                  <td className="px-2 py-2 text-center text-slate-700 tabular-nums">
                                    {entry.pointsWon}
                                  </td>
                                  <td className="px-2 py-2 text-center text-slate-700 tabular-nums">
                                    {entry.pointsLost}
                                  </td>
                                  <td className="px-2 py-2 text-center text-slate-700 tabular-nums">
                                    {diff}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}

      {allRoundRobin && (
        <div className="admin-fade-up rounded-[24px] border border-white/70 bg-white/80 p-6 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/70 backdrop-blur">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Tabla general
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              Solo grupos
            </span>
          </div>
          <div className="mt-4 space-y-4">
            {groupCategories.map((category) => {
              const isComplete = groupCompleteByCategory.get(category.id) === true;
              const rows = overallStandingsByCategory.get(category.id) ?? [];
              if (!isComplete) return null;
              return (
                <div
                  key={`overall-${category.id}`}
                  className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 shadow-[0_14px_36px_-28px_rgba(15,23,42,0.25)]"
                >
                  <div className="flex items-center justify-between gap-2 bg-slate-50/80 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {category.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {category.abbreviation}
                      </p>
                    </div>
                    <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-600">
                      General
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-[520px] divide-y divide-slate-200/70 text-sm">
                      <thead className="bg-slate-50/80 text-[11px] uppercase tracking-[0.2em] text-slate-500">
                        <tr>
                          <th className="px-2 py-2 text-left font-semibold">Pos</th>
                          <th className="px-2 py-2 text-left font-semibold">Equipo</th>
                          <th className="px-2 py-2 text-center font-semibold">Pts</th>
                          <th className="px-2 py-2 text-center font-semibold">PJ</th>
                          <th className="px-2 py-2 text-center font-semibold">PG</th>
                          <th className="px-2 py-2 text-center font-semibold">PP</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {rows.map((entry, index) => {
                        const registration = registrationMap.get(entry.id);
                        return (
                          <tr key={`overall-${entry.id}`}>
                            <td className="px-2 py-2 text-slate-500">{index + 1}</td>
                            <td className="px-2 py-2 font-semibold text-slate-900">
                              {formatGroupTeamName(registration, category)}
                            </td>
                            <td className="px-2 py-2 text-center font-semibold text-slate-900">
                              {entry.points}
                            </td>
                            <td className="px-2 py-2 text-center text-slate-700">
                              {entry.matchesPlayed}
                            </td>
                            <td className="px-2 py-2 text-center text-slate-700">
                              {entry.matchesWon}
                            </td>
                            <td className="px-2 py-2 text-center text-slate-700">
                              {entry.matchesLost}
                            </td>
                          </tr>
                        );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

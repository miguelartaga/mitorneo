"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";

type DrawType = "ROUND_ROBIN" | "GROUPS_PLAYOFF" | "PLAYOFF";
type MatchStage = "GROUP" | "PLAYOFF";
type Tiebreaker =
  | "SETS_DIFF"
  | "MATCHES_WON"
  | "POINTS_PER_MATCH"
  | "POINTS_DIFF";
type OutcomeType = "PLAYED" | "WALKOVER" | "INJURY";

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
  groupName?: string | null;
  seed?: number | null;
  rankingNumber?: number | null;
  createdAt?: string;
  player: Player;
  partner: Player | null;
  partnerTwo: Player | null;
  teamName?: string | null;
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

type Category = {
  id: string;
  name: string;
  abbreviation: string;
  drawType: DrawType | null;
  groupQualifiers?: number | null;
  sport?: { id?: string; name?: string } | null;
};

type Club = {
  id: string;
  name: string;
  courtsCount: number;
};

type ScheduleEntry = {
  date: string;
  startTime: string;
  endTime: string;
  matchDurationMinutes: number;
  breakMinutes: number;
};

type ScoreSet = {
  a: string;
  b: string;
  duration: string;
  tiebreakA: string;
  tiebreakB: string;
};

type Match = {
  id: string;
  categoryId: string;
  groupName: string | null;
  stage: MatchStage | null;
  winnerSide?: "A" | "B" | null;
  outcomeType?: OutcomeType | null;
  outcomeSide?: "A" | "B" | null;
  roundNumber: number | null;
  scheduledDate: string | null;
  startTime: string | null;
  games?: unknown;
  liveState?: { isLive?: boolean; pointScore?: { A?: string | null; B?: string | null } } | null;
  refereeToken?: string | null;
  teamAId?: string | null;
  teamBId?: string | null;
  clubId: string | null;
  courtNumber: number | null;
};

type FixtureResponse = {
  categories: Category[];
  registrations: Registration[];
  matches: Match[];
  playDays: string[];
  clubs: Club[];
  groupQualifiers?: { categoryId: string; groupName: string; qualifiers: number }[];
  groupPoints?: {
    winPoints?: number;
    winWithoutGameLossPoints?: number;
    lossPoints?: number;
    lossWithGameWinPoints?: number;
    tiebreakerOrder?: string[];
  };
};

type ScheduleResponse = {
  playDays: string[];
  schedules: ScheduleEntry[];
  schedulePublished?: boolean;
};

type Props = {
  tournamentId: string;
  tournamentName: string;
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

const buildRegistrationSearchText = (registration?: Registration | null) => {
  if (!registration) return "";
  const parts: string[] = [];
  const teamName = registration.teamName?.trim();
  if (teamName) parts.push(teamName);
  const players = [
    registration.player,
    registration.partner,
    registration.partnerTwo,
  ].filter(Boolean) as Player[];
  players.forEach((player) => {
    const fullName = `${player.firstName} ${player.lastName}`.trim();
    if (fullName) parts.push(fullName);
  });
  return parts.join(" ").toLowerCase();
};

const isMatchMarked = (match: Match) => {
  const hasGames = Array.isArray(match.games) && match.games.length > 0;
  const outcomeType = match.outcomeType ?? "PLAYED";
  const hasOutcome = outcomeType !== "PLAYED";
  return hasGames || hasOutcome;
};

const isMatchComplete = (match: Match) => {
  const outcomeType = match.outcomeType ?? "PLAYED";
  if (outcomeType !== "PLAYED") {
    return Boolean(match.outcomeSide || match.winnerSide);
  }
  if (match.winnerSide) return true;
  return Array.isArray(match.games) && match.games.length > 0;
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

const TENNIS_POINT_OPTIONS = ["0", "15", "30", "40", "Adv"];

const normalizeTennisPoint = (value?: string | null) => {
  if (!value) return "0";
  const upper = value.toUpperCase();
  if (upper === "AD" || upper === "ADV") return "Adv";
  return value;
};

const isFrontonCategory = (category?: Category | null) =>
  (category?.sport?.name ?? "").toLowerCase().includes("fronton");
const isTennisLikeSportName = (name?: string | null) => {
  const value = (name ?? "").toLowerCase();
  return value.includes("tenis") || value.includes("padel");
};

const emptyScoreSet = (): ScoreSet => ({
  a: "",
  b: "",
  duration: "",
  tiebreakA: "",
  tiebreakB: "",
});

const parseScoreSets = (value: unknown) => {
  if (!Array.isArray(value)) return [] as ScoreSet[];
  const sets: ScoreSet[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const aRaw = (entry as { a?: unknown }).a;
    const bRaw = (entry as { b?: unknown }).b;
    const durationRaw = (entry as { durationMinutes?: unknown }).durationMinutes;
    const tieARaw = (entry as { tiebreakA?: unknown }).tiebreakA;
    const tieBRaw = (entry as { tiebreakB?: unknown }).tiebreakB;
    const a = typeof aRaw === "number" ? String(aRaw) : "";
    const b = typeof bRaw === "number" ? String(bRaw) : "";
    const duration =
      typeof durationRaw === "number" ? String(durationRaw) : "";
    const tiebreakA = typeof tieARaw === "number" ? String(tieARaw) : "";
    const tiebreakB = typeof tieBRaw === "number" ? String(tieBRaw) : "";
    if (!a && !b && !duration && !tiebreakA && !tiebreakB) continue;
    sets.push({ a, b, duration, tiebreakA, tiebreakB });
  }
  return sets;
};

const parseOptionalInt = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return { value: null as number | null, valid: true };
  }
  if (!/^\d+$/.test(trimmed)) {
    return { value: null as number | null, valid: false };
  }
  const parsed = Number.parseInt(trimmed, 10);
  return { value: parsed, valid: Number.isFinite(parsed) };
};

const computeSetWins = (sets: ScoreSet[]) => {
  let winsA = 0;
  let winsB = 0;
  sets.forEach((set) => {
    const a = parseOptionalInt(set.a).value;
    const b = parseOptionalInt(set.b).value;
    if (a === null || b === null) return;
    if (a > b) winsA += 1;
    if (b > a) winsB += 1;
  });
  return { winsA, winsB };
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

const nextPowerOfTwo = (value: number) => {
  if (value <= 1) return 1;
  let size = 1;
  while (size < value) size *= 2;
  return size;
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

const getWinnerSide = (match?: Match | null) => {
  if (!match) return null;
  if (match.winnerSide === "A" || match.winnerSide === "B") {
    return match.winnerSide;
  }
  const outcomeType = match.outcomeType ?? "PLAYED";
  if (outcomeType !== "PLAYED") {
    if (match.outcomeSide === "A") return "B";
    if (match.outcomeSide === "B") return "A";
  }
  const result = computeMatchResult(parseGames(match.games));
  return result?.winner ?? null;
};

const formatMatchScore = (
  match?: Match | null,
  options?: { isTennisLike?: boolean; pointScore?: { A?: string | null; B?: string | null } }
) => {
  if (!match) return null;
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
  const result = computeMatchResult(games);
  const gamesText = games
    .map((game) => {
      const tiebreak =
        typeof game.tiebreakA === "number" && typeof game.tiebreakB === "number"
          ? `(${game.tiebreakA}-${game.tiebreakB})`
          : "";
      return `${game.a}-${game.b}${tiebreak}`;
    })
    .join(", ");
  if (!result) return gamesText;
  const base = `${result.setsA}-${result.setsB} (${gamesText})`;
  return base;
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

const parseTimeValue = (value: string) => {
  const parts = value.split(":");
  if (parts.length !== 2) return null;
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
};

const minutesToTime = (value: number) => {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const buildSlots = (entry?: ScheduleEntry) => {
  if (!entry) return [] as string[];
  const start = parseTimeValue(entry.startTime);
  const end = parseTimeValue(entry.endTime);
  if (start === null || end === null) return [];
  const slotLength = entry.matchDurationMinutes + entry.breakMinutes;
  if (slotLength <= 0) return [];
  const slots: string[] = [];
  let current = start;
  while (current + entry.matchDurationMinutes <= end) {
    slots.push(minutesToTime(current));
    current += slotLength;
  }
  return slots;
};

const buildSlotKey = (
  date: string,
  time: string,
  clubId: string,
  courtNumber: number
) => `${date}|${time}|${clubId}|${courtNumber}`;

const parseSlotKey = (key: string) => {
  const [date, time, clubId, courtNumberRaw] = key.split("|");
  const courtNumber = Number.parseInt(courtNumberRaw, 10);
  if (!date || !time || !clubId || !Number.isFinite(courtNumber)) {
    return null;
  }
  return { date, time, clubId, courtNumber };
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

export default function TournamentSchedule({ tournamentId, tournamentName }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [playDays, setPlayDays] = useState<string[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [groupQualifiers, setGroupQualifiers] = useState<
    { categoryId: string; groupName: string; qualifiers: number }[]
  >([]);
  const [scheduleEntries, setScheduleEntries] = useState<ScheduleEntry[]>([]);
  const [roundsPerDay, setRoundsPerDay] = useState<1 | 2>(1);
  const [groupPoints, setGroupPoints] = useState({
    winPoints: 0,
    winWithoutGameLossPoints: 0,
    lossPoints: 0,
    lossWithGameWinPoints: 0,
    tiebreakerOrder: [...DEFAULT_TIEBREAKERS],
  });
  const [loading, setLoading] = useState(false);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [schedulePublished, setSchedulePublished] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [updatingMatchId, setUpdatingMatchId] = useState<string | null>(null);
  const [draggingMatch, setDraggingMatch] = useState<{
    matchId: string;
    slotKey: string | null;
  } | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [scoreMatchId, setScoreMatchId] = useState<string | null>(null);
  const [scoreSets, setScoreSets] = useState<ScoreSet[]>([]);
  const [scorePointA, setScorePointA] = useState("0");
  const [scorePointB, setScorePointB] = useState("0");
  const [scoreWinner, setScoreWinner] = useState<"A" | "B" | null>(null);
  const [scoreOutcomeType, setScoreOutcomeType] = useState<OutcomeType>("PLAYED");
  const [scoreOutcomeSide, setScoreOutcomeSide] = useState<"A" | "B" | null>(
    null
  );
  const [scoreSaving, setScoreSaving] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [refereeMatchId, setRefereeMatchId] = useState<string | null>(null);
  const [refereeMessage, setRefereeMessage] = useState<string | null>(null);
  const [refereeError, setRefereeError] = useState<string | null>(null);
  const [playerSearch, setPlayerSearch] = useState("");
  const [matchStatusFilter, setMatchStatusFilter] = useState<
    "ALL" | "UNMARKED" | "MARKED"
  >("ALL");

  const toggleTeamDetails = (registrationId: string) => {
    setExpandedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(registrationId)) {
        next.delete(registrationId);
      } else {
        next.add(registrationId);
      }
      return next;
    });
  };

  const handleRefereeLink = async (match: Match) => {
    setRefereeMatchId(match.id);
    setRefereeMessage(null);
    setRefereeError(null);
    try {
      let token = match.refereeToken;
      if (!token) {
        const response = await fetch(
          `/api/tournaments/${tournamentId}/fixtures/matches/${match.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ generateRefereeToken: true }),
          }
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data?.error ?? "No se pudo crear el link del arbitro");
        }
        token = data?.match?.refereeToken ?? null;
        if (!token) {
          throw new Error("No se genero el token del arbitro");
        }
        setMatches((prev) =>
          prev.map((item) =>
            item.id === match.id ? { ...item, refereeToken: token } : item
          )
        );
      }

      const link = `${window.location.origin}/referee/${token}`;
      await navigator.clipboard.writeText(link);
      setRefereeMessage("Link del arbitro copiado");
    } catch (err) {
      setRefereeError(
        err instanceof Error ? err.message : "No se pudo copiar el link"
      );
    } finally {
      setRefereeMatchId(null);
    }
  };

  const handleDownloadPdf = async () => {
    if (downloadingPdf) return;
    setDownloadingPdf(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tournaments/${tournamentId}/fixtures?format=pdf`,
        {
          method: "GET",
          credentials: "include",
        }
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
      anchor.download = `fixture-${tournamentName || "torneo"}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo descargar el PDF");
    } finally {
      setDownloadingPdf(false);
    }
  };

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
        `${(data as { error?: string })?.error ?? "No se pudo cargar el calendario"}${detail}`
      );
      return;
    }

    setCategories(Array.isArray(data.categories) ? data.categories : []);
    setRegistrations(Array.isArray(data.registrations) ? data.registrations : []);
    setMatches(Array.isArray(data.matches) ? data.matches : []);
    setPlayDays(Array.isArray(data.playDays) ? data.playDays : []);
    setClubs(Array.isArray(data.clubs) ? data.clubs : []);
    setGroupQualifiers(
      Array.isArray(data.groupQualifiers) ? data.groupQualifiers : []
    );
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

  const loadSchedule = async () => {
    setLoadingSchedule(true);
    setError(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/schedule`, {
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as ScheduleResponse;
    setLoadingSchedule(false);
    if (!res.ok) {
      const detail = (data as { detail?: string })?.detail
        ? ` (${(data as { detail?: string }).detail})`
        : "";
      setError(
        `${(data as { error?: string })?.error ?? "No se pudieron cargar los horarios"}${detail}`
      );
      return;
    }

    setScheduleEntries(Array.isArray(data.schedules) ? data.schedules : []);
    if (Array.isArray(data.playDays) && data.playDays.length > 0) {
      setPlayDays(data.playDays);
    }
    setSchedulePublished(Boolean(data.schedulePublished));
  };

  useEffect(() => {
    loadData();
    loadSchedule();
  }, [tournamentId]);

  const registrationMap = useMemo(() => {
    const map = new Map<string, Registration>();
    registrations.forEach((registration) => {
      map.set(registration.id, registration);
    });
    return map;
  }, [registrations]);

  const qualifiersByGroup = useMemo(() => {
    const map = new Map<string, number>();
    groupQualifiers.forEach((entry) => {
      const key = `${entry.categoryId}:${(entry.groupName || "A").trim() || "A"}`;
      map.set(key, entry.qualifiers);
    });
    return map;
  }, [groupQualifiers]);

  const playoffLabelMap = useMemo(() => {
    const labelMap = new Map<string, string>();
    if (registrations.length === 0) return labelMap;

    const standings = new Map<string, StandingEntry>();
    registrations.forEach((registration) => {
      const createdAt = registration.createdAt
        ? new Date(registration.createdAt)
        : new Date(0);
      standings.set(registration.id, {
        id: registration.id,
        categoryId: registration.categoryId,
        groupName: registration.groupName?.trim() || "A",
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
        const teamA = match.teamAId ? standings.get(match.teamAId) : undefined;
        const teamB = match.teamBId ? standings.get(match.teamBId) : undefined;
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
          const winPoints =
            result.setsB === 0
              ? groupPoints.winWithoutGameLossPoints
              : groupPoints.winPoints;
          teamA.points += winPoints;
          teamB.points +=
            result.setsB > 0
              ? groupPoints.lossWithGameWinPoints
              : groupPoints.lossPoints;
        } else {
          teamB.matchesWon += 1;
          teamA.matchesLost += 1;
          const winPoints =
            result.setsA === 0
              ? groupPoints.winWithoutGameLossPoints
              : groupPoints.winPoints;
          teamB.points += winPoints;
          teamA.points +=
            result.setsA > 0
              ? groupPoints.lossWithGameWinPoints
              : groupPoints.lossPoints;
        }
      });

    const byCategory = new Map<string, Map<string, StandingEntry[]>>();
    standings.forEach((entry) => {
      if (!byCategory.has(entry.categoryId)) {
        byCategory.set(entry.categoryId, new Map());
      }
      const categoryGroups = byCategory.get(entry.categoryId);
      if (!categoryGroups) return;
      if (!categoryGroups.has(entry.groupName)) {
        categoryGroups.set(entry.groupName, []);
      }
      categoryGroups.get(entry.groupName)?.push(entry);
    });

    byCategory.forEach((groups) => {
      groups.forEach((entries, groupName) => {
        const ordered = [...entries].sort((a, b) =>
          compareStandings(a, b, groupPoints.tiebreakerOrder)
        );
        ordered.forEach((entry, index) => {
          const position = index + 1;
          labelMap.set(entry.id, `${formatOrdinal(position)} Grupo ${groupName}`);
        });
      });
    });

    return labelMap;
  }, [registrations, matches, groupPoints]);

const renderTeamDisplay = (
  label: string | null | undefined,
  registration: Registration | undefined,
  showNames: boolean,
  category?: Category | null,
  expandedTeams?: Set<string>,
  onToggle?: (registrationId: string) => void,
  tone?: "winner" | "loser" | null
) => {
  const name = formatTeamName(registration);
  if (!showNames || name === "N/D") {
    return label ? (
      <span className="text-[11px] font-semibold text-slate-500">{label}</span>
    ) : (
      <span>{name}</span>
    );
  }
  const teamName = registration?.teamName?.trim();
  const isFronton = isFrontonCategory(category);
  const showTeamToggle = Boolean(teamName && isFronton && registration);
  const playersLabel = registration
    ? [registration.player, registration.partner, registration.partnerTwo]
        .filter(Boolean)
        .map((player) => `${player.firstName} ${player.lastName}`.trim())
        .join(" / ")
    : "";
  const displayName =
    showTeamToggle && teamName ? teamName : formatTeamName(registration);
  const isExpanded =
    showTeamToggle && registration ? expandedTeams?.has(registration.id) : false;
  const toneClass =
    tone === "winner"
      ? "text-emerald-600 font-semibold"
      : tone === "loser"
        ? "text-slate-400"
        : "text-slate-900";
  return (
    <div className="flex flex-col leading-tight">
      {label && (
        <span className="text-[11px] font-semibold text-slate-500">{label}</span>
      )}
      <div className="flex items-center gap-2">
        <span className={toneClass}>{displayName}</span>
        {showTeamToggle && registration && onToggle && (
          <button
            type="button"
            onClick={() => onToggle(registration.id)}
            className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-500 transition hover:border-slate-300 hover:bg-slate-50"
            aria-label="Ver jugadores"
          >
            {isExpanded ? "v" : ">"}
          </button>
        )}
      </div>
      {showTeamToggle && isExpanded && playersLabel && (
        <span className="text-xs text-slate-500">{playersLabel}</span>
      )}
    </div>
  );
};

  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>();
    categories.forEach((category) => {
      map.set(category.id, category);
    });
    return map;
  }, [categories]);

  const groupStageCompleteByCategory = useMemo(() => {
    const map = new Map<string, boolean>();
    const groupMatchesByCategory = new Map<string, Match[]>();
    matches
      .filter((match) => match.stage === "GROUP")
      .forEach((match) => {
        if (!groupMatchesByCategory.has(match.categoryId)) {
          groupMatchesByCategory.set(match.categoryId, []);
        }
        groupMatchesByCategory.get(match.categoryId)?.push(match);
      });

    groupMatchesByCategory.forEach((list, categoryId) => {
      const allComplete =
        list.length > 0 && list.every((match) => isMatchComplete(match));
      map.set(categoryId, allComplete);
    });

    return map;
  }, [matches]);

  const qualifiedCountByCategory = useMemo(() => {
    const map = new Map<string, number>();
    categories.forEach((category) => {
      if (category.drawType === "PLAYOFF") {
        const count = registrations.filter(
          (registration) => registration.categoryId === category.id
        ).length;
        map.set(category.id, count);
        return;
      }
      if (category.drawType !== "GROUPS_PLAYOFF") return;
      const categoryRegistrations = registrations.filter(
        (registration) => registration.categoryId === category.id
      );
      const groupCounts = new Map<string, number>();
      categoryRegistrations.forEach((registration) => {
        const groupName = (registration.groupName || "A").trim() || "A";
        groupCounts.set(groupName, (groupCounts.get(groupName) ?? 0) + 1);
      });
      let total = 0;
      const defaultQualifiers =
        typeof category.groupQualifiers === "number" &&
        category.groupQualifiers > 0
          ? category.groupQualifiers
          : 2;
      groupCounts.forEach((count, groupName) => {
        const qualifiers =
          qualifiersByGroup.get(`${category.id}:${groupName}`) ??
          defaultQualifiers;
        total += Math.min(count, Math.max(1, qualifiers));
      });
      map.set(category.id, total);
    });
    return map;
  }, [categories, registrations, qualifiersByGroup]);

  const playoffRoundLabels = useMemo(() => {
    const map = new Map<string, Map<number, string>>();
    const byCategory = new Map<string, Match[]>();
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
      const bracketSize =
        qualifiedCount > 1 ? nextPowerOfTwo(qualifiedCount) : 0;
      if (bracketSize < 2) return;

      const labelMap = new Map<number, string>();
      rounds.forEach((round) => {
        const roundSize = Math.round(
          bracketSize / 2 ** (round - (rounds[0] ?? 1))
        );
        labelMap.set(round, formatPlayoffRoundLabel(roundSize, round));
      });
      map.set(categoryId, labelMap);
    });

    return map;
  }, [matches, qualifiedCountByCategory]);

  const getPlayoffRoundLabel = (
    categoryId: string,
    roundNumber: number | null | undefined
  ) => {
    const round = roundNumber ?? 1;
    const label = playoffRoundLabels.get(categoryId)?.get(round);
    return label ?? `Ronda ${round}`;
  };

  const scheduleMap = useMemo(() => {
    const map = new Map<string, ScheduleEntry>();
    scheduleEntries.forEach((entry) => {
      map.set(entry.date, entry);
    });
    return map;
  }, [scheduleEntries]);

  const scheduleDays = useMemo(() => {
    if (playDays.length > 0) return [...playDays];
    return Array.from(scheduleMap.keys()).sort();
  }, [playDays, scheduleMap]);

  const [activeScheduleDay, setActiveScheduleDay] = useState<string | null>(null);

  useEffect(() => {
    if (scheduleDays.length === 0) {
      setActiveScheduleDay(null);
      return;
    }
    if (!activeScheduleDay || !scheduleDays.includes(activeScheduleDay)) {
      setActiveScheduleDay(scheduleDays[0]);
    }
  }, [scheduleDays, activeScheduleDay]);

  const courts = useMemo(() => {
    const list: { clubId: string; clubName: string; courtNumber: number }[] = [];
    clubs.forEach((club) => {
      for (let index = 1; index <= club.courtsCount; index += 1) {
        list.push({
          clubId: club.id,
          clubName: club.name,
          courtNumber: index,
        });
      }
    });
    return list;
  }, [clubs]);

  const matchSlotKey = (match: Match) => {
    if (!match.scheduledDate || !match.startTime || !match.clubId) return null;
    if (!match.courtNumber || match.courtNumber < 1) return null;
    return buildSlotKey(
      match.scheduledDate,
      match.startTime,
      match.clubId,
      match.courtNumber
    );
  };

  const isByeMatch = (match?: Match | null) => {
    if (!match) return false;
    if (match.stage !== "PLAYOFF" || match.isBronzeMatch) return false;
    const round = match.roundNumber ?? 1;
    if (round !== 1) return false;
    const hasA = Boolean(match.teamAId);
    const hasB = Boolean(match.teamBId);
    return (hasA && !hasB) || (hasB && !hasA);
  };

  const normalizedPlayerSearch = playerSearch.trim().toLowerCase();
  const isFiltering =
    normalizedPlayerSearch.length > 0 || matchStatusFilter !== "ALL";

  const matchesBySlot = useMemo(() => {
    const map = new Map<string, Match>();
    matches.forEach((match) => {
      if (isByeMatch(match)) return;
      const key = matchSlotKey(match);
      if (key) {
        map.set(key, match);
      }
    });
    return map;
  }, [matches]);

  const unscheduledMatches = useMemo(
    () => matches.filter((match) => !matchSlotKey(match) && !isByeMatch(match)),
    [matches]
  );

  const filteredMatches = useMemo(() => {
    return matches.filter((match) => {
      if (matchStatusFilter !== "ALL") {
        const marked = isMatchMarked(match);
        if (matchStatusFilter === "MARKED" && !marked) return false;
        if (matchStatusFilter === "UNMARKED" && marked) return false;
      }
      if (!normalizedPlayerSearch) return true;
      const teamA = match.teamAId
        ? registrationMap.get(match.teamAId)
        : null;
      const teamB = match.teamBId
        ? registrationMap.get(match.teamBId)
        : null;
      const searchText = `${buildRegistrationSearchText(
        teamA
      )} ${buildRegistrationSearchText(teamB)}`.trim();
      if (!searchText) return false;
      return searchText.includes(normalizedPlayerSearch);
    });
  }, [matches, matchStatusFilter, normalizedPlayerSearch, registrationMap]);

  const filteredMatchesBySlot = useMemo(() => {
    const map = new Map<string, Match>();
    filteredMatches.forEach((match) => {
      if (isByeMatch(match)) return;
      const key = matchSlotKey(match);
      if (key) {
        map.set(key, match);
      }
    });
    return map;
  }, [filteredMatches]);

  const filteredUnscheduledMatches = useMemo(
    () =>
      filteredMatches.filter(
        (match) => !matchSlotKey(match) && !isByeMatch(match)
      ),
    [filteredMatches]
  );

  const slotsByDay = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        date: string;
        time: string;
        clubId: string;
        clubName: string;
        courtNumber: number;
      }[]
    >();
    scheduleDays.forEach((day) => {
      const entry = scheduleMap.get(day);
      const slots = buildSlots(entry);
      const daySlots = slots.flatMap((time) =>
        courts.map((court) => ({
          key: buildSlotKey(day, time, court.clubId, court.courtNumber),
          date: day,
          time,
          clubId: court.clubId,
          clubName: court.clubName,
          courtNumber: court.courtNumber,
        }))
      );
      map.set(day, daySlots);
    });
    return map;
  }, [scheduleDays, scheduleMap, courts]);

  const visibleScheduleDays = useMemo(() => {
    if (!isFiltering) return scheduleDays;
    const daysWithMatches = new Set<string>();
    filteredMatches.forEach((match) => {
      if (match.scheduledDate) {
        daysWithMatches.add(match.scheduledDate);
      }
    });
    return scheduleDays.filter((day) => daysWithMatches.has(day));
  }, [filteredMatches, isFiltering, scheduleDays]);

  const scoreMatch = useMemo(
    () => matches.find((match) => match.id === scoreMatchId) ?? null,
    [matches, scoreMatchId]
  );
  const scoreCategory = scoreMatch
    ? categoryMap.get(scoreMatch.categoryId)
    : undefined;
  const isScoreTennisLike = isTennisLikeSportName(scoreCategory?.sport?.name);

  const scoreTeamA = scoreMatch?.teamAId
    ? registrationMap.get(scoreMatch.teamAId)
    : undefined;
  const scoreTeamB = scoreMatch?.teamBId
    ? registrationMap.get(scoreMatch.teamBId)
    : undefined;

  const scoreSetWins = useMemo(() => computeSetWins(scoreSets), [scoreSets]);

  useEffect(() => {
    if (scoreOutcomeType === "PLAYED") return;
    if (scoreOutcomeSide === "A") {
      setScoreWinner("B");
    } else if (scoreOutcomeSide === "B") {
      setScoreWinner("A");
    } else {
      setScoreWinner(null);
    }
  }, [scoreOutcomeType, scoreOutcomeSide]);

  const openScoreModal = (match: Match) => {
    const initial = parseScoreSets(match.games);
    const initialWins = computeSetWins(initial);
    const inferredWinner =
      initialWins.winsA === initialWins.winsB
        ? null
        : initialWins.winsA > initialWins.winsB
        ? "A"
        : "B";
    const outcomeType = match.outcomeType ?? "PLAYED";
    setScoreSets(initial.length > 0 ? initial : [emptyScoreSet()]);
    setScoreMatchId(match.id);
    setScoreOutcomeType(outcomeType);
    setScoreOutcomeSide(match.outcomeSide ?? null);
    setScoreWinner(match.winnerSide ?? inferredWinner);
    const pointScore = match.liveState?.pointScore ?? {};
    setScorePointA(normalizeTennisPoint(pointScore.A));
    setScorePointB(normalizeTennisPoint(pointScore.B));
    setScoreError(null);
  };

  const closeScoreModal = () => {
    setScoreMatchId(null);
    setScoreSets([]);
    setScorePointA("0");
    setScorePointB("0");
    setScoreWinner(null);
    setScoreOutcomeType("PLAYED");
    setScoreOutcomeSide(null);
    setScoreError(null);
  };

  const handleSetCountChange = (value: number) => {
    const count = Math.min(5, Math.max(1, Math.floor(value)));
    setScoreSets((prev) => {
      const next = [...prev];
      while (next.length < count) {
        next.push(emptyScoreSet());
      }
      return next.slice(0, count);
    });
  };

  const updateScoreSet = (
    index: number,
    field: keyof ScoreSet,
    value: string
  ) => {
    setScoreSets((prev) =>
      prev.map((set, idx) =>
        idx === index ? { ...set, [field]: value } : set
      )
    );
  };

  const handleSaveScore = async () => {
    if (!scoreMatch) return;
    setScoreSaving(true);
    setScoreError(null);

    const payload: {
      a: number;
      b: number;
      durationMinutes?: number;
      tiebreakA?: number;
      tiebreakB?: number;
    }[] = [];
    for (let index = 0; index < scoreSets.length; index += 1) {
      const set = scoreSets[index];
      const aParsed = parseOptionalInt(set.a);
      const bParsed = parseOptionalInt(set.b);
      const durationParsed = parseOptionalInt(set.duration);
      const tiebreakAParsed = parseOptionalInt(set.tiebreakA);
      const tiebreakBParsed = parseOptionalInt(set.tiebreakB);
      if (!aParsed.valid || !bParsed.valid) {
        setScoreError(`Puntaje invalido en el set ${index + 1}`);
        setScoreSaving(false);
        return;
      }
      if (!durationParsed.valid) {
        setScoreError(`Duracion invalida en el set ${index + 1}`);
        setScoreSaving(false);
        return;
      }
      if (!tiebreakAParsed.valid || !tiebreakBParsed.valid) {
        setScoreError(`Tiebreak invalido en el set ${index + 1}`);
        setScoreSaving(false);
        return;
      }
      const hasAny =
        aParsed.value !== null ||
        bParsed.value !== null ||
        durationParsed.value !== null ||
        tiebreakAParsed.value !== null ||
        tiebreakBParsed.value !== null;
      if (!hasAny) continue;
      if (aParsed.value === null || bParsed.value === null) {
        setScoreError(`Completa los puntos del set ${index + 1}`);
        setScoreSaving(false);
        return;
      }
      if (
        (tiebreakAParsed.value === null) !== (tiebreakBParsed.value === null)
      ) {
        setScoreError(`Completa el tiebreak del set ${index + 1}`);
        setScoreSaving(false);
        return;
      }
      const entry: {
        a: number;
        b: number;
        durationMinutes?: number;
        tiebreakA?: number;
        tiebreakB?: number;
      } = {
        a: aParsed.value,
        b: bParsed.value,
      };
      if (durationParsed.value !== null) {
        entry.durationMinutes = durationParsed.value;
      }
      if (tiebreakAParsed.value !== null && tiebreakBParsed.value !== null) {
        entry.tiebreakA = tiebreakAParsed.value;
        entry.tiebreakB = tiebreakBParsed.value;
      }
      payload.push(entry);
    }

    const inferredWinner =
      scoreSetWins.winsA === scoreSetWins.winsB
        ? null
        : scoreSetWins.winsA > scoreSetWins.winsB
        ? "A"
        : "B";
    const outcomeType = scoreOutcomeType ?? "PLAYED";
    const outcomeSide = outcomeType === "PLAYED" ? null : scoreOutcomeSide;
    let winnerSide = inferredWinner;
    if (outcomeType !== "PLAYED") {
      if (!outcomeSide) {
        setScoreError("Selecciona el equipo afectado");
        setScoreSaving(false);
        return;
      }
      winnerSide = outcomeSide === "A" ? "B" : "A";
    }

    try {
      const res = await fetch(
        `/api/tournaments/${tournamentId}/fixtures/matches/${scoreMatch.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            games: payload.length > 0 ? payload : null,
            winnerSide: winnerSide ?? null,
            outcomeType,
            outcomeSide,
            ...(isScoreTennisLike
              ? {
                  liveState: {
                    ...(scoreMatch.liveState ?? {}),
                    pointScore: {
                      A: scorePointA,
                      B: scorePointB,
                    },
                  },
                }
              : {}),
          }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const detail = data?.detail ? ` (${data.detail})` : "";
        throw new Error(data?.error ?? `No se pudo guardar el marcador${detail}`);
      }
      await loadData();
      setMessage("Marcador actualizado");
      closeScoreModal();
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : undefined;
      setScoreError(detail ?? "No se pudo guardar el marcador");
    } finally {
      setScoreSaving(false);
    }
  };

  const updateMatchSchedule = async (
    matchId: string,
    payload: {
      scheduledDate: string | null;
      startTime: string | null;
      clubId: string | null;
      courtNumber: number | null;
    }
  ) => {
    setUpdatingMatchId(matchId);
    const res = await fetch(
      `/api/tournaments/${tournamentId}/fixtures/matches/${matchId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      }
    );

    setUpdatingMatchId(null);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const detail = data?.detail ? ` (${data.detail})` : "";
      throw new Error(data?.error ?? `No se pudo mover el partido${detail}`);
    }
  };

  const handleMatchDragStart = (event: DragEvent, match: Match) => {
    const slotKey = matchSlotKey(match);
    setDraggingMatch({ matchId: match.id, slotKey });
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", match.id);
  };

  const handleDragEnd = () => {
    setDraggingMatch(null);
    setDragOverSlot(null);
  };

  const handleSlotDragOver = (event: DragEvent, slotKey: string) => {
    if (!draggingMatch) return;
    event.preventDefault();
    if (dragOverSlot !== slotKey) {
      setDragOverSlot(slotKey);
    }
  };

  const handleSlotDrop = async (event: DragEvent, slotKey: string) => {
    event.preventDefault();
    const draggedId =
      draggingMatch?.matchId || event.dataTransfer.getData("text/plain");
    if (!draggedId) return;
    const draggedMatchValue = matches.find((match) => match.id === draggedId);
    if (!draggedMatchValue) return;
    const targetSlot = parseSlotKey(slotKey);
    if (!targetSlot) return;
    const targetMatch = matchesBySlot.get(slotKey);
    const sourceSlot = draggingMatch?.slotKey
      ? parseSlotKey(draggingMatch.slotKey)
      : null;
    setError(null);
    setMessage(null);

    try {
      await updateMatchSchedule(draggedMatchValue.id, {
        scheduledDate: targetSlot.date,
        startTime: targetSlot.time,
        clubId: targetSlot.clubId,
        courtNumber: targetSlot.courtNumber,
      });

      if (targetMatch && targetMatch.id !== draggedMatchValue.id) {
        if (sourceSlot) {
          await updateMatchSchedule(targetMatch.id, {
            scheduledDate: sourceSlot.date,
            startTime: sourceSlot.time,
            clubId: sourceSlot.clubId,
            courtNumber: sourceSlot.courtNumber,
          });
        } else {
          await updateMatchSchedule(targetMatch.id, {
            scheduledDate: null,
            startTime: null,
            clubId: null,
            courtNumber: null,
          });
        }
      }

      await loadData();
      setMessage("Horario actualizado");
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : undefined;
      setError(detail ?? "No se pudo mover el partido");
      await loadData();
    } finally {
      setDraggingMatch(null);
      setDragOverSlot(null);
    }
  };

  const handleUnscheduledDrop = async (event: DragEvent) => {
    event.preventDefault();
    const draggedId =
      draggingMatch?.matchId || event.dataTransfer.getData("text/plain");
    if (!draggedId) return;
    setError(null);
    setMessage(null);
    try {
      await updateMatchSchedule(draggedId, {
        scheduledDate: null,
        startTime: null,
        clubId: null,
        courtNumber: null,
      });
      await loadData();
      setMessage("Horario quitado");
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : undefined;
      setError(detail ?? "No se pudo quitar el horario");
      await loadData();
    } finally {
      setDraggingMatch(null);
      setDragOverSlot(null);
    }
  };

  const handleGenerateSchedule = async () => {
    setGenerating(true);
    setError(null);
    setMessage(null);

    const res = await fetch(`/api/tournaments/${tournamentId}/fixtures/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ roundsPerDay }),
    });

    const data = await res.json().catch(() => ({}));
    setGenerating(false);

    if (!res.ok) {
      const detail = data?.detail ? ` (${data.detail})` : "";
      setError(`${data?.error ?? "No se pudo generar el calendario"}${detail}`);
      return;
    }

    await loadData();
    setMessage("Calendario generado");
  };

  const handleTogglePublish = async () => {
    if (publishing) return;
    setPublishing(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/schedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ schedulePublished: !schedulePublished }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = data?.error ? ` (${data.error})` : "";
        throw new Error(`No se pudo actualizar${detail}`);
      }
      setSchedulePublished(Boolean(data.schedulePublished));
      setMessage(
        !schedulePublished ? "Calendario publicado" : "Calendario oculto"
      );
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : undefined;
      setError(detail ?? "No se pudo actualizar el calendario");
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Cargando calendario...</p>;
  }

  return (
    <div className="space-y-8">
      <style jsx global>{`
        @media print {
          .print-hidden {
            display: none !important;
          }
          .print-only {
            display: block !important;
          }
          .print-hide-row {
            display: none !important;
          }
          .print-area {
            box-shadow: none !important;
            border: 0 !important;
          }
          .print-table {
            font-size: 10px !important;
          }
          .print-table th,
          .print-table td {
            padding: 6px 8px !important;
            white-space: nowrap !important;
          }
          .print-table td:last-child,
          .print-table th:last-child {
            padding-right: 12px !important;
          }
          body {
            background: #ffffff !important;
          }
        }
        .print-only {
          display: none;
        }
      `}</style>
      <div className="admin-fade-up relative overflow-hidden rounded-[24px] border border-white/70 bg-white/80 p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/70 backdrop-blur">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-indigo-300/70 via-sky-300/60 to-amber-200/70" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-500">
              Paso 6
            </p>
            <h2 className="text-2xl font-semibold text-slate-900">
              Calendario de partidos
            </h2>
            <p className="text-sm text-slate-600">
              Torneo: <span className="font-semibold">{tournamentName}</span>
            </p>
          </div>
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
            Agenda
          </span>
        </div>
        <p className="mt-3 text-sm text-slate-600">
          Define si se juega una o dos rondas por dia y genera el horario con
          playoff en los ultimos dos dias.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3 print-hidden">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Rondas por dia
            </span>
            <select
              value={roundsPerDay}
              onChange={(e) =>
                setRoundsPerDay(e.target.value === "2" ? 2 : 1)
              }
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="1">1 ronda</option>
              <option value="2">2 rondas</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600">
              {schedulePublished ? "Calendario publicado" : "Calendario oculto"}
            </span>
            <button
              type="button"
              onClick={handleTogglePublish}
              disabled={publishing}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {publishing
                ? "Actualizando..."
                : schedulePublished
                ? "Ocultar"
                : "Publicar"}
            </button>
          </div>
          <button
            type="button"
            onClick={handleGenerateSchedule}
            disabled={generating}
            className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-[0_14px_32px_-18px_rgba(79,70,229,0.45)] transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {generating ? "Generando..." : "Generar calendario"}
          </button>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            {downloadingPdf ? "Descargando..." : "Descargar fixture (PDF)"}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 print-hidden">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Filtro jugador
            </span>
            <input
              value={playerSearch}
              onChange={(event) => setPlayerSearch(event.target.value)}
              placeholder="Nombre del jugador"
              className="w-56 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Estado
            </span>
            <select
              value={matchStatusFilter}
              onChange={(event) =>
                setMatchStatusFilter(
                  event.target.value as "ALL" | "UNMARKED" | "MARKED"
                )
              }
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="ALL">Todos</option>
              <option value="UNMARKED">Sin marcar</option>
              <option value="MARKED">Marcados</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => {
              setPlayerSearch("");
              setMatchStatusFilter("ALL");
            }}
            disabled={!isFiltering}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
          >
            Limpiar filtros
          </button>
        </div>
      </div>

      {matches.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          No hay partidos generados todavia.
        </p>
      ) : (
        <div className="space-y-8">
          <div className="admin-fade-up overflow-hidden rounded-[24px] border border-slate-200/70 bg-white/90 p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.35)] print-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Partidos sin horario
                </h3>
                <p className="text-sm text-slate-500">
                  Arrastra un partido a un horario disponible.
                </p>
              </div>
              <span className="text-xs text-slate-500">
                {isFiltering
                  ? `${filteredUnscheduledMatches.length} de ${unscheduledMatches.length} sin horario`
                  : `${unscheduledMatches.length} sin horario`}
              </span>
            </div>
            <div
              onDragOver={(event) => {
                if (!draggingMatch) return;
                event.preventDefault();
                if (dragOverSlot !== "UNSCHEDULED") {
                  setDragOverSlot("UNSCHEDULED");
                }
              }}
              onDragLeave={() => {
                if (dragOverSlot === "UNSCHEDULED") {
                  setDragOverSlot(null);
                }
              }}
              onDrop={handleUnscheduledDrop}
              className={`mt-4 rounded-2xl border border-dashed px-4 py-4 ${
                dragOverSlot === "UNSCHEDULED"
                  ? "border-indigo-400 bg-indigo-50/70"
                  : "border-slate-200/70 bg-slate-50/70"
              }`}
            >
              {filteredUnscheduledMatches.length === 0 ? (
                <p className="text-sm text-slate-500">
                  {isFiltering
                    ? "No hay partidos sin horario con los filtros actuales."
                    : "Todos los partidos tienen horario asignado."}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200/70 bg-white">
                  <table className="min-w-[640px] divide-y divide-slate-200/70 text-xs">
                    <thead className="bg-slate-50/80 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                      <tr>
                        <th className="px-3 py-3 text-left font-semibold">
                          Categoria
                        </th>
                        <th className="px-3 py-3 text-left font-semibold">
                          Grupo
                        </th>
                        <th className="px-3 py-3 text-left font-semibold">
                          Equipo 1
                        </th>
                        <th className="px-3 py-3 text-center font-semibold">
                          VS
                        </th>
                        <th className="px-3 py-3 text-left font-semibold">
                          Equipo 2
                        </th>
                        <th className="px-3 py-3 text-left font-semibold">
                          Marcador
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredUnscheduledMatches.map((match) => {
                        const category = categoryMap.get(match.categoryId);
                        const teamA = match.teamAId
                          ? registrationMap.get(match.teamAId)
                          : undefined;
                        const teamB = match.teamBId
                          ? registrationMap.get(match.teamBId)
                          : undefined;
                        const showPlayoffLabel =
                          match.stage === "PLAYOFF" &&
                          category?.drawType === "GROUPS_PLAYOFF";
                        const teamALabel = showPlayoffLabel
                          ? match.teamAId
                            ? playoffLabelMap.get(match.teamAId)
                            : null
                          : null;
                        const teamBLabel = showPlayoffLabel
                          ? match.teamBId
                            ? playoffLabelMap.get(match.teamBId)
                            : null
                          : null;
                        const winnerSide = getWinnerSide(match);
                        const teamATone =
                          winnerSide === "A"
                            ? "winner"
                            : winnerSide === "B"
                              ? "loser"
                              : null;
                        const teamBTone =
                          winnerSide === "B"
                            ? "winner"
                            : winnerSide === "A"
                              ? "loser"
                              : null;
                        const groupLabel =
                          match.stage === "PLAYOFF"
                            ? match.isBronzeMatch
                              ? "Bronce"
                              : getPlayoffRoundLabel(
                                  match.categoryId,
                                  match.roundNumber
                                )
                            : match.groupName ?? "-";
                        const teamADisplay = match.teamAId
                          ? renderTeamDisplay(
                              showPlayoffLabel ? teamALabel : null,
                              teamA,
                              !showPlayoffLabel ||
                                (groupStageCompleteByCategory.get(
                                  match.categoryId
                                ) ??
                                  false),
                              category,
                              expandedTeams,
                              toggleTeamDetails,
                              teamATone
                            )
                          : (
                              <span className="text-xs text-slate-400">
                                Por definir
                              </span>
                            );
                        const teamBDisplay = match.teamBId
                          ? renderTeamDisplay(
                              showPlayoffLabel ? teamBLabel : null,
                              teamB,
                              !showPlayoffLabel ||
                                (groupStageCompleteByCategory.get(
                                  match.categoryId
                                ) ??
                                  false),
                              category,
                              expandedTeams,
                              toggleTeamDetails,
                              teamBTone
                            )
                          : (
                              <span className="text-xs text-slate-400">
                                Por definir
                              </span>
                            );
                        const hasScore =
                          Array.isArray(match.games) && match.games.length > 0;
                        const isTennisLike = isTennisLikeSportName(
                          category?.sport?.name
                        );
                        const scoreText = formatMatchScore(match, {
                          isTennisLike,
                          pointScore: match.liveState?.pointScore,
                        });
                        return (
                          <tr key={match.id} className="bg-white">
                            <td className="px-3 py-2 text-slate-700">
                              {category?.abbreviation ?? "N/D"}
                            </td>
                            <td className="px-3 py-2 text-slate-700">
                              {groupLabel}
                            </td>
                            <td className="px-3 py-2 font-semibold text-slate-900">
                              <div className="flex items-start gap-2">
                                <span
                                  draggable
                                  onDragStart={(event) =>
                                    handleMatchDragStart(event, match)
                                  }
                                  onDragEnd={handleDragEnd}
                                  className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-[11px] font-semibold text-slate-400 shadow-sm transition hover:text-slate-600"
                                  title="Mover"
                                >
                                  ...
                                </span>
                                <div className="min-w-0">{teamADisplay}</div>
                              </div>
                              {updatingMatchId === match.id && (
                                <div className="text-xs text-slate-400">
                                  Moviendo...
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center text-slate-400">
                              vs
                            </td>
                            <td className="px-3 py-2 font-semibold text-slate-900">
                              {teamBDisplay}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex flex-col gap-2">
                                <span className="text-xs text-slate-700">
                                  {scoreText ?? "-"}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => openScoreModal(match)}
                                  disabled={scoreSaving && scoreMatchId === match.id}
                                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                                >
                                  {hasScore ? "Editar" : "Marcador"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRefereeLink(match)}
                                  disabled={refereeMatchId === match.id}
                                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                                >
                                  {refereeMatchId === match.id
                                    ? "Copiando..."
                                    : match.refereeToken
                                      ? "Copiar arbitro"
                                      : "Link arbitro"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {loadingSchedule ? (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Cargando horarios disponibles...
            </p>
          ) : scheduleDays.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              No hay horarios configurados para este torneo.
            </p>
          ) : isFiltering && visibleScheduleDays.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              No hay partidos programados con los filtros actuales.
            </p>
          ) : (
            <div className="space-y-6">
              {visibleScheduleDays.map((day) => {
                const entry = scheduleMap.get(day);
                const slots = slotsByDay.get(day) ?? [];
                const summary = entry
                  ? `${entry.startTime} - ${entry.endTime} - ${entry.matchDurationMinutes} min + ${entry.breakMinutes} min`
                  : "Sin horario configurado";
                return (
                  <div
                    key={day}
                    className="admin-fade-up overflow-hidden rounded-[24px] border border-slate-200/70 bg-white/90 p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.35)] print-area"
                  >
                    <div className="print-only mb-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-500">
                        Fixture del torneo {tournamentName}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {formatPrintDate(day)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 print-hidden">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">
                          Dia {day}
                        </h3>
                        <p className="text-sm text-slate-500">{summary}</p>
                      </div>
                      <span className="text-xs text-slate-500">
                        {slots.length} horarios
                      </span>
                    </div>
                    {slots.length === 0 ? (
                      <p className="mt-3 text-sm text-slate-500">
                        No hay horarios disponibles para este dia.
                      </p>
                      ) : (
                        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200/70 bg-white">
                          <table className="print-table min-w-[640px] divide-y divide-slate-200/70 text-xs">
                          <thead className="bg-slate-50/80 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                            <tr>
                              <th className="px-3 py-3 text-left font-semibold">
                                Hora
                              </th>
                              <th className="px-3 py-3 text-left font-semibold">
                                Club
                              </th>
                              <th className="px-3 py-3 text-left font-semibold">
                                Cancha
                              </th>
                              <th className="px-3 py-3 text-left font-semibold">
                                Categoria
                              </th>
                              <th className="px-3 py-3 text-left font-semibold">
                                Grupo
                              </th>
                              <th className="px-3 py-3 text-left font-semibold">
                                Equipo 1
                              </th>
                              <th className="px-3 py-3 text-center font-semibold">
                                VS
                              </th>
                              <th className="px-3 py-3 text-left font-semibold">
                                Equipo 2
                              </th>
                              <th className="px-3 py-3 text-left font-semibold print-hidden">
                                Marcador
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {slots.map((slot) => {
                              const match = filteredMatchesBySlot.get(slot.key);
                              if (isFiltering && !match) {
                                return null;
                              }
                              const category = match
                                ? categoryMap.get(match.categoryId)
                                : null;
                              const teamA =
                                match && match.teamAId
                                  ? registrationMap.get(match.teamAId)
                                  : null;
                              const teamB =
                                match && match.teamBId
                                  ? registrationMap.get(match.teamBId)
                                  : null;
                              const showPlayoffLabel =
                                match?.stage === "PLAYOFF" &&
                                category?.drawType === "GROUPS_PLAYOFF";
                              const teamALabel = match && showPlayoffLabel
                                ? match.teamAId
                                  ? playoffLabelMap.get(match.teamAId)
                                  : null
                                : null;
                              const teamBLabel = match && showPlayoffLabel
                                ? match.teamBId
                                  ? playoffLabelMap.get(match.teamBId)
                                  : null
                                : null;
                              const winnerSide = getWinnerSide(match);
                              const teamATone =
                                winnerSide === "A"
                                  ? "winner"
                                  : winnerSide === "B"
                                    ? "loser"
                                    : null;
                              const teamBTone =
                                winnerSide === "B"
                                  ? "winner"
                                  : winnerSide === "A"
                                    ? "loser"
                                    : null;
                              const groupLabel =
                                match?.stage === "PLAYOFF" && match
                                  ? match.isBronzeMatch
                                    ? "Bronce"
                                    : getPlayoffRoundLabel(
                                        match.categoryId,
                                        match.roundNumber
                                      )
                                  : match?.groupName ?? "-";
                              const isOver = dragOverSlot === slot.key;
                              const teamADisplay =
                                match && match.teamAId
                                  ? renderTeamDisplay(
                                      match && showPlayoffLabel
                                        ? teamALabel
                                        : null,
                                      teamA ?? undefined,
                                      !showPlayoffLabel ||
                                        (match &&
                                          (groupStageCompleteByCategory.get(
                                            match.categoryId
                                          ) ??
                                            false)),
                                      category,
                                      expandedTeams,
                                      toggleTeamDetails,
                                      teamATone
                                    )
                                  : (
                                      <span className="text-xs text-slate-400">
                                        Por definir
                                      </span>
                                    );
                              const teamBDisplay =
                                match && match.teamBId
                                  ? renderTeamDisplay(
                                      match && showPlayoffLabel
                                        ? teamBLabel
                                        : null,
                                      teamB ?? undefined,
                                      !showPlayoffLabel ||
                                        (match &&
                                          (groupStageCompleteByCategory.get(
                                            match.categoryId
                                          ) ??
                                            false)),
                                      category,
                                      expandedTeams,
                                      toggleTeamDetails,
                                      teamBTone
                                    )
                                  : (
                                      <span className="text-xs text-slate-400">
                                        Por definir
                                      </span>
                                    );
                              const hasScore =
                                match &&
                                Array.isArray(match.games) &&
                                match.games.length > 0;
                              const isTennisLike = isTennisLikeSportName(
                                category?.sport?.name
                              );
                              const scoreText = match
                                ? formatMatchScore(match, {
                                    isTennisLike,
                                    pointScore: match.liveState?.pointScore,
                                  })
                                : null;
                              return (
                                <tr
                                  key={slot.key}
                                  onDragOver={(event) =>
                                    handleSlotDragOver(event, slot.key)
                                  }
                                  onDragLeave={() => {
                                    if (dragOverSlot === slot.key) {
                                      setDragOverSlot(null);
                                    }
                                  }}
                                  onDrop={(event) =>
                                    handleSlotDrop(event, slot.key)
                                  }
                                  className={`transition ${
                                    isOver ? "bg-indigo-50" : "bg-white"
                                  } ${match ? "" : "print-hide-row"}`}
                                >
                                  <td className="px-3 py-2 text-slate-700">
                                    {slot.time}
                                  </td>
                                  <td className="px-3 py-2 text-slate-700">
                                    {slot.clubName}
                                  </td>
                                  <td className="px-3 py-2 text-slate-700">
                                    {slot.courtNumber}
                                  </td>
                                  <td className="px-3 py-2 text-slate-700">
                                    {match ? (
                                      <span className="font-semibold text-slate-700">
                                        {category?.abbreviation ?? "N/D"}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400">-</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-slate-700">
                                    {match ? (
                                      <span className="font-semibold text-slate-700">
                                        {groupLabel}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400">-</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 font-semibold text-slate-900">
                                    {match ? (
                                      <div className="flex items-start gap-2">
                                        <span
                                          draggable
                                          onDragStart={(event) =>
                                            handleMatchDragStart(event, match)
                                          }
                                          onDragEnd={handleDragEnd}
                                          className="print-hidden inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-[11px] font-semibold text-slate-400 shadow-sm transition hover:text-slate-600"
                                          title="Mover"
                                        >
                                          ...
                                        </span>
                                        <div className="min-w-0">
                                          {teamADisplay}
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="text-slate-400">
                                        Disponible
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-center text-slate-400">
                                    {match ? "vs" : "-"}
                                  </td>
                                  <td className="px-3 py-2 font-semibold text-slate-900">
                                    {match ? (
                                      <>
                                        <div className="min-w-0">
                                          {teamBDisplay}
                                        </div>
                                        {updatingMatchId === match.id && (
                                          <div className="text-xs text-slate-400">
                                            Moviendo...
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      <span className="text-slate-400">-</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 print-hidden">
                                    {match ? (
                                      <div className="flex flex-col gap-2">
                                        <span className="text-xs text-slate-700">
                                          {scoreText ?? "-"}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => openScoreModal(match)}
                                          disabled={
                                            scoreSaving && scoreMatchId === match.id
                                          }
                                          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                                        >
                                          {hasScore ? "Editar" : "Marcador"}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleRefereeLink(match)}
                                          disabled={refereeMatchId === match.id}
                                          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                                        >
                                          {refereeMatchId === match.id
                                            ? "Copiando..."
                                            : match.refereeToken
                                              ? "Copiar arbitro"
                                              : "Link arbitro"}
                                        </button>
                                      </div>
                                    ) : (
                                      <span className="text-slate-400">-</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {scoreMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
          <button
            type="button"
            onClick={closeScoreModal}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            aria-label="Cerrar"
          />
          <div className="relative w-full max-w-3xl overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_30px_80px_-40px_rgba(15,23,42,0.55)]">
            <div className="border-b border-slate-100 bg-slate-50/80 px-6 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-500">
                    Marcador
                  </p>
                  <h3 className="text-lg font-semibold text-slate-900">
                    {formatTeamName(scoreTeamA)}{" "}
                    <span className="text-slate-400">vs</span>{" "}
                    {formatTeamName(scoreTeamB)}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Categoria:{" "}
                    {categoryMap.get(scoreMatch.categoryId)?.abbreviation ?? "N/D"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeScoreModal}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-100"
                >
                  Cerrar
                </button>
              </div>
            </div>
            <div className="space-y-4 px-6 py-5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Sets jugados
                </span>
                <select
                  value={scoreSets.length || 1}
                  onChange={(e) => handleSetCountChange(Number(e.target.value))}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                >
                  {[1, 2, 3, 4, 5].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.25)]">
                <div className="flex flex-wrap items-center gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Resultado del partido
                    </p>
                    <select
                      value={scoreOutcomeType}
                      onChange={(e) => {
                        const next = e.target.value as OutcomeType;
                        setScoreOutcomeType(next);
                        if (next === "PLAYED") {
                          setScoreOutcomeSide(null);
                        }
                      }}
                      className="mt-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    >
                      <option value="PLAYED">Partido jugado</option>
                      <option value="WALKOVER">Walkover (no se presento)</option>
                      <option value="INJURY">Lesion / retiro</option>
                    </select>
                  </div>
                  {scoreOutcomeType !== "PLAYED" && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                        Equipo afectado
                      </p>
                      <select
                        value={scoreOutcomeSide ?? ""}
                        onChange={(e) =>
                          setScoreOutcomeSide(
                            e.target.value === "A" || e.target.value === "B"
                              ? (e.target.value as "A" | "B")
                              : null
                          )
                        }
                        className="mt-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      >
                        <option value="">Selecciona equipo</option>
                        <option value="A">{formatTeamName(scoreTeamA)}</option>
                        <option value="B">{formatTeamName(scoreTeamB)}</option>
                      </select>
                    </div>
                  )}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {scoreOutcomeType === "PLAYED"
                    ? "El ganador se infiere por los sets."
                    : "El ganador se asigna automaticamente al otro equipo."}
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-700">
                  Ganador:{" "}
                  {scoreOutcomeType === "PLAYED"
                    ? scoreSetWins.winsA === scoreSetWins.winsB
                      ? "Sin definir"
                      : scoreSetWins.winsA > scoreSetWins.winsB
                      ? formatTeamName(scoreTeamA)
                      : formatTeamName(scoreTeamB)
                    : scoreOutcomeSide === "A"
                    ? formatTeamName(scoreTeamB)
                    : scoreOutcomeSide === "B"
                    ? formatTeamName(scoreTeamA)
                    : "Sin definir"}
                </p>
              </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="min-w-[560px] divide-y divide-slate-200/70 text-xs">
                  <thead className="bg-slate-50/80 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                    <tr>
                      <th className="px-3 py-3 text-left font-semibold">
                        Set
                      </th>
                      <th className="px-3 py-3 text-left font-semibold">
                        Set equipo 1
                      </th>
                      <th className="px-3 py-3 text-left font-semibold">
                        Set equipo 2
                      </th>
                      <th className="px-3 py-3 text-left font-semibold">
                        Duracion (min)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {scoreSets.map((set, index) => (
                      <tr key={`set-${index}`}>
                        <td className="px-3 py-2 text-slate-500">
                          {index + 1}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            inputMode="numeric"
                            value={set.a}
                            onChange={(e) =>
                              updateScoreSet(index, "a", e.target.value)
                            }
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            inputMode="numeric"
                            value={set.b}
                            onChange={(e) =>
                              updateScoreSet(index, "b", e.target.value)
                            }
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            inputMode="numeric"
                            value={set.duration}
                            onChange={(e) =>
                              updateScoreSet(index, "duration", e.target.value)
                            }
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                            placeholder="Min"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {scoreError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {scoreError}
                </p>
              )}

              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={closeScoreModal}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveScore}
                  disabled={scoreSaving}
                  className="rounded-full bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-[0_14px_32px_-18px_rgba(79,70,229,0.45)] transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {scoreSaving ? "Guardando..." : "Guardar marcador"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          {message}
        </p>
      )}
      {refereeMessage && (
        <p className="rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-700">
          {refereeMessage}
        </p>
      )}
      {refereeError && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {refereeError}
        </p>
      )}
    </div>
  );
}

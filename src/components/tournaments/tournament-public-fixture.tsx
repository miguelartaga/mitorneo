"use client";

import { useEffect, useMemo, useState } from "react";
import {
    type Match,
    type Category,
    type Registration,
    type Player,
} from "@/types/tournament-public";

// --- Helper Functions (Duplicated for now or moved to utils in future) ---

const formatDateComponents = (value?: string | null) => {
    if (!value || value === "sin-fecha") return { day: "ND", month: "", year: "" };
    const trimmed = value.trim();
    if (!trimmed) return { day: "ND", month: "", year: "" };
    const datePart = trimmed.includes("T") ? trimmed.split("T")[0] : trimmed;
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
    const parsed = dateOnlyMatch
        ? new Date(
            Number(dateOnlyMatch[1]),
            Number(dateOnlyMatch[2]) - 1,
            Number(dateOnlyMatch[3])
        )
        : new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return { day: "ND", month: "", year: "" };

    const day = parsed.toLocaleDateString("es-BO", { day: "numeric" });
    const month = parsed.toLocaleDateString("es-BO", { month: "long" }); // nombre mes completo
    const year = parsed.getFullYear().toString();

    // Capitalize month
    const monthCap = month.charAt(0).toUpperCase() + month.slice(1);

    return { day, month: monthCap, year };
};

const formatDateLong = (value?: string | null) => {
    if (!value) return "N/D";
    const trimmed = value.trim();
    if (!trimmed) return "N/D";
    const datePart = trimmed.includes("T") ? trimmed.split("T")[0] : trimmed;
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
    const parsed = dateOnlyMatch
        ? new Date(
            Number(dateOnlyMatch[1]),
            Number(dateOnlyMatch[2]) - 1,
            Number(dateOnlyMatch[3])
        )
        : new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString("es-BO", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
    });
};

const formatDateShort = (value?: string | null) => {
    if (!value) return "N/D";
    const trimmed = value.trim();
    if (!trimmed) return "N/D";
    const datePart = trimmed.includes("T") ? trimmed.split("T")[0] : trimmed;
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
    const parsed = dateOnlyMatch
        ? new Date(
            Number(dateOnlyMatch[1]),
            Number(dateOnlyMatch[2]) - 1,
            Number(dateOnlyMatch[3])
        )
        : new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString("es-BO", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
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
    if (!Array.isArray(match.games)) return null;
    const parts: string[] = [];
    for (const entry of match.games) {
        if (!entry || typeof entry !== "object") continue;
        const a = (entry as { a?: unknown }).a;
        const b = (entry as { b?: unknown }).b;
        const tiebreakA = (entry as { tiebreakA?: unknown }).tiebreakA;
        const tiebreakB = (entry as { tiebreakB?: unknown }).tiebreakB;
        if (typeof a !== "number" || typeof b !== "number") continue;
        const tiebreak =
            typeof tiebreakA === "number" && typeof tiebreakB === "number"
                ? `(${tiebreakA}-${tiebreakB})`
                : "";
        parts.push(`${a}-${b}${tiebreak}`);
    }
    if (parts.length === 0) return null;
    return parts.join(" | ");
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

const computeMatchWinner = (match: Match) => {
    if (match.winnerSide === "A" || match.winnerSide === "B") {
        return match.winnerSide;
    }
    const outcomeType = match.outcomeType ?? "PLAYED";
    if (outcomeType !== "PLAYED") {
        if (match.outcomeSide === "A") return "B";
        if (match.outcomeSide === "B") return "A";
    }
    const games = parseGames(match.games);
    if (games.length === 0) return null;
    let winsA = 0;
    let winsB = 0;
    games.forEach((game) => {
        if (game.a > game.b) winsA += 1;
        if (game.b > game.a) winsB += 1;
    });
    if (winsA === winsB) return null;
    return winsA > winsB ? "A" : "B";
};

const playerLabel = (player?: Player | null) =>
    player ? `${player.firstName} ${player.lastName}` : "Por definir";

const teamLabel = (registration?: Registration | null) => {
    if (!registration) return "Por definir";
    if (registration.teamName) return registration.teamName;
    const names = [
        registration.player,
        registration.partner,
        registration.partnerTwo,
    ]
        .filter(Boolean)
        .map((p) => playerLabel(p as Player));
    return names.join(" / ");
};

const getTeamMembers = (registration?: Registration | null) => {
    if (!registration) return [];
    return [registration.player, registration.partner, registration.partnerTwo]
        .filter(Boolean)
        .map((player) => playerLabel(player as Player));
};

const formatPlayoffRoundLabel = (bracketSize: number, roundNumber: number) => {
    const roundSize = Math.max(
        2,
        Math.floor(bracketSize / Math.pow(2, roundNumber - 1))
    );
    if (roundSize === 2) return "Final";
    if (roundSize === 4) return "Semifinal";
    if (roundSize === 8) return "Cuartos";
    if (roundSize === 16) return "Ronda de 16";
    if (roundSize === 32) return "Ronda de 32";
    if (roundSize === 64) return "Ronda de 64";
    return `Ronda de ${roundSize}`;
};

// --- Component ---

type TournamentPublicFixtureProps = {
    matches: Match[];
    categoriesById: Map<string, Category>;
    categoryDrawTypeById: Map<string, string | null>;
    groupStageCompleteByCategory: Map<string, boolean>;
    bracketSizeByCategory: Map<string, number>;
    playoffRoundsByCategory: Map<string, number[]>;
};

export default function TournamentPublicFixture({
    matches,
    categoriesById,
    categoryDrawTypeById,
    groupStageCompleteByCategory,
    bracketSizeByCategory,
    playoffRoundsByCategory,
}: TournamentPublicFixtureProps) {
    const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
    const [fixtureDay, setFixtureDay] = useState<string | null>(null);
    const [fixtureQuery, setFixtureQuery] = useState("");
    const [fixtureCategory, setFixtureCategory] = useState("all");

    const normalizeText = (value: string) =>
        value
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim();

    const categoryOptions = useMemo(() => {
        const list = Array.from(categoriesById.values());
        list.sort((a, b) => a.name.localeCompare(b.name));
        return list;
    }, [categoriesById]);

    const filteredMatches = useMemo(() => {
        const categoryFilter = fixtureCategory !== "all" ? fixtureCategory : null;
        const query = normalizeText(fixtureQuery);
        const baseMatches = Array.isArray(matches) ? matches : [];

        return baseMatches.filter((match) => {
            if (categoryFilter && match.categoryId !== categoryFilter) return false;
            if (!query) return true;
            const category = match.category ?? categoriesById.get(match.categoryId);
            const safePlayoffLabel = match.stage === "PLAYOFF"
                ? match.isBronzeMatch
                    ? "Bronce"
                    : "Playoff"
                : match.groupName ?? "";
            const textParts = [
                category?.name ?? "",
                category?.abbreviation ?? "",
                teamLabel(match.teamA),
                getTeamMembers(match.teamA).join(" "),
                teamLabel(match.teamB),
                getTeamMembers(match.teamB).join(" "),
                match.groupName ?? "",
                safePlayoffLabel,
                match.startTime ?? "",
            ];
            const haystack = normalizeText(textParts.join(" "));
            return haystack.includes(query);
        });
    }, [matches, categoriesById, fixtureCategory, fixtureQuery]);

    const matchesByDate = useMemo(() => {
        const map = new Map<string, Match[]>();
        filteredMatches.forEach((match) => {
            if (!match.scheduledDate) return;
            const dateKey = match.scheduledDate.split("T")[0];
            const list = map.get(dateKey) ?? [];
            list.push(match);
            map.set(dateKey, list);
        });
        return map;
    }, [filteredMatches]);

    useEffect(() => {
        if (matchesByDate.size > 0 && !fixtureDay) {
            const dates = Array.from(matchesByDate.keys()).sort();
            if (dates.length > 0) {
                setFixtureDay(dates[0]);
            }
        }
    }, [matchesByDate, fixtureDay]);

    const toggleTeamExpanded = (key: string) => {
        setExpandedTeams((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    };

    const getPlayoffLabel = (match: Match) => {
        if (match.stage !== "PLAYOFF") return match.groupName ?? "-";
        if (match.isBronzeMatch) return "Bronce";
        const roundNumber = match.roundNumber ?? null;
        const bracketSize = bracketSizeByCategory.get(match.categoryId) ?? null;
        const roundNumbers = playoffRoundsByCategory.get(match.categoryId) ?? null;
        if (!roundNumber || !bracketSize || !roundNumbers) return "Playoff";
        const roundIndex = roundNumbers.indexOf(roundNumber);
        const normalizedRound = roundIndex >= 0 ? roundIndex + 1 : roundNumber;
        return formatPlayoffRoundLabel(bracketSize, normalizedRound);
    };

    if (matchesByDate.size === 0) {
        return (
            <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-slate-500">
                {matches.length === 0 && !fixtureQuery && fixtureCategory === "all"
                    ? "Aun no hay partidos programados."
                    : "No se encontraron partidos con esos filtros."}
            </div>
        );
    }

    return (
        <div>
            <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="grid gap-3 md:grid-cols-[1.4fr_1fr]">
                    <div className="space-y-1">
                        <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                            Buscar jugador / equipo
                        </label>
                        <input
                            value={fixtureQuery}
                            onChange={(e) => setFixtureQuery(e.target.value)}
                            placeholder="Nombre, equipo, grupo..."
                            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-200/40"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                            Categoria
                        </label>
                        <select
                            value={fixtureCategory}
                            onChange={(e) => setFixtureCategory(e.target.value)}
                            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-200/40"
                        >
                            <option value="all">Todas</option>
                            {categoryOptions.map((category) => (
                                <option key={category.id} value={category.id}>
                                    {category.name} ({category.abbreviation})
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            <div className="flex justify-center">
                <div className="mb-6 flex w-full max-w-full gap-2 overflow-x-auto p-1.5 pb-4 hide-scrollbar">
                    {Array.from(matchesByDate.keys())
                        .sort()
                        .map((dateKey) => {
                            const { day, month, year } = formatDateComponents(dateKey);
                            const isSelected = fixtureDay === dateKey;

                            if (dateKey === "sin-fecha") {
                                return (
                                    <button
                                        key={dateKey}
                                        onClick={() => setFixtureDay(dateKey)}
                                        className={`flex flex-col items-center justify-center rounded-2xl px-5 py-3 transition-all ${isSelected
                                            ? "scale-110 bg-white text-blue-600 shadow-md ring-1 ring-black/5 dark:bg-slate-800 dark:text-cyan-400 dark:ring-white/10"
                                            : "scale-100 bg-[var(--surface-2)] text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                                            }`}
                                    >
                                        <span className="text-sm font-semibold">Sin fecha</span>
                                    </button>
                                );
                            }

                            return (
                                <button
                                    key={dateKey}
                                    onClick={() => setFixtureDay(dateKey)}
                                    className={`flex min-w-[80px] flex-col items-center justify-center rounded-2xl px-3 py-2 transition-all duration-300 ${isSelected
                                        ? "scale-110 bg-white shadow-lg ring-1 ring-black/5 dark:bg-slate-800 dark:ring-white/10"
                                        : "scale-100 bg-[var(--surface-2)] hover:bg-[var(--surface-3)]"
                                        }`}
                                >
                                    <span className={`text-2xl font-bold leading-none ${isSelected ? "text-blue-600 dark:text-cyan-400" : "text-slate-900 dark:text-white"}`}>
                                        {day}
                                    </span>
                                    <span className={`text-[10px] font-medium uppercase tracking-wider ${isSelected ? "text-slate-900 dark:text-slate-200" : "text-slate-500"}`}>
                                        {month}
                                    </span>
                                    <span className={`text-[10px] ${isSelected ? "text-slate-500" : "text-slate-400"}`}>
                                        {year}
                                    </span>
                                </button>
                            );
                        })}
                </div>
            </div>

            {
                fixtureDay && matchesByDate.has(fixtureDay) && (
                    <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
                        <h3 className="text-lg font-semibold text-slate-900">
                            {fixtureDay === "sin-fecha"
                                ? "Sin fecha asignada"
                                : formatDateLong(fixtureDay)}
                        </h3>

                        {/* Mobile View: Cards */}
                        <div className="mt-4 grid gap-4 md:hidden">
                            {(matchesByDate.get(fixtureDay) ?? [])
                                .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""))
                                .map((match) => {
                                    const category = match.category ?? categoriesById.get(match.categoryId);
                                    const score = formatMatchScore(match);
                                    const isLive = Boolean(match.liveState?.isLive);
                                    const winnerSide = computeMatchWinner(match);
                                    const teamAIsWinner = winnerSide === "A";
                                    const teamBIsWinner = winnerSide === "B";
                                    const teamAKey = `${match.id}-A`;
                                    const teamBKey = `${match.id}-B`;
                                    const teamAMembers = getTeamMembers(match.teamA);
                                    const teamBMembers = getTeamMembers(match.teamB);
                                    const canExpandTeamA = teamAMembers.length > 1 || (teamAMembers.length > 0 && Boolean(match.teamA?.teamName));
                                    const canExpandTeamB = teamBMembers.length > 1 || (teamBMembers.length > 0 && Boolean(match.teamB?.teamName));
                                    const isTeamAExpanded = expandedTeams.has(teamAKey);
                                    const isTeamBExpanded = expandedTeams.has(teamBKey);

                                    return (
                                        <div key={match.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/5 pb-3 dark:border-white/5">
                                                <div className="flex items-center gap-2">
                                                    <span className="rounded-md bg-slate-900 px-2 py-1 text-xs font-bold text-white dark:bg-slate-800">
                                                        {match.startTime ?? "N/D"}
                                                    </span>
                                                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                                                        {match.courtNumber ? `Cancha ${match.courtNumber}` : "Cancha N/D"}
                                                    </span>
                                                </div>
                                                <div className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-cyan-400">
                                                    {category?.abbreviation ?? "CAT"} • {getPlayoffLabel(match)}
                                                </div>
                                            </div>

                                            <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                                                {/* Team A */}
                                                <div className="text-right">
                                                    <div className="flex flex-col items-end">
                                                        <span
                                                            className={`font-semibold leading-tight ${teamAIsWinner
                                                                ? "text-emerald-600"
                                                                : teamBIsWinner
                                                                    ? "text-slate-400"
                                                                    : "text-slate-900"
                                                                }`}
                                                        >
                                                            {teamLabel(match.teamA)}
                                                        </span>
                                                        {canExpandTeamA && (
                                                            <button
                                                                onClick={() => toggleTeamExpanded(teamAKey)}
                                                                className="mt-1 text-[10px] text-slate-500 underline"
                                                            >
                                                                {isTeamAExpanded ? "Ocultar" : "Ver jugadores"}
                                                            </button>
                                                        )}
                                                        {canExpandTeamA && isTeamAExpanded && (
                                                            <div className="mt-1 text-[10px] text-slate-500">
                                                                {teamAMembers.join(", ")}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* VS or Score */}
                                                <div className="flex flex-col items-center justify-center px-1">
                                                    {score ? (
                                                        <span className="text-xs font-bold text-slate-900">{score}</span>
                                                    ) : (
                                                        <span className="text-xs font-bold text-slate-400">VS</span>
                                                    )}
                                                </div>

                                                {/* Team B */}
                                                <div className="text-left">
                                                    <div className="flex flex-col items-start">
                                                        <span
                                                            className={`font-semibold leading-tight ${teamBIsWinner
                                                                ? "text-emerald-600"
                                                                : teamAIsWinner
                                                                    ? "text-slate-400"
                                                                    : "text-slate-900"
                                                                }`}
                                                        >
                                                            {teamLabel(match.teamB)}
                                                        </span>
                                                        {canExpandTeamB && (
                                                            <button
                                                                onClick={() => toggleTeamExpanded(teamBKey)}
                                                                className="mt-1 text-[10px] text-slate-500 underline"
                                                            >
                                                                {isTeamBExpanded ? "Ocultar" : "Ver jugadores"}
                                                            </button>
                                                        )}
                                                        {canExpandTeamB && isTeamBExpanded && (
                                                            <div className="mt-1 text-[10px] text-slate-500">
                                                                {teamBMembers.join(", ")}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {isLive && (
                                                <div className="mt-3 flex justify-center">
                                                    <span className="rounded-full bg-rose-500/10 px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest text-rose-500">
                                                        En Vivo
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                        </div>

                        {/* Desktop View: Table */}
                        <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-[var(--border)] md:block">
                            <table className="min-w-full text-xs text-slate-600">
                                <thead className="bg-[var(--surface-2)] uppercase tracking-[0.2em] text-slate-500">
                                    <tr>
                                        <th className="px-3 py-2 text-left">Hora</th>
                                        <th className="px-3 py-2 text-left">Club</th>
                                        <th className="px-3 py-2 text-left">Cancha</th>
                                        <th className="px-3 py-2 text-left">Categoria</th>
                                        <th className="px-3 py-2 text-left">Grupo</th>
                                        <th className="px-3 py-2 text-left">Equipo 1</th>
                                        <th className="px-3 py-2 text-left">VS</th>
                                        <th className="px-3 py-2 text-left">Equipo 2</th>
                                        <th className="px-3 py-2 text-left">Marcador</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {(matchesByDate.get(fixtureDay) ?? [])
                                        .sort((a, b) =>
                                            (a.startTime ?? "").localeCompare(b.startTime ?? "")
                                        )
                                        .map((match) => {
                                            const category =
                                                match.category ?? categoriesById.get(match.categoryId);
                                            const score = formatMatchScore(match);
                                            const isLive = Boolean(match.liveState?.isLive);
                                            const winnerSide = computeMatchWinner(match);
                                            const teamAIsWinner = winnerSide === "A";
                                            const teamBIsWinner = winnerSide === "B";
                                            const drawType =
                                                categoryDrawTypeById.get(match.categoryId) ?? null;
                                            const isPlayoffWaiting =
                                                match.stage === "PLAYOFF" &&
                                                drawType === "GROUPS_PLAYOFF" &&
                                                !(
                                                    groupStageCompleteByCategory.get(match.categoryId) ??
                                                    false
                                                ) &&
                                                !(match.teamAId && match.teamBId);
                                            const teamAKey = `${match.id}-A`;
                                            const teamBKey = `${match.id}-B`;
                                            const teamAMembers = getTeamMembers(match.teamA);
                                            const teamBMembers = getTeamMembers(match.teamB);
                                            const canExpandTeamA =
                                                teamAMembers.length > 1 ||
                                                (teamAMembers.length > 0 &&
                                                    Boolean(match.teamA?.teamName));
                                            const canExpandTeamB =
                                                teamBMembers.length > 1 ||
                                                (teamBMembers.length > 0 &&
                                                    Boolean(match.teamB?.teamName));
                                            const isTeamAExpanded = expandedTeams.has(teamAKey);
                                            const isTeamBExpanded = expandedTeams.has(teamBKey);
                                            return (
                                                <tr key={match.id} className="bg-[var(--surface)]">
                                                    <td className="px-3 py-2">
                                                        {match.startTime ?? "N/D"}
                                                    </td>
                                                    <td className="px-3 py-2">{match.club?.name ?? "N/D"}</td>
                                                    <td className="px-3 py-2">{match.courtNumber ?? "-"}</td>
                                                    <td className="px-3 py-2">
                                                        {category?.abbreviation ?? "N/D"}
                                                    </td>
                                                    <td className="px-3 py-2">{getPlayoffLabel(match)}</td>
                                                    <td className="px-3 py-2 font-semibold text-slate-900">
                                                        {isPlayoffWaiting ? (
                                                            <span className="text-xs text-slate-400">
                                                                Por definir
                                                            </span>
                                                        ) : (
                                                            <div>
                                                                <div className="flex items-center gap-2">
                                                                    <span
                                                                        className={
                                                                            teamAIsWinner
                                                                                ? "text-emerald-600"
                                                                                : teamBIsWinner
                                                                                    ? "text-slate-400"
                                                                                    : "text-slate-900"
                                                                        }
                                                                    >
                                                                        {teamLabel(match.teamA)}
                                                                    </span>
                                                                    {canExpandTeamA && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => toggleTeamExpanded(teamAKey)}
                                                                            className="text-[10px] font-semibold text-cyan-200"
                                                                            aria-label={
                                                                                isTeamAExpanded
                                                                                    ? "Ocultar jugadores"
                                                                                    : "Ver jugadores"
                                                                            }
                                                                        >
                                                                            {isTeamAExpanded ? "v" : ">"}
                                                                        </button>
                                                                    )}
                                                                </div>
                                                                {canExpandTeamA && isTeamAExpanded && (
                                                                    <div className="mt-1 text-[11px] text-slate-500">
                                                                        {teamAMembers.join(" / ")}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2 text-slate-400">vs</td>
                                                    <td className="px-3 py-2 font-semibold text-slate-900">
                                                        {isPlayoffWaiting ? (
                                                            <span className="text-xs text-slate-400">
                                                                Por definir
                                                            </span>
                                                        ) : (
                                                            <div>
                                                                <div className="flex items-center gap-2">
                                                                    <span
                                                                        className={
                                                                            teamBIsWinner
                                                                                ? "text-emerald-600"
                                                                                : teamAIsWinner
                                                                                    ? "text-slate-400"
                                                                                    : "text-slate-900"
                                                                        }
                                                                    >
                                                                        {teamLabel(match.teamB)}
                                                                    </span>
                                                                    {canExpandTeamB && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => toggleTeamExpanded(teamBKey)}
                                                                            className="text-[10px] font-semibold text-blue-600 dark:text-cyan-200"
                                                                            aria-label={
                                                                                isTeamBExpanded
                                                                                    ? "Ocultar jugadores"
                                                                                    : "Ver jugadores"
                                                                            }
                                                                        >
                                                                            {isTeamBExpanded ? "v" : ">"}
                                                                        </button>
                                                                    )}
                                                                </div>
                                                                {canExpandTeamB && isTeamBExpanded && (
                                                                    <div className="mt-1 text-[11px] text-slate-500">
                                                                        {teamBMembers.join(" / ")}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2 text-slate-500">
                                                        <div className="flex items-center gap-2">
                                                            {score ?? "-"}
                                                            {isLive && (
                                                                <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-rose-200">
                                                                    En vivo
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            }
        </div >
    );
}

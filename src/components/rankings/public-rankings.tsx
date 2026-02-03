"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PlayerAvatar from "@/components/player-avatar";

type Sport = {
  id: string;
  name: string;
};

type League = {
  id: string;
  name: string;
  sportId: string;
  photoUrl?: string | null;
};

type Season = {
  id: string;
  name: string;
  leagueId: string;
  startDate: string;
  endDate: string;
};

type Category = {
  id: string;
  name: string;
  abbreviation: string;
  sport?: { id: string; name: string } | null;
};

type Tournament = {
  id: string;
  name: string;
  sportId: string | null;
  leagueId: string | null;
  startDate: string | null;
};

type RankingEntry = {
  id: string;
  rank: number;
  points: number;
  player: {
    id: string;
    firstName: string;
    lastName: string;
    photoUrl?: string | null;
    city?: string | null;
    country?: string | null;
  };
  league: { id: string; name: string };
  season: { id: string; name: string };
  category: {
    id: string;
    name: string;
    abbreviation: string;
    sport?: { id: string; name: string } | null;
  };
};

type Props = {
  sports: Sport[];
  leagues: League[];
  seasons: Season[];
  categories: Category[];
  tournaments: Tournament[];
};

const formatSeasonLabel = (season: Season) => `${season.name}`;

const formatTournamentDate = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-BO", {
    day: "numeric",
    month: "short",
  }).format(date);
};

const normalizeSportName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\w]/g, "");

const getSportImage = (sportName: string) => {
  const name = normalizeSportName(sportName);
  if (/padel|pdel/.test(name)) return "/sports/padel/1.jpg";
  if (/tenis|tennis/.test(name)) return "/sports/tenis/1.jpg";
  if (/fronton/.test(name)) return "/sports/fronton/1.jpg";
  if (/raquet|racquet|racket/.test(name)) return "/sports/raquet/1.jpg";
  if (/squash/.test(name)) return "/sports/squash/1.jpg";
  return "/sports/raquet/1.jpg";
};

export default function PublicRankings({
  sports,
  leagues,
  seasons,
  categories,
  tournaments,
}: Props) {
  const [sportId, setSportId] = useState("");
  const [leagueId, setLeagueId] = useState("");
  const [seasonId, setSeasonId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [tournamentId, setTournamentId] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<RankingEntry[]>([]);

  const filteredLeagues = useMemo(() => {
    if (!sportId) return leagues;
    return leagues.filter((league) => league.sportId === sportId);
  }, [leagues, sportId]);

  const filteredSeasons = useMemo(() => {
    if (!leagueId) return seasons;
    return seasons.filter((season) => season.leagueId === leagueId);
  }, [leagueId, seasons]);

  const filteredCategories = useMemo(() => {
    if (!sportId) return categories;
    return categories.filter((category) => category.sport?.id === sportId);
  }, [sportId, categories]);

  const filteredTournaments = useMemo(() => {
    let list = tournaments;
    if (sportId) {
      list = list.filter((item) => item.sportId === sportId);
    }
    if (leagueId) {
      list = list.filter((item) => item.leagueId === leagueId);
    }
    return list;
  }, [tournaments, sportId, leagueId]);

  const canShowResults = Boolean(sportId && leagueId && seasonId);

  useEffect(() => {
    if (!canShowResults) {
      setEntries([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let active = true;
    const loadRankings = async () => {
      setLoading(true);
      const params = new URLSearchParams();
      if (sportId) params.set("sportId", sportId);
      if (leagueId) params.set("leagueId", leagueId);
      if (seasonId) params.set("seasonId", seasonId);
      if (categoryId) params.set("categoryId", categoryId);
      if (tournamentId) params.set("tournamentId", tournamentId);
      if (query.trim()) params.set("search", query.trim());

      try {
        const res = await fetch(`/api/rankings?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!active) return;
        if (res.ok && Array.isArray(data.rankings)) {
          setEntries(data.rankings);
        } else {
          setEntries([]);
        }
      } catch (err) {
        if (!active) return;
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        setEntries([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadRankings();
    return () => {
      active = false;
      controller.abort();
    };
  }, [sportId, leagueId, seasonId, categoryId, tournamentId, query, canShowResults]);

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-3 shadow-sm sm:p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-500/80">
          Selecciona deporte
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sports.map((sport) => (
            <button
              key={sport.id}
              type="button"
              onClick={() => {
                setSportId(sport.id);
                setLeagueId("");
                setSeasonId("");
                setCategoryId("");
                setTournamentId("");
                setQuery("");
              }}
              className={`group relative overflow-hidden rounded-2xl border px-4 py-4 text-left shadow-sm transition ${
                sportId === sport.id
                  ? "border-indigo-400/70 bg-indigo-50/70"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <div className="absolute -right-12 -top-12 h-24 w-24 rounded-full bg-indigo-200/40 blur-2xl" />
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200">
                  <img
                    src={getSportImage(sport.name)}
                    alt={`Foto ${sport.name}`}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Deporte
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-900">
                    {sport.name}
                  </h3>
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Ver ligas y temporadas disponibles.
              </p>
            </button>
          ))}
        </div>
      </div>

      {sportId && (
        <div className="mt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
            Ligas
          </p>
          {filteredLeagues.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              No hay ligas para este deporte.
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {filteredLeagues.map((league) => (
                <button
                  key={league.id}
                  type="button"
                  onClick={() => {
                    setLeagueId(league.id);
                    setSeasonId("");
                    setTournamentId("");
                  }}
                  className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] transition ${
                    leagueId === league.id
                      ? "bg-slate-900 text-white"
                      : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  <span className="h-6 w-6 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200">
                    {league.photoUrl ? (
                      <img
                        src={league.photoUrl}
                        alt={`Logo ${league.name}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-[9px] font-bold text-slate-400">
                        {league.name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </span>
                  <span>{league.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {leagueId && (
        <div className="mt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
            Temporadas
          </p>
          {filteredSeasons.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              No hay temporadas disponibles para esta liga.
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {filteredSeasons.map((season) => (
                <button
                  key={season.id}
                  type="button"
                  onClick={() => setSeasonId(season.id)}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] transition ${
                    seasonId === season.id
                      ? "bg-indigo-600 text-white"
                      : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {formatSeasonLabel(season)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {canShowResults && (
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-2 text-sm font-semibold text-slate-700">
            Categoria
            <select
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm"
            >
              <option value="">Todas</option>
              {filteredCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm font-semibold text-slate-700">
            Torneo
            <select
              value={tournamentId}
              onChange={(event) => setTournamentId(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm"
            >
              <option value="">Todos</option>
              {filteredTournaments.map((tournament) => (
                <option key={tournament.id} value={tournament.id}>
                  {tournament.name}
                  {tournament.startDate
                    ? ` - ${formatTournamentDate(tournament.startDate)}`
                    : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm font-semibold text-slate-700">
            Buscar jugador
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nombre, ciudad o pais"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm"
            />
          </label>
        </div>
      )}
      <div className="mt-8">
        {!canShowResults ? (
          <p className="text-sm text-slate-500">
            Selecciona un deporte, una liga y una temporada para ver el ranking.
          </p>
        ) : loading ? (
          <p className="text-sm text-slate-500">Cargando rankings...</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-slate-500">
            No hay rankings disponibles con esos filtros.
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="relative flex items-center gap-2.5 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/60 p-2.5 sm:gap-4 sm:p-4"
              >
                <div className="relative h-11 w-11 flex-shrink-0 sm:h-16 sm:w-16">
                  <div className="h-full w-full overflow-hidden rounded-2xl bg-white shadow-sm">
                    <PlayerAvatar
                      player={entry.player}
                      className="h-full w-full object-cover"
                      fallbackClassName="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400"
                    />
                  </div>
                  <div className="absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[9px] font-bold text-white ring-2 ring-white sm:-left-3 sm:-top-3 sm:h-7 sm:w-7 sm:text-xs">
                    #{entry.rank}
                  </div>
                </div>

                <div className="min-w-0 flex-1 overflow-hidden">
                  <div className="flex items-center justify-between gap-1">
                    <Link
                      href={`/players/${entry.player.id}`}
                      className="block truncate text-[15px] font-bold text-slate-900 hover:text-indigo-600 sm:text-lg"
                    >
                      {entry.player.firstName} {entry.player.lastName}
                    </Link>
                  </div>
                  <p className="truncate text-xs text-slate-500 sm:text-sm">
                    {entry.player.city || "Ciudad"} - {entry.player.country || "Pais"}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-500 sm:mt-2 sm:gap-x-2 sm:gap-y-1 sm:text-[10px]">
                    <span className="truncate max-w-[80px] sm:max-w-none">{entry.category.abbreviation}</span>
                    <span>-</span>
                    <span className="truncate max-w-[120px] sm:max-w-none">{entry.league.name}</span>
                    <span>-</span>
                    <span className="truncate max-w-[60px] sm:max-w-none">{entry.season.name}</span>
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center border-l border-slate-200 pl-2.5 sm:pl-4">
                  <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400 sm:text-[10px]">
                    Puntos
                  </span>
                  <span className="whitespace-nowrap text-lg font-black text-indigo-600 sm:text-2xl">
                    {new Intl.NumberFormat("es-BO").format(entry.points)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

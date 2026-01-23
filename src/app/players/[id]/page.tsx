"use client";

/* eslint-disable @next/next/no-img-element */

import { Manrope, Playfair_Display } from "next/font/google";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const displayFont = Playfair_Display({
  subsets: ["latin"],
  weight: ["600", "700"],
});

const bodyFont = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

type Player = {
  id: string;
  firstName: string;
  lastName: string;
  documentType: string;
  documentNumber: string;
  status: string;
  dateOfBirth: string | null;
  phone: string | null;
  gender: string;
  city: string | null;
  country: string | null;
  photoUrl: string | null;
};

type PlayerStats = {
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  doubles: number;
  triples: number;
  hasFrontonMatch: boolean;
};

type LeagueRanking = {
  leagueId: string;
  leagueName: string;
  seasonId: string;
  seasonName: string;
  seasonStart: string;
  seasonEnd: string;
  categoryId: string;
  categoryName: string;
  categoryAbbreviation: string;
  sportId: string | null;
  sportName: string | null;
  points: number;
  position: number | null;
  totalPlayers: number;
};

type ViewState = "loading" | "ready" | "error";

const statusCopy: Record<string, string> = {
  CONFIRMED: "Confirmado",
  UNCONFIRMED: "No confirmado",
};

const genderCopy: Record<string, string> = {
  MALE: "Masculino",
  FEMALE: "Femenino",
  OTHER: "Otro",
  NOT_SPECIFIED: "No especificado",
};

const toISODate = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().split("T")[0];
};

const calculateAge = (isoDate: string | null) => {
  if (!isoDate) return null;
  const parts = isoDate.split("-").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) return null;
  const [year, month, day] = parts;
  const today = new Date();
  let age = today.getFullYear() - year;
  const monthNow = today.getMonth() + 1;
  const hasBirthdayPassed =
    monthNow > month || (monthNow === month && today.getDate() >= day);
  if (!hasBirthdayPassed) age -= 1;
  return age;
};

export default function PlayerProfilePage() {
  const params = useParams();
  const id = useMemo(() => {
    const raw = params?.id;
    if (Array.isArray(raw)) return raw[0];
    return typeof raw === "string" ? raw : "";
  }, [params]);

  const [state, setState] = useState<ViewState>("loading");
  const [player, setPlayer] = useState<Player | null>(null);
  const [stats, setStats] = useState<PlayerStats>({
    matchesPlayed: 0,
    matchesWon: 0,
    matchesLost: 0,
    doubles: 0,
    triples: 0,
    hasFrontonMatch: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [rankings, setRankings] = useState<LeagueRanking[]>([]);
  const [rankingLoading, setRankingLoading] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!id) {
        if (!active) return;
        setState("error");
        setError("Jugador no encontrado");
        return;
      }

      setState("loading");
      setError(null);

      const res = await fetch(`/api/players/${id}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));

      if (!active) return;

      if (!res.ok) {
        setState("error");
        setError(data?.error ?? "Jugador no encontrado");
        return;
      }

      setPlayer(data?.player ?? null);
      if (data?.stats) {
        setStats({
          matchesPlayed: Number(data.stats.matchesPlayed ?? 0),
          matchesWon: Number(data.stats.matchesWon ?? 0),
          matchesLost: Number(data.stats.matchesLost ?? 0),
          doubles: Number(data.stats.doubles ?? 0),
          triples: Number(data.stats.triples ?? 0),
          hasFrontonMatch: Boolean(data.stats.hasFrontonMatch),
        });
      } else {
        setStats({
          matchesPlayed: 0,
          matchesWon: 0,
          matchesLost: 0,
          doubles: 0,
          triples: 0,
          hasFrontonMatch: false,
        });
      }
      setState("ready");
    };

    load();

    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    let active = true;

    const loadRankings = async () => {
      if (!id) return;
      setRankingLoading(true);
      const res = await fetch(`/api/players/${id}/ranking`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!active) return;
      setRankingLoading(false);
      if (res.ok && Array.isArray(data.rankings)) {
        setRankings(data.rankings);
      } else {
        setRankings([]);
      }
    };

    loadRankings();

    return () => {
      active = false;
    };
  }, [id]);

  if (state === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
        <div className="rounded-3xl bg-white p-6 sm:p-8 shadow-lg ring-1 ring-slate-200">
          <p className="text-lg font-semibold text-slate-900">Cargando jugador...</p>
        </div>
      </main>
    );
  }

  if (state === "error" || !player) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
        <div className="rounded-3xl bg-white p-6 sm:p-8 shadow-lg ring-1 ring-slate-200">
          <p className="text-lg font-semibold text-slate-900">
            {error ?? "Jugador no encontrado"}
          </p>

        </div>
      </main>
    );
  }

  const dob = toISODate(player.dateOfBirth);
  const age = calculateAge(dob);
  const genderLabel = genderCopy[player.gender] ?? player.gender;
  const statusLabel = statusCopy[player.status] ?? player.status;
  const locationLabel =
    [player.city, player.country].filter(Boolean).join(", ") || "Sin dato";
  const statsCards = [
    { label: "Partidos jugados", value: stats.matchesPlayed },
    { label: "Partidos ganados", value: stats.matchesWon },
    { label: "Partidos perdidos", value: stats.matchesLost },
  ];
  if (stats.hasFrontonMatch) {
    statsCards.push(
      { label: "Dobles (Fronton)", value: stats.doubles },
      { label: "Triples (Fronton)", value: stats.triples }
    );
  }

  return (
    <main
      className={`${bodyFont.className} player-profile-page relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 sm:px-6 sm:py-14`}
    >
      <div className="player-profile-glow player-profile-glow--top pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full blur-[140px]" />
      <div className="player-profile-glow player-profile-glow--bottom pointer-events-none absolute bottom-0 right-0 h-80 w-80 rounded-full blur-[160px]" />

      <div className="player-profile-shell w-full max-w-5xl rounded-[32px] border p-5 sm:p-10 shadow-[0_30px_60px_-45px_rgba(15,23,42,0.5)] backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.45em] text-amber-600">
              Perfil del jugador
            </p>
            <h1
              className={`${displayFont.className} mt-3 text-3xl font-semibold text-slate-900 sm:text-4xl`}
            >
              {player.firstName} {player.lastName}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-emerald-100 px-3 py-1 font-semibold text-emerald-700">
                {statusLabel}
              </span>
              <span className="rounded-full bg-indigo-100 px-3 py-1 font-semibold text-indigo-700">
                {genderLabel}
              </span>
            </div>
          </div>


        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[260px_1fr]">
          <div className="flex flex-col items-center gap-4">
            <div className="h-56 w-56 overflow-hidden rounded-[28px] border border-white bg-slate-100 shadow-[0_18px_40px_-25px_rgba(15,23,42,0.45)]">
              {player.photoUrl ? (
                <img
                  src={player.photoUrl}
                  alt="Foto del jugador"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 64 64"
                    className="h-20 w-20"
                    fill="none"
                  >
                    <circle cx="32" cy="24" r="12" stroke="currentColor" strokeWidth="3" />
                    <path
                      d="M12 56c2-10 12-18 20-18s18 8 20 18"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              )}
            </div>
            <div className="player-profile-card w-full rounded-2xl border p-4 text-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                Ubicacion
              </p>
              <p className="mt-3 text-sm font-semibold text-slate-900">
                {locationLabel}
              </p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="player-profile-card rounded-2xl border p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                  Fecha nacimiento
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {dob ?? "Sin dato"}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {age !== null ? `${age} años` : "Edad no registrada"}
                </p>
              </div>
              <div className="player-profile-card rounded-2xl border p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                  Resumen competitivo
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {stats.matchesPlayed} partidos
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {stats.matchesWon} ganados · {stats.matchesLost} perdidos
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {statsCards.map((item) => (
                <div
                  key={item.label}
                  className="player-profile-stat rounded-2xl border p-4 shadow-sm"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    {item.label}
                  </p>
                  <p className="mt-3 text-2xl font-semibold text-slate-900">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="player-profile-subtle mt-10 rounded-3xl border p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
                Ranking por categoria
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Se calcula por liga, temporada y categoria.
              </p>
            </div>
          </div>

          {rankingLoading ? (
            <p className="mt-4 text-sm text-slate-500">Cargando ranking...</p>
          ) : rankings.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">Sin ranking disponible.</p>
          ) : (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {rankings.map((entry) => (
                <div
                  key={`${entry.leagueId}-${entry.seasonId}-${entry.categoryId}`}
                  className="rounded-2xl border border-white bg-white px-4 py-4 shadow-[0_16px_40px_-30px_rgba(15,23,42,0.4)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {entry.leagueName}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Temporada {entry.seasonName}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Categoria: {entry.categoryName} ({entry.categoryAbbreviation})
                      </p>
                    </div>
                    <div className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-700">
                      #{entry.position ?? "-"}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                    <span className="rounded-full bg-slate-100 px-3 py-1">
                      {entry.points} pts
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1">
                      {entry.totalPlayers} jugadores
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1">
                      {entry.sportName ?? "Sin deporte"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

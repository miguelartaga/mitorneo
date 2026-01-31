"use client";

import { useMemo, useState } from "react";
import { useToast } from "@/components/ui/toast";

type League = {
  id: string;
  name: string;
};

type ClubForm = {
  name: string;
  address: string;
};

type Props = {
  leagues: League[];
};

const createEmptyClub = (): ClubForm => ({ name: "", address: "" });

export default function TournamentStepOne({ leagues }: Props) {
  const [form, setForm] = useState({
    name: "",
    leagueId: leagues[0]?.id ?? "",
    address: "",
    rankingEnabled: true,
    clubs: [createEmptyClub()],
  });
  const [loading, setLoading] = useState(false);
  const { success, error: toastError } = useToast();
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (!form.name.trim()) return false;
    if (form.rankingEnabled && !form.leagueId) return false;
    const validClubs = form.clubs.filter((club) => club.name.trim().length >= 2);
    return validClubs.length > 0;
  }, [form]);

  const updateClub = (index: number, field: keyof ClubForm, value: string) => {
    setForm((prev) => {
      const clubs = [...prev.clubs];
      clubs[index] = { ...clubs[index], [field]: value };
      return { ...prev, clubs };
    });
  };

  const addClub = () => {
    setForm((prev) => ({ ...prev, clubs: [...prev.clubs, createEmptyClub()] }));
  };

  const removeClub = (index: number) => {
    setForm((prev) => {
      const clubs = prev.clubs.filter((_, idx) => idx !== index);
      return { ...prev, clubs: clubs.length ? clubs : [createEmptyClub()] };
    });
  };

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: form.name,
          leagueId: form.leagueId,
          rankingEnabled: form.rankingEnabled,
          address: form.address || null,
          clubs: form.clubs.map((club) => ({
            name: club.name,
            address: club.address || null,
          })),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const detail = data?.detail ? ` (${data.detail})` : "";
        const msg = `${data?.error ?? "No se pudo crear el torneo"}${detail}`;
        setError(msg);
        toastError(msg);
        return;
      }

      if (!data?.tournament?.id) {
        const msg = "No se pudo abrir el siguiente paso";
        setError(msg);
        toastError(msg);
        return;
      }

      success("Torneo creado exitosamente");
      // Small delay to show toast before redirect
      setTimeout(() => {
        const nextUrl = `/admin/tournaments/${String(data.tournament.id)}/step-2`;
        window.location.assign(nextUrl);
      }, 1000);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "No se pudo conectar al servidor";
      setError(msg);
      toastError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-500">
              Paso 1
            </p>
            <h2 className="text-lg font-semibold text-slate-900">
              Datos principales del torneo
            </h2>
          </div>
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
            Datos basicos
          </span>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">
              Nombre del torneo
            </label>
            <input
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="Ej. Open La Paz 2025"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm font-medium text-slate-700">
                Liga para ranking
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <input
                  type="checkbox"
                  checked={!form.rankingEnabled}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      rankingEnabled: !e.target.checked,
                      leagueId: e.target.checked ? "" : prev.leagueId,
                    }))
                  }
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Torneo sin ranking
              </label>
            </div>
            <select
              value={form.leagueId}
              onChange={(e) => setForm((prev) => ({ ...prev, leagueId: e.target.value }))}
              disabled={!form.rankingEnabled}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-slate-100"
            >
              <option value="">Selecciona liga</option>
              {leagues.map((league) => (
                <option key={league.id} value={league.id}>
                  {league.name}
                </option>
              ))}
            </select>
            {form.rankingEnabled && leagues.length === 0 && (
              <p className="text-xs text-slate-500">
                Primero crea una liga para poder asignar el ranking.
              </p>
            )}
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-slate-700">
              Direccion del torneo
            </label>
            <input
              value={form.address}
              onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="Ej. Av. Principal #123"
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Clubes / complejos</h3>
            <p className="text-sm text-slate-600">
              Agrega los complejos deportivos que usara el torneo.
            </p>
          </div>
          <button
            type="button"
            onClick={addClub}
            className="inline-flex items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
          >
            + Agregar club
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {form.clubs.map((club, index) => (
            <div
              key={`club-${index}`}
              className="rounded-xl border border-slate-100 bg-slate-50 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-800">
                  Club {index + 1}
                </p>
                {form.clubs.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeClub(index)}
                    className="text-xs font-semibold text-red-600 transition hover:text-red-700"
                  >
                    Quitar
                  </button>
                )}
              </div>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">
                    Nombre del complejo
                  </label>
                  <input
                    value={club.name}
                    onChange={(e) => updateClub(index, "name", e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    placeholder="Ej. Complejo Central"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">
                    Direccion
                  </label>
                  <input
                    value={club.address}
                    onChange={(e) => updateClub(index, "address", e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    placeholder="Ej. Calle 8, Zona Sur"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          Completa los datos basicos para continuar al siguiente paso.
        </p>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || loading}
          className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? "Guardando..." : "Siguiente"}
        </button>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
    </div>
  );
}

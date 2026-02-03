"use client";

import { useMemo, useState } from "react";

type League = {
  id: string;
  name: string;
};

type Tournament = {
  id: string;
  name: string;
  status: "WAITING" | "ACTIVE" | "FINISHED";
  paymentRate: string;
  paymentPaidAmount?: string;
  paymentReportedAmount?: string | null;
  paymentReportedNote?: string | null;
  paymentReportedAt?: string | Date | null;
  paymentReportedBy?: { id: string; name: string | null; email: string } | null;
  rankingEnabled: boolean;
  league?: League | null;
  startDate: string | Date | null;
};

type Props = {
  initialTournaments: Tournament[];
  paymentRateDefault: string;
  paymentQrUrl: string;
};

const toISODate = (value: string | Date | null | undefined) => {
  if (!value) return "N/D";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/D";
  return parsed.toISOString().split("T")[0];
};

export default function TournamentStatusPanel({
  initialTournaments,
  paymentRateDefault,
  paymentQrUrl,
}: Props) {
  const [tournaments, setTournaments] = useState<Tournament[]>(initialTournaments);
  const [defaultRate, setDefaultRate] = useState(paymentRateDefault || "0");
  const [qrUrl, setQrUrl] = useState(paymentQrUrl || "");
  const [qrPreview, setQrPreview] = useState(paymentQrUrl || "");
  const [statusEdits, setStatusEdits] = useState<
    Record<string, "WAITING" | "ACTIVE" | "FINISHED">
  >({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [reportActionId, setReportActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const sortedTournaments = useMemo(
    () => [...tournaments].sort((a, b) => a.name.localeCompare(b.name)),
    [tournaments]
  );

  const refreshTournaments = async () => {
    const res = await fetch("/api/tournaments", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(data.tournaments)) {
      const normalized = data.tournaments.map((tournament: Tournament) => ({
        ...tournament,
        paymentRate:
          tournament.paymentRate !== undefined && tournament.paymentRate !== null
            ? String(tournament.paymentRate)
            : "0",
        status: tournament.status ?? "WAITING",
      }));
      setTournaments(normalized);
    }
  };

  const saveDefaultRate = async () => {
    setSavingId("default");
    setError(null);
    setMessage(null);
    const res = await fetch("/api/settings/payment-rate", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        paymentRateDefault: defaultRate,
        paymentQrUrl: qrPreview || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = data?.detail ? ` (${data.detail})` : "";
      setError(`${data?.error ?? "No se pudo guardar el monto"}${detail}`);
      setSavingId(null);
      return;
    }
    if (data?.paymentRateDefault !== undefined) {
      setDefaultRate(String(data.paymentRateDefault));
    }
    const nextQr = typeof data?.paymentQrUrl === "string" ? data.paymentQrUrl : "";
    setQrUrl(nextQr);
    setQrPreview(nextQr);
    setMessage("Monto global actualizado");
    setSavingId(null);
  };

  const handleQrFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setQrPreview(reader.result);
        setQrUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const saveTournament = async (tournament: Tournament) => {
    const nextStatus = statusEdits[tournament.id] ?? tournament.status;
    const statusChanged = tournament.status !== nextStatus;
    if (!statusChanged) return;
    setSavingId(tournament.id);
    setError(null);
    setMessage(null);
    try {
      if (statusChanged) {
        const statusRes = await fetch(
          `/api/tournaments/${tournament.id}/status`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ status: nextStatus }),
          }
        );
        const statusData = await statusRes.json().catch(() => ({}));
        if (!statusRes.ok) {
          const detail = statusData?.detail ? ` (${statusData.detail})` : "";
          throw new Error(
            `${statusData?.error ?? "No se pudo actualizar el estado"}${detail}`
          );
        }
      }
      await refreshTournaments();
      setMessage("Torneo actualizado");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSavingId(null);
    }
  };

  const approveReport = async (tournamentId: string) => {
    setReportActionId(tournamentId);
    setError(null);
    setMessage(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/payment-report/approve`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = data?.detail ? ` (${data.detail})` : "";
      setError(`${data?.error ?? "No se pudo aprobar el reporte"}${detail}`);
      setReportActionId(null);
      return;
    }
    await refreshTournaments();
    setMessage("Pago reportado aprobado");
    setReportActionId(null);
  };

  const rejectReport = async (tournamentId: string) => {
    setReportActionId(tournamentId);
    setError(null);
    setMessage(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/payment-report/reject`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = data?.detail ? ` (${data.detail})` : "";
      setError(`${data?.error ?? "No se pudo rechazar el reporte"}${detail}`);
      setReportActionId(null);
      return;
    }
    await refreshTournaments();
    setMessage("Reporte de pago rechazado");
    setReportActionId(null);
  };

  return (
    <div className="space-y-8">
      <div className="admin-fade-up overflow-hidden rounded-[24px] border border-slate-200/70 bg-white/90 p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.35)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
              Monto global
            </p>
            <p className="text-sm text-slate-600">
              Este monto se aplica a todos los torneos nuevos.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr]">
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Monto global por inscrito
              </label>
              <input
                value={defaultRate}
                onChange={(event) => setDefaultRate(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                QR de pago
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleQrFileChange}
                className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-full file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-[11px] file:font-semibold file:text-white hover:file:bg-slate-800"
              />
              <input
                value={qrUrl}
                onChange={(event) => {
                  setQrUrl(event.target.value);
                  setQrPreview(event.target.value);
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                placeholder="URL o data:image..."
              />
            </div>
            <button
              type="button"
              onClick={saveDefaultRate}
              disabled={savingId === "default"}
              className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {savingId === "default" ? "Guardando..." : "Guardar monto global"}
            </button>
          </div>
          <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Vista previa QR
            </p>
            <div className="mt-3 flex h-48 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white">
              {qrPreview ? (
                <img
                  src={qrPreview}
                  alt="QR de pago"
                  className="max-h-44 object-contain"
                />
              ) : (
                <span className="text-xs text-slate-400">Sin imagen</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="admin-fade-up overflow-hidden rounded-[24px] border border-slate-200/70 bg-white/90 p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.35)]">
        <h3 className="text-lg font-semibold text-slate-900">Ver torneos</h3>
        {sortedTournaments.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">Aun no hay torneos.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {sortedTournaments.map((tournament) => (
              <div
                key={tournament.id}
                className="rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 shadow-[0_12px_30px_-22px_rgba(15,23,42,0.25)]"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {tournament.name}
                    </p>
                    <p className="text-xs text-slate-600">
                      {tournament.rankingEnabled
                        ? `Ranking: ${tournament.league?.name ?? "Sin liga"}`
                        : "Torneo sin ranking"}
                    </p>
                    <p className="text-xs text-slate-500">
                      Inicio: {toISODate(tournament.startDate)}
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 rounded-2xl border border-slate-200/70 bg-slate-50/80 p-3 md:grid-cols-[1fr_auto]">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Estado
                    </label>
                    <select
                      value={statusEdits[tournament.id] ?? tournament.status}
                      onChange={(event) =>
                        setStatusEdits((prev) => ({
                          ...prev,
                          [tournament.id]: event.target.value as
                            | "WAITING"
                            | "ACTIVE"
                            | "FINISHED",
                        }))
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    >
                      <option value="WAITING">En espera</option>
                      <option value="ACTIVE">Torneo pagado</option>
                      <option value="FINISHED">Finalizado</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => saveTournament(tournament)}
                      disabled={savingId === tournament.id}
                      className="w-full rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {savingId === tournament.id ? "Guardando..." : "Guardar"}
                    </button>
                  </div>
                </div>
                {tournament.paymentReportedAmount && (
                  <div className="mt-3 rounded-2xl border border-amber-200/80 bg-amber-50/80 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">
                      Reporte de pago pendiente
                    </p>
                    <div className="mt-2 grid gap-2 text-xs text-amber-800 sm:grid-cols-2">
                      <div>
                        <span className="font-semibold">Monto:</span>{" "}
                        {tournament.paymentReportedAmount} Bs
                      </div>
                      <div>
                        <span className="font-semibold">Reportado:</span>{" "}
                        {toISODate(tournament.paymentReportedAt ?? null)}
                      </div>
                      {tournament.paymentReportedBy && (
                        <div className="sm:col-span-2">
                          <span className="font-semibold">Usuario:</span>{" "}
                          {tournament.paymentReportedBy.name ??
                            tournament.paymentReportedBy.email}
                        </div>
                      )}
                      {tournament.paymentReportedNote && (
                        <div className="sm:col-span-2">
                          <span className="font-semibold">Nota:</span>{" "}
                          {tournament.paymentReportedNote}
                        </div>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => approveReport(tournament.id)}
                        disabled={reportActionId === tournament.id}
                        className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        Aprobar reporte
                      </button>
                      <button
                        type="button"
                        onClick={() => rejectReport(tournament.id)}
                        disabled={reportActionId === tournament.id}
                        className="rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 shadow-sm transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        Rechazar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {message && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          {message}
        </p>
      )}
    </div>
  );
}

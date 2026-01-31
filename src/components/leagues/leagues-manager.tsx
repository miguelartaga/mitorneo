"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { Upload } from "lucide-react";

type Season = {
  id: string;
  name: string;
  startDate: string | Date;
  endDate: string | Date;
};

type League = {
  id: string;
  name: string;
  description: string | null;
  photoUrl?: string | null;
  ownerId?: string | null;
  canEdit?: boolean;
  seasons: Season[];
};

type Props = {
  initialLeagues: League[];
  currentUserId: string;
  isAdmin: boolean;
};

const toISODate = (value: string | Date) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().split("T")[0];
};

export default function LeaguesManager({ initialLeagues, currentUserId, isAdmin }: Props) {
  const [leagues, setLeagues] = useState<League[]>(initialLeagues);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activePermissionsLeagueId, setActivePermissionsLeagueId] = useState<
    string | null
  >(null);
  const [permissionEmail, setPermissionEmail] = useState("");
  const [permissionUsers, setPermissionUsers] = useState<
    { id: string; name: string | null; email: string }[]
  >([]);
  const [permissionLoading, setPermissionLoading] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [permissionMessage, setPermissionMessage] = useState<string | null>(null);
  const [leagueForm, setLeagueForm] = useState({
    name: "",
    description: "",
    photoUrl: "",
  });
  const [seasonForm, setSeasonForm] = useState({
    leagueId: initialLeagues[0]?.id ?? "",
    name: "",
    startDate: "",
    endDate: "",
  });
  const canManageLeague = (league: League) =>
    league.canEdit ?? (isAdmin || league.ownerId === currentUserId);
  const canManagePermissions = (league: League) =>
    isAdmin || league.ownerId === currentUserId;

  const refreshLeagues = async () => {
    const res = await fetch("/api/leagues", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(data.leagues)) {
      setLeagues(data.leagues);
      if (editingId && !data.leagues.some((league: League) => league.id === editingId)) {
        setEditingId(null);
        setLeagueForm({ name: "", description: "", photoUrl: "" });
      }
      const hasLeague = data.leagues.length > 0;
      const leagueExists = data.leagues.some(
        (league: League) => league.id === seasonForm.leagueId
      );
      if ((!seasonForm.leagueId || !leagueExists) && hasLeague) {
        setSeasonForm((prev) => ({ ...prev, leagueId: data.leagues[0].id }));
      }
      if (!hasLeague) {
        setSeasonForm((prev) => ({ ...prev, leagueId: "" }));
      }
    }
  };

  const handleSaveLeague = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);

    const res = await fetch(editingId ? `/api/leagues/${editingId}` : "/api/leagues", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: leagueForm.name,
        description: leagueForm.description || null,
        photoUrl: leagueForm.photoUrl || null,
      }),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      const detail = data?.detail ? ` (${data.detail})` : "";
      const fallback = editingId ? "No se pudo actualizar la liga" : "No se pudo crear la liga";
      setError(`${data?.error ?? fallback}${detail}`);
      return;
    }

    await refreshLeagues();
    setLeagueForm({ name: "", description: "", photoUrl: "" });
    setEditingId(null);
    setMessage(editingId ? "Liga actualizada" : "Liga creada");
  };

  const handleLeaguePhotoUpload = async (file?: File | null) => {
    if (!file) return;
    setUploadingPhoto(true);
    setError(null);
    setMessage(null);

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/uploads/league-photo", {
      method: "POST",
      body: formData,
    });

    const data = await res.json().catch(() => ({}));
    setUploadingPhoto(false);

    if (!res.ok) {
      setError(data?.error ?? "No se pudo subir la foto");
      return;
    }

    setLeagueForm((prev) => ({ ...prev, photoUrl: data.url as string }));
    setMessage("Foto subida");
  };

  const startEditing = (league: League) => {
    if (!canManageLeague(league)) return;
    setEditingId(league.id);
    setLeagueForm({
      name: league.name,
      description: league.description ?? "",
      photoUrl: league.photoUrl ?? "",
    });
    setMessage("Editando liga");
    setError(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setLeagueForm({ name: "", description: "", photoUrl: "" });
    setMessage(null);
    setError(null);
  };

  const handleDeleteLeague = async (league: League) => {
    if (!canManageLeague(league)) return;
    const confirmed = window.confirm(
      `Eliminar la liga "${league.name}"? Esta accion no se puede deshacer.`
    );
    if (!confirmed) return;

    setLoading(true);
    setError(null);
    setMessage(null);

    const res = await fetch(`/api/leagues/${league.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      const detail = data?.detail ? ` (${data.detail})` : "";
      setError(`${data?.error ?? "No se pudo eliminar la liga"}${detail}`);
      return;
    }

    await refreshLeagues();
    if (editingId === league.id) {
      cancelEditing();
    }
    setMessage("Liga eliminada");
  };

  const fetchPermissions = async (leagueId: string) => {
    setPermissionLoading(true);
    setPermissionError(null);
    setPermissionMessage(null);
    const res = await fetch(`/api/leagues/${leagueId}/permissions`, {
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    setPermissionLoading(false);
    if (!res.ok) {
      setPermissionError(data?.error ?? "No se pudieron cargar los permisos");
      setPermissionUsers([]);
      return;
    }
    setPermissionUsers(Array.isArray(data.permissions) ? data.permissions : []);
  };

  const openPermissions = async (leagueId: string) => {
    setActivePermissionsLeagueId(leagueId);
    setPermissionEmail("");
    await fetchPermissions(leagueId);
  };

  const closePermissions = () => {
    setActivePermissionsLeagueId(null);
    setPermissionEmail("");
    setPermissionUsers([]);
    setPermissionError(null);
    setPermissionMessage(null);
  };

  const handleGrantPermission = async (leagueId: string) => {
    if (!permissionEmail.trim()) {
      setPermissionError("Ingresa el correo del usuario");
      return;
    }
    setPermissionLoading(true);
    setPermissionError(null);
    setPermissionMessage(null);
    const res = await fetch(`/api/leagues/${leagueId}/permissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email: permissionEmail.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    setPermissionLoading(false);
    if (!res.ok) {
      setPermissionError(data?.error ?? "No se pudo agregar el permiso");
      return;
    }
    setPermissionEmail("");
    setPermissionMessage("Permiso agregado");
    await fetchPermissions(leagueId);
  };

  const handleRevokePermission = async (leagueId: string, userId: string) => {
    setPermissionLoading(true);
    setPermissionError(null);
    setPermissionMessage(null);
    const res = await fetch(`/api/leagues/${leagueId}/permissions`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ userId }),
    });
    const data = await res.json().catch(() => ({}));
    setPermissionLoading(false);
    if (!res.ok) {
      setPermissionError(data?.error ?? "No se pudo quitar el permiso");
      return;
    }
    setPermissionMessage("Permiso removido");
    await fetchPermissions(leagueId);
  };

  const handleCreateSeason = async () => {
    if (!seasonForm.leagueId) {
      setError("Selecciona una liga");
      return;
    }
    const targetLeague = leagues.find((league) => league.id === seasonForm.leagueId);
    if (!targetLeague || !canManageLeague(targetLeague)) {
      setError("Solo puedes crear temporadas para tus ligas");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    const res = await fetch(`/api/leagues/${seasonForm.leagueId}/seasons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: seasonForm.name,
        startDate: seasonForm.startDate,
        endDate: seasonForm.endDate,
      }),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      const detail = data?.detail ? ` (${data.detail})` : "";
      setError(`${data?.error ?? "No se pudo crear la temporada"}${detail}`);
      return;
    }

    await refreshLeagues();
    setSeasonForm((prev) => ({
      ...prev,
      name: "",
      startDate: "",
      endDate: "",
    }));
    setMessage("Temporada creada");
  };

  return (
    <div className="space-y-8">
      <div className="admin-fade-up relative overflow-hidden rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-[0_24px_70px_-50px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/70 backdrop-blur">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-indigo-300/70 via-sky-300/60 to-amber-200/70" />
        <h2 className="text-2xl font-semibold text-slate-900">
          {editingId ? "Editar liga" : "Crear liga"}
        </h2>
        <p className="text-sm text-slate-600">
          {editingId
            ? "Actualiza los datos de la liga seleccionada."
            : "Define una liga con nombre y descripcion."}
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Nombre</label>
            <input
              value={leagueForm.name}
              onChange={(e) => setLeagueForm((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="Liga Municipal"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Descripcion</label>
            <input
              value={leagueForm.description}
              onChange={(e) =>
                setLeagueForm((prev) => ({ ...prev, description: e.target.value }))
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="Liga anual de la ciudad"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Foto</label>
            <input
              type="text"
              value={leagueForm.photoUrl}
              onChange={(e) =>
                setLeagueForm((prev) => ({ ...prev, photoUrl: e.target.value }))
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="https://... o usa el boton de subir"
            />
            <div className="flex items-center gap-3">
              <label className="cursor-pointer inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                <Upload className="h-4 w-4" />
                <span>Subir</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleLeaguePhotoUpload(e.target.files?.[0])}
                  className="hidden"
                />
              </label>
              {uploadingPhoto && (
                <span className="text-xs text-slate-500 dark:text-slate-400">Subiendo...</span>
              )}
              {leagueForm.photoUrl && !uploadingPhoto && (
                <span className="text-xs text-emerald-700 dark:text-emerald-400">Foto lista</span>
              )}
            </div>
            {leagueForm.photoUrl && (
              <div className="mt-2 h-20 w-20 overflow-hidden rounded-2xl ring-1 ring-slate-200/70 shadow-sm">
                <img
                  src={leagueForm.photoUrl}
                  alt="Foto de la liga"
                  className="h-full w-full object-cover"
                />
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          {editingId && (
            <button
              type="button"
              onClick={cancelEditing}
              className="mr-3 inline-flex items-center justify-center rounded-full border border-slate-200 bg-white/80 px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-white"
            >
              Cancelar
            </button>
          )}
          <button
            type="button"
            onClick={handleSaveLeague}
            disabled={loading || leagueForm.name.trim().length < 2}
            className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_-22px_rgba(79,70,229,0.5)] transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Guardando..." : editingId ? "Guardar cambios" : "Crear liga"}
          </button>
        </div>
      </div>

      <div className="admin-fade-up relative overflow-hidden rounded-[24px] border border-white/70 bg-white/80 p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/70 backdrop-blur">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-slate-200/80 via-indigo-200/60 to-slate-200/80" />
        <h2 className="text-2xl font-semibold text-slate-900">Crear temporada</h2>
        <p className="text-sm text-slate-600">
          Ejemplo de nombre: 2024/2025 o 2025.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Liga</label>
            <select
              value={seasonForm.leagueId}
              onChange={(e) =>
                setSeasonForm((prev) => ({ ...prev, leagueId: e.target.value }))
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="">Selecciona liga</option>
              {leagues.map((league) => (
                <option
                  key={league.id}
                  value={league.id}
                  disabled={!canManageLeague(league)}
                >
                  {league.name}
                  {!canManageLeague(league) ? " (solo lectura)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Nombre</label>
            <input
              value={seasonForm.name}
              onChange={(e) => setSeasonForm((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="2024/2025"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Fecha inicio</label>
            <input
              type="date"
              value={seasonForm.startDate}
              onChange={(e) =>
                setSeasonForm((prev) => ({ ...prev, startDate: e.target.value }))
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Fecha fin</label>
            <input
              type="date"
              value={seasonForm.endDate}
              onChange={(e) =>
                setSeasonForm((prev) => ({ ...prev, endDate: e.target.value }))
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={handleCreateSeason}
            disabled={
              loading ||
              !seasonForm.leagueId ||
              seasonForm.name.trim().length < 2 ||
              !seasonForm.startDate ||
              !seasonForm.endDate
            }
            className="inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_-22px_rgba(15,23,42,0.5)] transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Guardando..." : "Crear temporada"}
          </button>
        </div>
      </div>

      <div className="admin-fade-up relative overflow-hidden rounded-[24px] border border-white/70 bg-white/80 p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/70 backdrop-blur">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-slate-200/80 via-indigo-200/60 to-slate-200/80" />
        <h3 className="text-lg font-semibold text-slate-900">Ligas registradas</h3>
        {leagues.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">Aun no hay ligas.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {leagues.map((league) => (
              <div
                key={league.id}
                className="rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 shadow-[0_12px_30px_-22px_rgba(15,23,42,0.25)]"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/70 shadow-sm">
                      {league.photoUrl ? (
                        <img
                          src={league.photoUrl}
                          alt="Foto liga"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                          Sin foto
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{league.name}</p>
                      {league.description && (
                        <p className="text-xs text-slate-600">{league.description}</p>
                      )}
                      {editingId === league.id && (
                        <p className="text-[11px] font-semibold text-indigo-600">
                          Editando
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-start gap-2 sm:items-end">
                    <span className="text-xs text-slate-500">
                      {league.seasons.length} temporada(s)
                    </span>
                    {canManageLeague(league) ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startEditing(league)}
                          className="rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-white"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteLeague(league)}
                          className="rounded-full border border-red-200 bg-red-50/60 px-3 py-1.5 text-xs font-semibold text-red-600 shadow-sm transition hover:bg-red-50"
                        >
                          Eliminar
                        </button>
                        {canManagePermissions(league) && (
                          <button
                            type="button"
                            onClick={() =>
                              activePermissionsLeagueId === league.id
                                ? closePermissions()
                                : openPermissions(league.id)
                            }
                            className="rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-white"
                          >
                            Permisos
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-[11px] font-semibold text-slate-400">
                        Solo lectura
                      </span>
                    )}
                  </div>
                </div>
                {seasonForm.leagueId === league.id && league.seasons.length > 0 && (
                  <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200/70 bg-white/80 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.2)]">
                    <table className="min-w-[520px] divide-y divide-slate-200/70 text-xs">
                      <thead className="bg-slate-50/80 text-[11px] uppercase tracking-[0.2em] text-slate-500">
                        <tr>
                          <th className="px-3 py-3 text-left font-semibold text-slate-700">
                            Temporada
                          </th>
                          <th className="px-3 py-3 text-left font-semibold text-slate-700">
                            Inicio
                          </th>
                          <th className="px-3 py-3 text-left font-semibold text-slate-700">
                            Fin
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {league.seasons.map((season) => (
                          <tr key={season.id}>
                            <td className="px-3 py-2 text-slate-800">{season.name}</td>
                            <td className="px-3 py-2 text-slate-600">
                              {toISODate(season.startDate)}
                            </td>
                            <td className="px-3 py-2 text-slate-600">
                              {toISODate(season.endDate)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {activePermissionsLeagueId === league.id && canManagePermissions(league) && (
                  <div className="mt-4 rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.2)]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Permisos de edicion
                      </p>
                      <button
                        type="button"
                        onClick={closePermissions}
                        className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600"
                      >
                        Cerrar
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <input
                        value={permissionEmail}
                        onChange={(e) => setPermissionEmail(e.target.value)}
                        type="email"
                        placeholder="correo@ejemplo.com"
                        className="w-full flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      />
                      <button
                        type="button"
                        onClick={() => handleGrantPermission(league.id)}
                        disabled={permissionLoading}
                        className="rounded-full bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        Agregar
                      </button>
                    </div>
                    <div className="mt-3 space-y-2">
                      {permissionUsers.length === 0 ? (
                        <p className="text-xs text-slate-500">
                          Aun no hay usuarios con permiso.
                        </p>
                      ) : (
                        permissionUsers.map((user) => (
                          <div
                            key={user.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/70 bg-white/80 px-3 py-2"
                          >
                            <div>
                              <p className="text-sm font-semibold text-slate-800">
                                {user.name ?? "Sin nombre"}
                              </p>
                              <p className="text-xs text-slate-500">{user.email}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRevokePermission(league.id, user.id)}
                              disabled={permissionLoading}
                              className="rounded-full border border-red-200 bg-red-50/60 px-3 py-1 text-[11px] font-semibold text-red-600 shadow-sm transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              Quitar
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                    {permissionError && (
                      <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                        {permissionError}
                      </p>
                    )}
                    {permissionMessage && (
                      <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
                        {permissionMessage}
                      </p>
                    )}
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

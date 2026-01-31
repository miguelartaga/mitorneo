"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Upload } from "lucide-react";

type PlayerStatus = "UNCONFIRMED" | "CONFIRMED";
type DocumentType = "ID_CARD" | "PASSPORT";
type Gender = "MALE" | "FEMALE" | "OTHER" | "NOT_SPECIFIED";

type Player = {
  id: string;
  documentType: DocumentType;
  documentNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | Date | null;
  phone: string | null;
  gender: Gender;
  country: string | null;
  city: string | null;
  photoUrl: string | null;
  status: PlayerStatus;
  createdById?: string | null;
};

type Props = {
  initialPlayers: Player[];
  canConfirm: boolean;
  scope?: "all" | "own";
  currentUserId?: string;
  currentUserRole?: "ADMIN" | "TOURNAMENT_ADMIN" | string;
};

const statusCopy: Record<PlayerStatus, string> = {
  UNCONFIRMED: "No confirmado",
  CONFIRMED: "Confirmado",
};

const countryOptions = [
  "Bolivia",
  "Argentina",
  "Chile",
  "Peru",
  "Paraguay",
  "Brasil",
  "Mexico",
  "Estados Unidos",
  "Espana",
  "Otro",
];

const cityOptionsByCountry: Record<string, string[]> = {
  Bolivia: [
    "La Paz",
    "Santa Cruz",
    "Cochabamba",
    "Oruro",
    "Potosi",
    "Sucre",
    "Tarija",
    "Beni",
    "Pando",
  ],
  Chile: ["Santiago", "Valparaiso", "Concepcion", "La Serena", "Antofagasta"],
  Argentina: ["Buenos Aires", "Cordoba", "Rosario", "Mendoza", "La Plata"],
  Peru: ["Lima", "Arequipa", "Cusco", "Trujillo", "Piura"],
  Paraguay: ["Asuncion", "Ciudad del Este", "Encarnacion"],
  Brasil: ["Sao Paulo", "Rio de Janeiro", "Brasilia", "Curitiba", "Salvador"],
  Mexico: ["Ciudad de Mexico", "Guadalajara", "Monterrey", "Puebla", "Tijuana"],
  "Estados Unidos": ["Miami", "Los Angeles", "New York", "Houston", "Chicago"],
  Espana: ["Madrid", "Barcelona", "Valencia", "Sevilla", "Bilbao"],
};

export default function PlayersManager({
  initialPlayers,
  canConfirm,
  scope = "all",
  currentUserId,
  currentUserRole,
}: Props) {
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>(initialPlayers);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState({
    documentType: "ID_CARD" as DocumentType,
    documentNumber: "",
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    phone: "",
    gender: "NOT_SPECIFIED" as Gender,
    city: "",
    country: "",
    photoUrl: "",
  });

  const cityOptions = cityOptionsByCountry[form.country] ?? [];

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handlePhotoUpload = async (file?: File | null) => {
    if (!file) return;
    setUploadingPhoto(true);
    setError(null);
    setMessage(null);

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/uploads/player-photo", {
      method: "POST",
      body: formData,
    });

    const data = await res.json().catch(() => ({}));
    setUploadingPhoto(false);

    if (!res.ok) {
      setError(data?.error ?? "No se pudo subir la foto");
      return;
    }

    updateField("photoUrl", data.url as string);
    setMessage("Foto subida");
  };

  const handleCreate = async () => {
    setError(null);
    setMessage(null);
    setLoading(true);

    const res = await fetch("/api/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        ...form,
        dateOfBirth: form.dateOfBirth || null,
        city: form.city || null,
        country: form.country || null,
        phone: form.phone || null,
        photoUrl: form.photoUrl || null,
      }),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      const detail = data?.detail ? ` (${data.detail})` : "";
      setError(`${data?.error ?? "No se pudo crear el jugador"}${detail}`);
      return;
    }

    await refreshPlayers();
    setForm({
      documentType: "ID_CARD",
      documentNumber: "",
      firstName: "",
      lastName: "",
      dateOfBirth: "",
      phone: "",
      gender: "NOT_SPECIFIED",
      city: "",
      country: "",
      photoUrl: "",
    });
    setMessage("Jugador creado en estado no confirmado");
  };

  const handleUpdate = async () => {
    if (!editingId) {
      setError("No se pudo actualizar el jugador (ID no valido)");
      return;
    }
    setError(null);
    setMessage(null);
    setLoading(true);

    const res = await fetch(`/api/players/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        id: editingId,
        ...form,
        dateOfBirth: form.dateOfBirth || null,
        city: form.city || null,
        country: form.country || null,
        phone: form.phone || null,
        photoUrl: form.photoUrl || null,
      }),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      const detail = data?.detail ? ` (${data.detail})` : "";
      setError(`${data?.error ?? "No se pudo actualizar el jugador"}${detail}`);
      return;
    }

    await refreshPlayers();
    setEditingId(null);
    setMessage("Jugador actualizado");
  };

  const startEditing = (player: Player) => {
    if (!canEditPlayer(player)) {
      setMessage("Solo lectura");
      return;
    }
    setEditingId(player.id);
    const dobValue =
      typeof player.dateOfBirth === "string" && player.dateOfBirth
        ? player.dateOfBirth.split("T")[0]
        : player.dateOfBirth
          ? new Date(player.dateOfBirth).toISOString().split("T")[0]
          : "";
    setForm({
      documentType: player.documentType,
      documentNumber: player.documentNumber,
      firstName: player.firstName,
      lastName: player.lastName,
      dateOfBirth: dobValue,
      phone: player.phone || "",
      gender: player.gender,
      city: player.city || "",
      country: player.country || "",
      photoUrl: player.photoUrl || "",
    });
    setMessage("Editando jugador");
  };

  const cancelEditing = () => {
    setEditingId(null);
    setForm({
      documentType: "ID_CARD",
      documentNumber: "",
      firstName: "",
      lastName: "",
      dateOfBirth: "",
      phone: "",
      gender: "NOT_SPECIFIED",
      city: "",
      country: "",
      photoUrl: "",
    });
    setMessage(null);
    setError(null);
  };

  const confirmPlayer = async (id?: string) => {
    if (!canConfirm) {
      setError("Solo admin puede confirmar jugadores");
      return;
    }
    if (!id) {
      setError("No se pudo actualizar el jugador (ID no valido)");
      return;
    }
    setError(null);
    setMessage(null);
    setLoading(true);

    const res = await fetch(`/api/players/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id, status: "CONFIRMED" }),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      const detail = data?.detail ? ` (${data.detail})` : "";
      setError(`${data?.error ?? "No se pudo actualizar el jugador"}${detail}`);
      return;
    }

    await refreshPlayers();
    setMessage("Jugador confirmado");
  };

  const canEditPlayer = (player: Player) => {
    if (currentUserRole === "ADMIN") return true;
    if (!currentUserId) return false;
    return player.createdById === currentUserId;
  };

  const filteredPlayers = players.filter((player) => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return true;
    const name = `${player.firstName} ${player.lastName}`.toLowerCase();
    const doc = `${player.documentNumber}`.toLowerCase();
    const city = (player.city ?? "").toLowerCase();
    const country = (player.country ?? "").toLowerCase();
    return (
      name.includes(term) ||
      doc.includes(term) ||
      city.includes(term) ||
      country.includes(term)
    );
  });

  const refreshPlayers = async () => {
    const scopeParam = scope === "own" ? "?scope=own" : "";
    const res = await fetch(`/api/players${scopeParam}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(data.players)) {
      setPlayers(data.players);
    }
    router.refresh();
  };

  return (
    <div className="space-y-8" suppressHydrationWarning>
      <div className="admin-fade-up relative overflow-hidden rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-[0_24px_70px_-50px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/70 backdrop-blur">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-indigo-300/70 via-sky-300/60 to-amber-200/70" />
        <h2 className="text-2xl font-semibold text-slate-900">Agregar jugador</h2>
        <p className="text-sm text-slate-600">
          Solo nombre, apellido y documento son obligatorios. El resto es opcional.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Tipo de documento</label>
            <select
              value={form.documentType}
              onChange={(e) => updateField("documentType", e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="ID_CARD">Carnet de identidad</option>
              <option value="PASSPORT">Pasaporte</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Número</label>
            <input
              value={form.documentNumber}
              onChange={(e) => updateField("documentNumber", e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="12345678"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Nombre</label>
            <input
              value={form.firstName}
              onChange={(e) => updateField("firstName", e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="Juan"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Apellido</label>
            <input
              value={form.lastName}
              onChange={(e) => updateField("lastName", e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="Perez"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Fecha de nacimiento</label>
            <input
              type="date"
              value={form.dateOfBirth}
              onChange={(e) => updateField("dateOfBirth", e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Teléfono</label>
            <input
              value={form.phone}
              onChange={(e) => updateField("phone", e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="+591..."
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Género</label>
            <select
              value={form.gender}
              onChange={(e) => updateField("gender", e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="NOT_SPECIFIED">No especificar</option>
              <option value="MALE">Masculino</option>
              <option value="FEMALE">Femenino</option>
              <option value="OTHER">Otro</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Pais</label>
            <select
              value={form.country}
              onChange={(e) => {
                const nextCountry = e.target.value;
                setForm((prev) => ({
                  ...prev,
                  country: nextCountry,
                  city: cityOptionsByCountry[nextCountry]?.includes(prev.city)
                    ? prev.city
                    : "",
                }));
              }}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="">Selecciona pais</option>
              {countryOptions.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Ciudad</label>
            <select
              value={form.city}
              onChange={(e) => updateField("city", e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="">Selecciona ciudad</option>
              {cityOptions.length > 0 ? (
                cityOptions.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))
              ) : (
                <option value="Otra">Otra</option>
              )}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Foto</label>
            <input
              type="text"
              value={form.photoUrl}
              onChange={(e) => updateField("photoUrl", e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="https://... o usa el botón de subir"
            />
            <div className="flex items-center gap-3">
              <label className="cursor-pointer inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                <Upload className="h-4 w-4" />
                <span>Subir</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handlePhotoUpload(e.target.files?.[0])}
                  className="hidden"
                />
              </label>
              {uploadingPhoto && (
                <span className="text-xs text-slate-500 dark:text-slate-400">Subiendo...</span>
              )}
              {form.photoUrl && !uploadingPhoto && (
                <span className="text-xs text-emerald-700 dark:text-emerald-400">Foto lista</span>
              )}
            </div>
            {form.photoUrl && (
              <div className="mt-2 h-20 w-20 overflow-hidden rounded-2xl ring-1 ring-slate-200/70 shadow-sm">
                <Image
                  src={form.photoUrl}
                  alt="Foto del jugador"
                  width={80}
                  height={80}
                  className="h-full w-full object-cover"
                />
              </div>
            )}
          </div>
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
        {message && (
          <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>
        )}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            disabled={
              loading ||
              form.documentNumber.trim().length === 0 ||
              form.firstName.trim().length === 0 ||
              form.lastName.trim().length === 0
            }
            onClick={editingId ? handleUpdate : handleCreate}
            className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_-22px_rgba(79,70,229,0.5)] transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            {loading
              ? "Guardando..."
              : editingId
                ? "Actualizar jugador"
                : "Crear jugador"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={cancelEditing}
              className="ml-3 inline-flex items-center justify-center rounded-full border border-slate-200 bg-white/80 px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-white"
            >
              Cancelar
            </button>
          )}
        </div>
      </div>

      <div className="admin-fade-up relative overflow-hidden rounded-[24px] border border-white/70 bg-white/80 p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/70 backdrop-blur">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-slate-200/80 via-indigo-200/60 to-slate-200/80" />
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Jugadores</h3>
          <p className="text-xs text-slate-500">
            {players.length} {players.length === 1 ? "registro" : "registros"}
          </p>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-600">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Buscar
          </span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Nombre, CI, ciudad o pais..."
            className="w-full rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 sm:w-72"
          />
        </div>
        {filteredPlayers.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No hay jugadores registrados.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200/70 bg-white/80 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.2)]">
            <table className="min-w-[640px] divide-y divide-slate-200/70 text-sm">
              <thead className="bg-slate-50/80 text-[11px] uppercase tracking-[0.2em] text-slate-500">
                <tr>
                  <th className="px-3 py-3 text-left font-semibold text-slate-700">Jugador</th>
                  <th className="px-3 py-3 text-left font-semibold text-slate-700">Documento</th>
                  <th className="px-3 py-3 text-left font-semibold text-slate-700">Estado</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredPlayers.map((player) => (
                  <tr key={player.id}>
                    <td className="px-3 py-2">
                      <div className="flex flex-col">
                        <Link
                          href={`/players/${player.id}`}
                          className="font-semibold text-slate-900 hover:text-indigo-700"
                        >
                          {player.firstName} {player.lastName}
                        </Link>
                        {player.city || player.country ? (
                          <span className="text-xs text-slate-500">
                            {[player.city, player.country].filter(Boolean).join(", ")}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-800">
                      <div className="flex flex-col">
                        <span className="text-sm">
                          {player.documentType === "ID_CARD" ? "CI" : "Pasaporte"}:{" "}
                          {player.documentNumber}
                        </span>
                        {player.phone ? (
                          <span className="text-xs text-slate-500">Tel: {player.phone}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${player.status === "CONFIRMED"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                          }`}
                      >
                        {statusCopy[player.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {player.status === "UNCONFIRMED" ? (
                        canConfirm ? (
                          <button
                            type="button"
                            onClick={() => confirmPlayer(player.id)}
                            disabled={loading}
                            className="rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-[0_12px_24px_-18px_rgba(79,70,229,0.45)] transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            Confirmar
                          </button>
                        ) : (
                          <span className="text-xs text-slate-500">Solo admin</span>
                        )
                      ) : (
                        <span className="text-xs text-slate-500">N/A</span>
                      )}
                      <Link
                        href={`/players/${player.id}`}
                        className="ml-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-white"
                      >
                        Ver
                      </Link>
                      {canEditPlayer(player) ? (
                        <button
                          type="button"
                          onClick={() => startEditing(player)}
                          className="ml-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-white"
                        >
                          Editar
                        </button>
                      ) : (
                        <span className="ml-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Solo lectura
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

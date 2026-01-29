"use client";

import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";

type DrawType = "ROUND_ROBIN" | "GROUPS_PLAYOFF" | "PLAYOFF";
type Tiebreaker =
  | "SETS_DIFF"
  | "MATCHES_WON"
  | "POINTS_PER_MATCH"
  | "POINTS_DIFF";

type Category = {
  id: string;
  name: string;
  abbreviation: string;
  sport?: { id: string; name: string } | null;
};

type DrawCategoryResponse = {
  categoryId: string;
  drawType: DrawType | null;
  registrationCount: number;
  category: Category;
  groupMinSize?: number | null;
  groupMaxSize?: number | null;
  hasBronzeMatch?: boolean | null;
};


type DrawCategory = {
  categoryId: string;
  drawType: DrawType | null;
  registrationCount: number;
  category: Category;
  groupMinSize: string;
  groupMaxSize: string;
  hasBronzeMatch: boolean;
};

type ScheduleEntry = {
  date: string;
  startTime: string;
  endTime: string;
  matchDurationMinutes: string;
  breakMinutes: string;
};

type ScheduleResponse = {
  date: string;
  startTime: string;
  endTime: string;
  matchDurationMinutes: number;
  breakMinutes: number;
};

type GroupPoints = {
  winPoints: string;
  winWithoutGameLossPoints: string;
  lossPoints: string;
  lossWithGameWinPoints: string;
  tiebreakerOrder: Tiebreaker[];
};

type GroupPointsResponse = {
  winPoints: number;
  winWithoutGameLossPoints: number;
  lossPoints: number;
  lossWithGameWinPoints: number;
  tiebreakerOrder?: string[];
};

type Props = {
  tournamentId: string;
  tournamentName: string;
};

const drawOptions: { value: DrawType; label: string }[] = [
  { value: "ROUND_ROBIN", label: "Round robin (solo grupos)" },
  { value: "GROUPS_PLAYOFF", label: "Grupos + playoff" },
  { value: "PLAYOFF", label: "Playoff directo (llaves)" },
];

const groupDrawTypes = new Set<DrawType>(["ROUND_ROBIN", "GROUPS_PLAYOFF"]);
const isGroupDraw = (value: DrawType | null) =>
  value !== null && groupDrawTypes.has(value);
const playoffDrawTypes = new Set<DrawType>(["GROUPS_PLAYOFF", "PLAYOFF"]);
const isPlayoffDraw = (value: DrawType | null) =>
  value !== null && playoffDrawTypes.has(value);
const defaultGroupMinSize = "3";
const defaultGroupMaxSize = "4";

const tiebreakerOptions: { value: Tiebreaker; label: string }[] = [
  { value: "SETS_DIFF", label: "Diferencia de sets" },
  { value: "MATCHES_WON", label: "Partidos ganados" },
  { value: "POINTS_PER_MATCH", label: "Puntos por partido" },
  { value: "POINTS_DIFF", label: "Diferencia de puntos" },
];

const defaultTiebreakerOrder: Tiebreaker[] = [
  "SETS_DIFF",
  "MATCHES_WON",
  "POINTS_PER_MATCH",
  "POINTS_DIFF",
];

const isTiebreaker = (value: string): value is Tiebreaker =>
  tiebreakerOptions.some((option) => option.value === value);

const normalizeTiebreakerOrder = (value?: string[]) => {
  const filtered = Array.isArray(value)
    ? value.filter((item): item is Tiebreaker => isTiebreaker(item))
    : [];
  const unique = Array.from(new Set(filtered));
  const hasAll = defaultTiebreakerOrder.every((item) =>
    unique.includes(item)
  );
  if (!hasAll || unique.length !== defaultTiebreakerOrder.length) {
    return [...defaultTiebreakerOrder];
  }
  return unique;
};

export default function TournamentDraws({ tournamentId, tournamentName }: Props) {
  const [drawCategories, setDrawCategories] = useState<DrawCategory[]>([]);
  const [scheduleEntries, setScheduleEntries] = useState<ScheduleEntry[]>([]);
  const [groupPoints, setGroupPoints] = useState<GroupPoints>({
    winPoints: "0",
    winWithoutGameLossPoints: "0",
    lossPoints: "0",
    lossWithGameWinPoints: "0",
    tiebreakerOrder: [...defaultTiebreakerOrder],
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [loadingGroupPoints, setLoadingGroupPoints] = useState(false);
  const [savingGroupPoints, setSavingGroupPoints] = useState(false);
  const [draggingTiebreaker, setDraggingTiebreaker] =
    useState<Tiebreaker | null>(null);
  const [dragOverTiebreaker, setDragOverTiebreaker] =
    useState<Tiebreaker | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [bronzeUpdatingId, setBronzeUpdatingId] = useState<string | null>(null);

  const loadDraws = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/draws`, {
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      const detail = data?.detail ? ` (${data.detail})` : "";
      setError(`${data?.error ?? "No se pudieron cargar los sorteos"}${detail}`);
      return;
    }
    if (Array.isArray(data.categories)) {
      const mapped = data.categories.map((item) => ({
        categoryId: item.categoryId,
        drawType: item.drawType ?? null,
        registrationCount: item.registrationCount,
        category: item.category,
        groupMinSize:
          item.groupMinSize !== null && item.groupMinSize !== undefined
            ? String(item.groupMinSize)
            : "",
        groupMaxSize:
          item.groupMaxSize !== null && item.groupMaxSize !== undefined
            ? String(item.groupMaxSize)
            : "",
        hasBronzeMatch: Boolean(item.hasBronzeMatch),
      }));
      setDrawCategories(mapped);
    }
  }, [tournamentId]);

  const loadSchedule = useCallback(async () => {
    setLoadingSchedule(true);
    setError(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/schedule`, {
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    setLoadingSchedule(false);
    if (!res.ok) {
      const detail = data?.detail ? ` (${data.detail})` : "";
      setError(`${data?.error ?? "No se pudieron cargar los horarios"}${detail}`);
      return;
    }
    const playDays = Array.isArray(data.playDays) ? data.playDays : [];
    const schedules = Array.isArray(data.schedules)
      ? (data.schedules as ScheduleResponse[])
      : [];
    const scheduleMap = new Map(
      schedules.map((entry) => [entry.date, entry])
    );
    setScheduleEntries(
      playDays.map((day: string) => {
        const existing = scheduleMap.get(day);
        return {
          date: day,
          startTime: existing?.startTime ?? "",
          endTime: existing?.endTime ?? "",
          matchDurationMinutes:
            existing?.matchDurationMinutes !== undefined
              ? String(existing.matchDurationMinutes)
              : "",
          breakMinutes:
            existing?.breakMinutes !== undefined ? String(existing.breakMinutes) : "",
        };
      })
    );
  }, [tournamentId]);

  const loadGroupPoints = useCallback(async () => {
    setLoadingGroupPoints(true);
    setError(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/group-points`, {
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    setLoadingGroupPoints(false);
    if (!res.ok) {
      const detail = data?.detail ? ` (${data.detail})` : "";
      setError(`${data?.error ?? "No se pudieron cargar los puntos"}${detail}`);
      return;
    }
    const points = data?.groupPoints as GroupPointsResponse | undefined;
    if (points) {
      const tiebreakerOrder = normalizeTiebreakerOrder(
        points.tiebreakerOrder
      );
      setGroupPoints({
        winPoints: String(points.winPoints ?? 0),
        winWithoutGameLossPoints: String(points.winWithoutGameLossPoints ?? 0),
        lossPoints: String(points.lossPoints ?? 0),
        lossWithGameWinPoints: String(points.lossWithGameWinPoints ?? 0),
        tiebreakerOrder,
      });
    }
  }, [tournamentId]);

  useEffect(() => {
    const loadAll = async () => {
      await Promise.all([loadDraws(), loadSchedule(), loadGroupPoints()]);
    };
    void loadAll();
  }, [loadDraws, loadSchedule, loadGroupPoints]);

  const registeredCategories = useMemo(
    () => drawCategories.filter((item) => item.registrationCount > 0),
    [drawCategories]
  );

  const updateDrawType = (categoryId: string, drawType: DrawType | null) => {
    setDrawCategories((prev) =>
      prev.map((item) =>
        item.categoryId === categoryId
          ? {
              ...item,
              drawType,
              groupMinSize: isGroupDraw(drawType)
                ? item.groupMinSize || defaultGroupMinSize
                : "",
              groupMaxSize: isGroupDraw(drawType)
                ? item.groupMaxSize || defaultGroupMaxSize
                : "",
            }
          : item
      )
    );
  };

  const updateGroupSize = (
    categoryId: string,
    field: "groupMinSize" | "groupMaxSize",
    value: string
  ) => {
    setDrawCategories((prev) =>
      prev.map((item) =>
        item.categoryId === categoryId ? { ...item, [field]: value } : item
      )
    );
  };

  const updateScheduleEntry = (
    date: string,
    updates: Partial<ScheduleEntry>
  ) => {
    setScheduleEntries((prev) =>
      prev.map((entry) => (entry.date === date ? { ...entry, ...updates } : entry))
    );
  };

  const updateGroupPoints = (field: keyof GroupPoints, value: string) => {
    setGroupPoints((prev) => ({ ...prev, [field]: value }));
  };

  const toggleBronzeMatch = async (categoryId: string, enable: boolean) => {
    setBronzeUpdatingId(categoryId);
    setError(null);
    setMessage(null);

    if (!enable) {
      const confirmed = window.confirm(
        "Esto eliminara el partido por el 3er lugar existente. Continuar?"
      );
      if (!confirmed) {
        setBronzeUpdatingId(null);
        return;
      }
    }

    const res = await fetch(
      `/api/tournaments/${tournamentId}/categories/${categoryId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ hasBronzeMatch: enable }),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBronzeUpdatingId(null);
      const detail = data?.detail ? ` (${data.detail})` : "";
      setError(
        `${data?.error ?? "No se pudo actualizar la configuracion de 3ro"}${detail}`
      );
      return;
    }

    setDrawCategories((prev) =>
      prev.map((entry) =>
        entry.categoryId === categoryId
          ? { ...entry, hasBronzeMatch: enable }
          : entry
      )
    );

    if (enable) {
      const fixtureRes = await fetch(
        `/api/tournaments/${tournamentId}/fixtures/playoffs`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ categoryId, regenerate: true }),
        }
      );
      const fixtureData = await fixtureRes.json().catch(() => ({}));
      if (!fixtureRes.ok) {
        setBronzeUpdatingId(null);
        const detail = fixtureData?.detail ? ` (${fixtureData.detail})` : "";
        setError(
          `${fixtureData?.error ?? "No se pudo generar el partido por 3er lugar"}${detail}`
        );
        return;
      }
    }

    setBronzeUpdatingId(null);
    setMessage(
      enable
        ? "Partido por 3er lugar habilitado"
        : "Partido por 3er lugar deshabilitado"
    );
  };

  const reorderTiebreakers = (
    order: Tiebreaker[],
    dragged: Tiebreaker,
    target: Tiebreaker
  ) => {
    const next = [...order];
    const fromIndex = next.indexOf(dragged);
    const toIndex = next.indexOf(target);
    if (fromIndex === -1 || toIndex === -1) return order;
    next.splice(fromIndex, 1);
    next.splice(toIndex, 0, dragged);
    return next;
  };

  const handleTiebreakerDragStart = (
    event: DragEvent,
    value: Tiebreaker
  ) => {
    setDraggingTiebreaker(value);
    event.dataTransfer.setData("text/plain", value);
    event.dataTransfer.effectAllowed = "move";
  };

  const handleTiebreakerDragEnd = () => {
    setDraggingTiebreaker(null);
    setDragOverTiebreaker(null);
  };

  const handleTiebreakerDragOver = (
    event: DragEvent,
    value: Tiebreaker
  ) => {
    event.preventDefault();
    if (dragOverTiebreaker !== value) {
      setDragOverTiebreaker(value);
    }
  };

  const handleTiebreakerDrop = (event: DragEvent, value: Tiebreaker) => {
    event.preventDefault();
    const rawValue =
      draggingTiebreaker || event.dataTransfer.getData("text/plain");
    const draggedValue =
      typeof rawValue === "string" && isTiebreaker(rawValue)
        ? rawValue
        : null;
    if (!draggedValue || draggedValue === value) {
      setDragOverTiebreaker(null);
      return;
    }
    setGroupPoints((prev) => ({
      ...prev,
      tiebreakerOrder: reorderTiebreakers(
        prev.tiebreakerOrder,
        draggedValue,
        value
      ),
    }));
    setDragOverTiebreaker(null);
    setDraggingTiebreaker(null);
  };

  const isValidTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

  const parseIntValue = (value: string) => {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const handleSaveSchedule = async () => {
    setError(null);
    setMessage(null);

    if (scheduleEntries.length === 0) {
      setError("No hay dias para configurar");
      return;
    }

    for (const entry of scheduleEntries) {
      if (!isValidTime(entry.startTime) || !isValidTime(entry.endTime)) {
        setError("Hora invalida");
        return;
      }
      if (entry.endTime <= entry.startTime) {
        setError("La hora de fin debe ser mayor que la de inicio");
        return;
      }
      const matchDuration = parseIntValue(entry.matchDurationMinutes);
      if (matchDuration === null || matchDuration < 1) {
        setError("Duracion invalida");
        return;
      }
      const breakMinutes = parseIntValue(entry.breakMinutes);
      if (breakMinutes === null || breakMinutes < 0) {
        setError("Tiempo de espera invalido");
        return;
      }
    }

    setSavingSchedule(true);
    const res = await fetch(`/api/tournaments/${tournamentId}/schedule`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        entries: scheduleEntries.map((entry) => ({
          date: entry.date,
          startTime: entry.startTime,
          endTime: entry.endTime,
          matchDurationMinutes: entry.matchDurationMinutes,
          breakMinutes: entry.breakMinutes,
        })),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSavingSchedule(false);

    if (!res.ok) {
      const detail = data?.detail ? ` (${data.detail})` : "";
      setError(`${data?.error ?? "No se pudieron guardar los horarios"}${detail}`);
      return;
    }

    if (Array.isArray(data.playDays)) {
      const schedules = Array.isArray(data.schedules)
        ? (data.schedules as ScheduleResponse[])
        : [];
      const scheduleMap = new Map(
        schedules.map((entry) => [entry.date, entry])
      );
      setScheduleEntries(
        data.playDays.map((day: string) => {
          const existing = scheduleMap.get(day);
          return {
            date: day,
            startTime: existing?.startTime ?? "",
            endTime: existing?.endTime ?? "",
            matchDurationMinutes:
              existing?.matchDurationMinutes !== undefined
                ? String(existing.matchDurationMinutes)
                : "",
            breakMinutes:
              existing?.breakMinutes !== undefined
                ? String(existing.breakMinutes)
                : "",
          };
        })
      );
    }

    setMessage("Horarios guardados");
  };

  const handleSaveGroupPoints = async () => {
    setError(null);
    setMessage(null);

    const winPoints = parseIntValue(groupPoints.winPoints);
    if (winPoints === null || winPoints < 0) {
      setError("Puntos de victoria invalidos");
      return;
    }
    const lossPoints = parseIntValue(groupPoints.lossPoints);
    if (lossPoints === null || lossPoints < 0) {
      setError("Puntos de derrota invalidos");
      return;
    }
    const winWithoutGameLossPoints = parseIntValue(
      groupPoints.winWithoutGameLossPoints
    );
    if (winWithoutGameLossPoints === null || winWithoutGameLossPoints < 0) {
      setError("Puntos por ganar sin perder cancha invalidos");
      return;
    }
    const lossWithGameWinPoints = parseIntValue(groupPoints.lossWithGameWinPoints);
    if (lossWithGameWinPoints === null || lossWithGameWinPoints < 0) {
      setError("Puntos por cancha ganada invalidos");
      return;
    }
    const normalizedOrder = normalizeTiebreakerOrder(
      groupPoints.tiebreakerOrder
    );
    if (normalizedOrder.join("|") !== groupPoints.tiebreakerOrder.join("|")) {
      setGroupPoints((prev) => ({ ...prev, tiebreakerOrder: normalizedOrder }));
    }

    setSavingGroupPoints(true);
    const res = await fetch(`/api/tournaments/${tournamentId}/group-points`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        winPoints,
        winWithoutGameLossPoints,
        lossPoints,
        lossWithGameWinPoints,
        tiebreakerOrder: normalizedOrder,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSavingGroupPoints(false);

    if (!res.ok) {
      const detail = data?.detail ? ` (${data.detail})` : "";
      setError(`${data?.error ?? "No se pudieron guardar los puntos"}${detail}`);
      return;
    }

    const points = data?.groupPoints as GroupPointsResponse | undefined;
    if (points) {
      const tiebreakerOrder = normalizeTiebreakerOrder(
        points.tiebreakerOrder
      );
      setGroupPoints({
        winPoints: String(points.winPoints ?? 0),
        winWithoutGameLossPoints: String(points.winWithoutGameLossPoints ?? 0),
        lossPoints: String(points.lossPoints ?? 0),
        lossWithGameWinPoints: String(points.lossWithGameWinPoints ?? 0),
        tiebreakerOrder,
      });
    }

    setMessage("Puntos por partido guardados");
  };

  const handleSave = async () => {
    setError(null);
    setMessage(null);

    if (registeredCategories.length === 0) {
      setError("No hay categorias con inscritos");
      return;
    }

    const missing = registeredCategories.find((item) => !item.drawType);
    if (missing) {
      setError("Selecciona el tipo de sorteo para todas las categorias");
      return;
    }

    for (const item of registeredCategories) {
      if (isGroupDraw(item.drawType)) {
        const minSize = parseIntValue(item.groupMinSize);
        const maxSize = parseIntValue(item.groupMaxSize);
        if (minSize === null || minSize < 2) {
          setError(`Define el minimo por grupo para ${item.category.name}`);
          return;
        }
        if (maxSize === null || maxSize < minSize) {
          setError(`Define el maximo por grupo para ${item.category.name}`);
          return;
        }
      }
    }

    setSaving(true);
    const res = await fetch(`/api/tournaments/${tournamentId}/draws`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        entries: registeredCategories.map((item) => ({
          categoryId: item.categoryId,
          drawType: item.drawType,
          groupMinSize: isGroupDraw(item.drawType)
            ? parseIntValue(item.groupMinSize)
            : null,
          groupMaxSize: isGroupDraw(item.drawType)
            ? parseIntValue(item.groupMaxSize)
            : null,
        })),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      const detail = data?.detail ? ` (${data.detail})` : "";
      setError(`${data?.error ?? "No se pudo guardar el sorteo"}${detail}`);
      return;
    }

    if (Array.isArray(data.categories)) {
      const mapped = (data.categories as DrawCategoryResponse[]).map((item) => ({
        categoryId: item.categoryId,
        drawType: item.drawType ?? null,
        registrationCount: item.registrationCount,
        category: item.category,
        groupMinSize:
          item.groupMinSize !== null && item.groupMinSize !== undefined
            ? String(item.groupMinSize)
            : "",
        groupMaxSize:
          item.groupMaxSize !== null && item.groupMaxSize !== undefined
            ? String(item.groupMaxSize)
            : "",
      }));
      setDrawCategories(mapped);
    }

    setMessage("Sorteo guardado");
  };

  return (
    <div className="space-y-6">
      <div className="admin-fade-up relative overflow-hidden rounded-[24px] border border-white/70 bg-white/80 p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/70 backdrop-blur">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-indigo-300/70 via-sky-300/60 to-amber-200/70" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-500">
              Paso 4
            </p>
            <h2 className="text-2xl font-semibold text-slate-900">
              Tipo de sorteo
            </h2>
            <p className="text-sm text-slate-600">
              Torneo: <span className="font-semibold">{tournamentName}</span>
            </p>
          </div>
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
            Sorteo
          </span>
        </div>
        <p className="mt-3 text-sm text-slate-600">
          Selecciona el formato del sorteo para cada categoria con inscritos y
          define el minimo y maximo por grupo cuando aplique.
        </p>
      </div>

      {loadingSchedule ? (
        <p className="text-sm text-slate-500">Cargando horarios...</p>
      ) : scheduleEntries.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          No hay dias registrados para el torneo.
        </p>
        ) : (
          <div className="admin-fade-up overflow-x-auto rounded-2xl border border-slate-200/70 bg-white/80 shadow-[0_14px_36px_-28px_rgba(15,23,42,0.25)]">
            <table className="min-w-[640px] divide-y divide-slate-200/70 text-sm">
            <thead className="bg-slate-50/80 text-[11px] uppercase tracking-[0.2em] text-slate-500">
              <tr>
                <th className="px-3 py-3 text-left font-semibold">Dia</th>
                <th className="px-3 py-3 text-left font-semibold">Inicio</th>
                <th className="px-3 py-3 text-left font-semibold">Fin</th>
                <th className="px-3 py-3 text-left font-semibold">
                  Duracion (min)
                </th>
                <th className="px-3 py-3 text-left font-semibold">
                  Espera (min)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {scheduleEntries.map((entry) => (
                <tr key={entry.date}>
                  <td className="px-3 py-2 text-slate-700">{entry.date}</td>
                  <td className="px-3 py-2">
                    <input
                      type="time"
                      value={entry.startTime}
                      onChange={(e) =>
                        updateScheduleEntry(entry.date, { startTime: e.target.value })
                      }
                      className="w-full max-w-[140px] rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="time"
                      value={entry.endTime}
                      onChange={(e) =>
                        updateScheduleEntry(entry.date, { endTime: e.target.value })
                      }
                      className="w-full max-w-[140px] rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={entry.matchDurationMinutes}
                      onChange={(e) =>
                        updateScheduleEntry(entry.date, {
                          matchDurationMinutes: e.target.value,
                        })
                      }
                      className="w-full max-w-[140px] rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      placeholder="60"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={entry.breakMinutes}
                      onChange={(e) =>
                        updateScheduleEntry(entry.date, {
                          breakMinutes: e.target.value,
                        })
                      }
                      className="w-full max-w-[140px] rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      placeholder="10"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          Guarda los horarios por dia del torneo.
        </p>
        <button
          type="button"
          onClick={handleSaveSchedule}
          disabled={savingSchedule || scheduleEntries.length === 0}
          className="inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_-22px_rgba(15,23,42,0.5)] transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {savingSchedule ? "Guardando..." : "Guardar horarios"}
        </button>
      </div>

      {loadingGroupPoints ? (
        <p className="text-sm text-slate-500">Cargando puntos por partido...</p>
      ) : (
        <div className="admin-fade-up relative overflow-hidden rounded-[24px] border border-white/70 bg-white/80 p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/70 backdrop-blur">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-emerald-300/60 via-sky-200/60 to-amber-200/60" />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                Puntos por partido
              </h3>
              <p className="text-sm text-slate-600">
                Estos puntos se usan en la tabla de posiciones cuando el sorteo
                tenga grupos.
              </p>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              Grupos
            </span>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                Victoria con perdida de 1 cancha
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={groupPoints.winPoints}
                onChange={(e) => updateGroupPoints("winPoints", e.target.value)}
                className="w-full max-w-[220px] rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                victoria y sin perdida cancha
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={groupPoints.winWithoutGameLossPoints}
                onChange={(e) =>
                  updateGroupPoints("winWithoutGameLossPoints", e.target.value)
                }
                className="w-full max-w-[220px] rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                Derrota 
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={groupPoints.lossPoints}
                onChange={(e) => updateGroupPoints("lossPoints", e.target.value)}
                className="w-full max-w-[220px] rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                derrota pero gano 1 cancha
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={groupPoints.lossWithGameWinPoints}
                onChange={(e) =>
                  updateGroupPoints("lossWithGameWinPoints", e.target.value)
                }
                className="w-full max-w-[220px] rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </div>
          </div>
          <div className="mt-6 rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.25)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">
                  Reglas de desempate
                </h4>
                <p className="text-xs text-slate-500">
                  Arrastra para definir la prioridad de desempate en grupos.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600">
                Orden
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {groupPoints.tiebreakerOrder.map((item, index) => {
                const option = tiebreakerOptions.find(
                  (entry) => entry.value === item
                );
                const isDragTarget = dragOverTiebreaker === item;
                const isDragging = draggingTiebreaker === item;
                return (
                  <div
                    key={item}
                    onDragOver={(event) => handleTiebreakerDragOver(event, item)}
                    onDrop={(event) => handleTiebreakerDrop(event, item)}
                    className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2 transition ${
                      isDragTarget
                        ? "border-emerald-300 bg-emerald-50/70"
                        : "border-slate-200/70 bg-white/90"
                    } ${isDragging ? "opacity-70" : ""}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                        {index + 1}
                      </span>
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-slate-900">
                          {option?.label ?? item}
                        </span>
                        <span className="text-xs text-slate-500">
                          Prioridad {index + 1}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      draggable
                      onDragStart={(event) =>
                        handleTiebreakerDragStart(event, item)
                      }
                      onDragEnd={handleTiebreakerDragEnd}
                      className="cursor-grab rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50"
                    >
                      Arrastrar
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={handleSaveGroupPoints}
              disabled={savingGroupPoints}
              className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_-22px_rgba(16,185,129,0.45)] transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {savingGroupPoints ? "Guardando..." : "Guardar puntos por partido"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Cargando sorteos...</p>
      ) : registeredCategories.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          No hay categorias con inscritos.
        </p>
        ) : (
          <div className="admin-fade-up overflow-x-auto rounded-2xl border border-slate-200/70 bg-white/80 shadow-[0_14px_36px_-28px_rgba(15,23,42,0.25)]">
            <table className="min-w-[640px] divide-y divide-slate-200/70 text-sm">
            <thead className="bg-slate-50/80 text-[11px] uppercase tracking-[0.2em] text-slate-500">
              <tr>
                <th className="px-3 py-3 text-left font-semibold">Categoria</th>
                <th className="px-3 py-3 text-left font-semibold">Inscritos</th>
                <th className="px-3 py-3 text-left font-semibold">
                  Tipo de sorteo
                </th>
                <th className="px-3 py-3 text-left font-semibold">
                  Min por grupo
                </th>
                <th className="px-3 py-3 text-left font-semibold">
                  Max por grupo
                </th>
                <th className="px-3 py-3 text-left font-semibold">
                  3er lugar
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {registeredCategories.map((item) => (
                <tr key={item.categoryId}>
                  <td className="px-3 py-2">
                    <div className="flex flex-col">
                      <span className="font-semibold text-slate-900">
                        {item.category.name}
                      </span>
                      <span className="text-xs text-slate-500">
                        {item.category.abbreviation} -{" "}
                        {item.category.sport?.name ?? "N/D"}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {item.registrationCount}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={item.drawType ?? ""}
                      onChange={(e) =>
                        updateDrawType(
                          item.categoryId,
                          (e.target.value || null) as DrawType | null
                        )
                      }
                      className="w-full max-w-[260px] rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    >
                      <option value="">Selecciona tipo</option>
                      {drawOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="2"
                      step="1"
                      value={item.groupMinSize}
                      onChange={(e) =>
                        updateGroupSize(
                          item.categoryId,
                          "groupMinSize",
                          e.target.value
                        )
                      }
                      disabled={!isGroupDraw(item.drawType)}
                      className="w-full max-w-[160px] rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-100"
                      placeholder={defaultGroupMinSize}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="2"
                      step="1"
                      value={item.groupMaxSize}
                      onChange={(e) =>
                        updateGroupSize(
                          item.categoryId,
                          "groupMaxSize",
                          e.target.value
                        )
                      }
                      disabled={!isGroupDraw(item.drawType)}
                      className="w-full max-w-[160px] rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-100"
                      placeholder={defaultGroupMaxSize}
                    />
                  </td>
                  <td className="px-3 py-2">
                    {isPlayoffDraw(item.drawType) ? (
                      <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                        <input
                          type="checkbox"
                          checked={Boolean(item.hasBronzeMatch)}
                          disabled={
                            bronzeUpdatingId === item.categoryId ||
                            !isPlayoffDraw(item.drawType)
                          }
                          onChange={(event) =>
                            toggleBronzeMatch(
                              item.categoryId,
                              event.target.checked
                            )
                          }
                          className="h-[16px] w-[16px] rounded border border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-[11px] uppercase tracking-[0.25em] text-slate-500">
                          3ro y 4to
                        </span>
                      </label>
                    ) : (
                      <span className="text-xs text-slate-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          Guarda el tipo de sorteo para continuar con el torneo.
        </p>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || registeredCategories.length === 0}
          className="inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_-22px_rgba(15,23,42,0.5)] transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {saving ? "Guardando..." : "Guardar sorteo"}
        </button>
      </div>

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
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";

type CategoryModality = "SINGLES" | "DOUBLES";
type CategoryGender = "MALE" | "FEMALE" | "MIXED";
type DocumentType = "ID_CARD" | "PASSPORT";
type PlayerStatus = "UNCONFIRMED" | "CONFIRMED";

type Category = {
  id: string;
  name: string;
  abbreviation: string;
  modality?: CategoryModality | null;
  gender?: CategoryGender | null;
  sport?: { id: string; name: string } | null;
  price?: string;
  secondaryPrice?: string;
  siblingPrice?: string;
};

type Player = {
  id: string;
  firstName: string;
  lastName: string;
  documentType: DocumentType;
  documentNumber: string;
  status?: PlayerStatus;
};

type Registration = {
  id: string;
  amountPaid: string | number;
  amountDue?: string | number | null;
  seed?: number | null;
  createdAt?: string | Date | null;
  teamName?: string | null;
  category: Category;
  player: Player;
  partner?: Player | null;
  partnerTwo?: Player | null;
};

type Season = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
};

type Props = {
  tournamentId: string;
  tournamentName: string;
  categories: Category[];
  tournamentStatus: "WAITING" | "ACTIVE" | "FINISHED";
};

type RegistrationEntry = {
  id: string;
  categoryId: string;
  partnerId: string;
  partnerTwoId: string;
  amountPaid: string;
  teamName: string;
  partnerQuery: string;
  partnerTwoQuery: string;
};

const parsePriceInput = (value?: string) => {
  if (!value) return null;
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizePriceInput = (value: string) => value.trim().replace(",", ".");

const getTeamConfig = (category?: Category | null) => {
  if (!category) {
    return { minPlayers: 1, maxPlayers: 1 };
  }
  const sportName = category.sport?.name?.toLowerCase() ?? "";
  if (sportName.includes("fronton")) {
    return { minPlayers: 2, maxPlayers: 3 };
  }
  if (category.modality === "DOUBLES") {
    return { minPlayers: 2, maxPlayers: 2 };
  }
  return { minPlayers: 1, maxPlayers: 1 };
};

const isFrontonCategory = (category?: Category | null) =>
  (category?.sport?.name?.toLowerCase() ?? "").includes("fronton");

const formatCategoryPrice = (value?: string | number | null) => {
  if (value === null || value === undefined) return "";
  return String(value);
};

const playerLabel = (player: Player) =>
  `${player.firstName} ${player.lastName} - ${
    player.documentType === "ID_CARD" ? "CI" : "Pas"
  } ${player.documentNumber}`;

export default function TournamentRegistrations({
  tournamentId,
  tournamentName,
  categories,
  tournamentStatus,
}: Props) {
  const entryCounter = useRef(2);
  const [players, setPlayers] = useState<Player[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reorderingCategoryId, setReorderingCategoryId] = useState<string | null>(
    null
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingCategoryId, setDraggingCategoryId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editingRegistrationId, setEditingRegistrationId] = useState<string | null>(
    null
  );
  const [playerQuery, setPlayerQuery] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [leagueId, setLeagueId] = useState<string | null>(null);
  const [leagueName, setLeagueName] = useState<string | null>(null);
  const [rankingEnabled, setRankingEnabled] = useState(false);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState("");
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingError, setRankingError] = useState<string | null>(null);
  const [entries, setEntries] = useState<RegistrationEntry[]>(() => {
    const firstCategory = categories[0];
    const initialCategoryId = firstCategory?.id ?? "";
    const initialAmount = firstCategory?.price ?? "";
    return [
      {
        id: "entry-1",
        categoryId: initialCategoryId,
        partnerId: "",
        partnerTwoId: "",
        amountPaid: initialAmount,
        teamName: "",
        partnerQuery: "",
        partnerTwoQuery: "",
      },
    ];
  });
  const categoriesById = useMemo(() => {
    return new Map(categories.map((category) => [category.id, category]));
  }, [categories]);
  const registrationsLocked = tournamentStatus === "FINISHED";

  const createEntry = (categoryId: string, amountPaid?: string) => {
    const entryId = `entry-${entryCounter.current}`;
    entryCounter.current += 1;
    return {
      id: entryId,
      categoryId,
      partnerId: "",
      partnerTwoId: "",
      amountPaid: amountPaid ?? "",
      teamName: "",
      partnerQuery: "",
      partnerTwoQuery: "",
    };
  };

  const selectedPlayer = useMemo(
    () => players.find((player) => player.id === selectedPlayerId) ?? null,
    [players, selectedPlayerId]
  );

  useEffect(() => {
    if (!selectedPlayerId) return;
    setEntries((prev) =>
      prev.map((entry) => {
        const updates: Partial<RegistrationEntry> = {};
        if (entry.partnerId === selectedPlayerId) {
          updates.partnerId = "";
          updates.partnerQuery = "";
        }
        if (entry.partnerTwoId === selectedPlayerId) {
          updates.partnerTwoId = "";
          updates.partnerTwoQuery = "";
        }
        return Object.keys(updates).length > 0 ? { ...entry, ...updates } : entry;
      })
    );
  }, [selectedPlayerId]);

  useEffect(() => {
    if (!categories.length) {
      setEntries([]);
      return;
    }
    setEntries((prev) => {
      if (prev.length === 0) {
        const firstCategory = categories[0];
        const entryId = `entry-${entryCounter.current}`;
        entryCounter.current += 1;
        return [
          {
            id: entryId,
            categoryId: firstCategory.id,
            partnerId: "",
            partnerTwoId: "",
            amountPaid: firstCategory.price ?? "",
            teamName: "",
            partnerQuery: "",
            partnerTwoQuery: "",
          },
        ];
      }
      return prev.map((entry) => {
        if (categoriesById.has(entry.categoryId)) {
          return entry;
        }
        const fallback = categories[0];
        return {
          ...entry,
          categoryId: fallback.id,
          amountPaid: entry.amountPaid || fallback.price || "",
        };
      });
    });
  }, [categories, categoriesById]);

  const updateEntry = (entryId: string, updates: Partial<RegistrationEntry>) => {
    setEntries((prev) =>
      prev.map((entry) => (entry.id === entryId ? { ...entry, ...updates } : entry))
    );
  };

  const refreshRegistrations = async () => {
    const res = await fetch(`/api/tournaments/${tournamentId}/registrations`, {
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(data.registrations)) {
      setRegistrations(data.registrations);
    }
  };

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [playersRes, registrationsRes] = await Promise.all([
          fetch("/api/players", { cache: "no-store" }),
          fetch(`/api/tournaments/${tournamentId}/registrations`, {
            cache: "no-store",
          }),
        ]);

        const playersData = await playersRes.json().catch(() => ({}));
        const registrationsData = await registrationsRes.json().catch(() => ({}));

        if (!active) return;
        if (playersRes.ok && Array.isArray(playersData.players)) {
          setPlayers(playersData.players);
        }
        if (registrationsRes.ok && Array.isArray(registrationsData.registrations)) {
          setRegistrations(registrationsData.registrations);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadData();

    return () => {
      active = false;
    };
  }, [tournamentId]);

  useEffect(() => {
    let active = true;

    const loadRankingContext = async () => {
      setRankingError(null);
      const tournamentRes = await fetch(`/api/tournaments/${tournamentId}`, {
        cache: "no-store",
      });
      const tournamentData = await tournamentRes.json().catch(() => ({}));
      if (!active) return;
      if (!tournamentRes.ok) return;

      const tournament = tournamentData.tournament ?? null;
      const league = tournament?.league ?? null;
      setLeagueId(tournament?.leagueId ?? null);
      setLeagueName(league?.name ?? null);
      setRankingEnabled(Boolean(tournament?.rankingEnabled));

      if (!tournament?.leagueId || !tournament?.rankingEnabled) {
        setSeasons([]);
        setSelectedSeasonId("");
        return;
      }

      const seasonsRes = await fetch(
        `/api/tournaments/${tournamentId}/seasons`,
        { cache: "no-store" }
      );
      const seasonsData = await seasonsRes.json().catch(() => ({}));
      if (!active) return;
      if (seasonsRes.ok && Array.isArray(seasonsData.seasons)) {
        setSeasons(seasonsData.seasons);
        if (seasonsData.seasons.length > 0) {
          setSelectedSeasonId(seasonsData.seasons[0].id);
        }
      } else {
        setSeasons([]);
        setSelectedSeasonId("");
      }
    };

    loadRankingContext();

    return () => {
      active = false;
    };
  }, [tournamentId]);

  const getEntryCategory = (entry: RegistrationEntry) =>
    categoriesById.get(entry.categoryId) ?? null;

  const hasExistingRegistration = (playerId?: string, ignoreId?: string | null) => {
    if (!playerId) return false;
    return registrations.some((registration) => {
      if (ignoreId && registration.id === ignoreId) return false;
      return (
        registration.player.id === playerId ||
        registration.partner?.id === playerId ||
        registration.partnerTwo?.id === playerId
      );
    });
  };

  const entryHasPlayer = (entry: RegistrationEntry, playerId: string) => {
    if (!playerId) return false;
    return (
      selectedPlayerId === playerId ||
      entry.partnerId === playerId ||
      entry.partnerTwoId === playerId
    );
  };

  const hasPendingRegistration = (playerId: string, entryId: string) => {
    const entryIndex = entries.findIndex((entry) => entry.id === entryId);
    if (entryIndex <= 0) return false;
    for (let index = 0; index < entryIndex; index += 1) {
      if (entryHasPlayer(entries[index], playerId)) {
        return true;
      }
    }
    return false;
  };

  const getSuggestedAmount = (
    entryId: string,
    categoryId: string,
    partnerId: string,
    partnerTwoId: string
  ) => {
    const category = categoriesById.get(categoryId);
    if (!category) return "";
    const primary = formatCategoryPrice(category.price);
    const secondary =
      formatCategoryPrice(category.secondaryPrice) || formatCategoryPrice(category.price);
    const participants = [selectedPlayerId, partnerId, partnerTwoId].filter(Boolean);
    const hasExisting = participants.some((playerId) =>
      hasExistingRegistration(playerId, editingRegistrationId)
    );
    const hasPending = participants.some((playerId) =>
      playerId ? hasPendingRegistration(playerId, entryId) : false
    );
    return hasExisting || hasPending ? secondary : primary;
  };

  const handleCategoryChange = (entryId: string, value: string) => {
    const category = categoriesById.get(value);
    const teamConfig = getTeamConfig(category);
    const current = entries.find((entry) => entry.id === entryId);
    const partnerId = current?.partnerId ?? "";
    const partnerTwoId = current?.partnerTwoId ?? "";
    const updates: Partial<RegistrationEntry> = {
      categoryId: value,
    };

    if (teamConfig.maxPlayers === 1) {
      updates.partnerId = "";
      updates.partnerTwoId = "";
      updates.partnerQuery = "";
      updates.partnerTwoQuery = "";
    } else if (teamConfig.maxPlayers === 2) {
      updates.partnerTwoId = "";
      updates.partnerTwoQuery = "";
    }

    const suggested = getSuggestedAmount(
      entryId,
      value,
      updates.partnerId ?? partnerId,
      updates.partnerTwoId ?? partnerTwoId
    );
    if (suggested) {
      updates.amountPaid = suggested;
    }

    updateEntry(entryId, updates);
  };

  const handleSave = async () => {
    setError(null);
    setMessage(null);
    const wasEditing = Boolean(editingRegistrationId);
    if (registrationsLocked) {
      setError("El torneo ya esta finalizado y no permite mas inscripciones.");
      return;
    }

    if (!selectedPlayerId) {
      setError("Selecciona un jugador");
      return;
    }
    if (entries.length === 0) {
      setError("Agrega al menos una categoria");
      return;
    }
    if (editingRegistrationId && entries.length > 1) {
      setError("Solo puedes editar una categoria a la vez");
      return;
    }

    const seenCategories = new Set<string>();
    for (const entry of entries) {
      if (!entry.categoryId) {
        setError("Selecciona una categoria");
        return;
      }
      if (seenCategories.has(entry.categoryId)) {
        setError("No puedes repetir categorias en la misma inscripcion");
        return;
      }
      seenCategories.add(entry.categoryId);

      const category = categoriesById.get(entry.categoryId);
      if (!category) {
        setError("Selecciona una categoria valida");
        return;
      }
      if (isFrontonCategory(category) && !entry.teamName.trim()) {
        setError("Nombre de equipo requerido");
        return;
      }
      const teamConfig = getTeamConfig(category);
      const participants = [
        selectedPlayerId,
        entry.partnerId || "",
        entry.partnerTwoId || "",
      ].filter(Boolean);

      if (teamConfig.maxPlayers === 1 && (entry.partnerId || entry.partnerTwoId)) {
        setError("La categoria no requiere equipo");
        return;
      }
      if (teamConfig.maxPlayers === 2) {
        if (!entry.partnerId) {
          setError("Selecciona el segundo jugador del equipo");
          return;
        }
        if (entry.partnerTwoId) {
          setError("La categoria solo permite 2 jugadores");
          return;
        }
      }
      if (teamConfig.maxPlayers === 3 && !entry.partnerId) {
        setError("Selecciona el segundo jugador del equipo");
        return;
      }
      if (participants.length < teamConfig.minPlayers) {
        setError("Faltan jugadores para esta categoria");
        return;
      }
      if (new Set(participants).size !== participants.length) {
        setError("Los jugadores del equipo no pueden repetirse");
        return;
      }

      const parsedAmount = parsePriceInput(entry.amountPaid);
      if (parsedAmount === null || parsedAmount < 0) {
        setError("El precio de inscripcion es invalido");
        return;
      }
    }

    setSaving(true);
    let processed = 0;
    let errorMessage: string | null = null;
    try {
      if (editingRegistrationId) {
        const entry = entries[0];
        const res = await fetch(
          `/api/tournaments/${tournamentId}/registrations/${editingRegistrationId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
          body: JSON.stringify({
            categoryId: entry.categoryId,
            playerId: selectedPlayerId,
            partnerId: entry.partnerId || null,
            partnerTwoId: entry.partnerTwoId || null,
            teamName: entry.teamName.trim(),
            amountPaid: normalizePriceInput(entry.amountPaid),
            amountDue: normalizePriceInput(entry.amountPaid),
          }),
        }
      );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const detail = data?.detail ? ` (${data.detail})` : "";
          errorMessage = `${data?.error ?? "No se pudo actualizar la inscripcion"}${detail}`;
        } else {
          processed = 1;
        }
      } else {
        for (const entry of entries) {
          const res = await fetch(`/api/tournaments/${tournamentId}/registrations`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              categoryId: entry.categoryId,
              playerId: selectedPlayerId,
              partnerId: entry.partnerId || null,
              partnerTwoId: entry.partnerTwoId || null,
              teamName: entry.teamName.trim(),
              amountPaid: normalizePriceInput(entry.amountPaid),
              amountDue: normalizePriceInput(entry.amountPaid),
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            const detail = data?.detail ? ` (${data.detail})` : "";
            const fallback = "No se pudo agregar la inscripcion";
            errorMessage = `${data?.error ?? fallback}${detail}`;
            break;
          }
          processed += 1;
        }
      }
    } finally {
      setSaving(false);
    }

    if (processed > 0) {
      await refreshRegistrations();
    }
    if (errorMessage) {
      setError(errorMessage);
      return;
    }

    setEditingRegistrationId(null);
    setSelectedPlayerId("");
    setPlayerQuery("");
    if (categories.length > 0) {
      const firstCategory = categories[0];
      setEntries([createEntry(firstCategory.id, firstCategory.price ?? "")]);
    } else {
      setEntries([]);
    }
    setMessage(
      wasEditing
        ? "Inscripcion actualizada"
        : entries.length > 1
        ? "Inscripciones registradas"
        : "Inscripcion registrada"
    );
  };

  const handleRankByLeague = async () => {
    if (!leagueId || !rankingEnabled) {
      setRankingError("Este torneo no usa ranking por liga.");
      return;
    }
    if (!selectedSeasonId) {
      setRankingError("Selecciona una temporada.");
      return;
    }
    setRankingError(null);
    setRankingLoading(true);
    const res = await fetch(
      `/api/tournaments/${tournamentId}/registrations/rankings`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ seasonId: selectedSeasonId }),
      }
    );
    const data = await res.json().catch(() => ({}));
    setRankingLoading(false);
    if (!res.ok) {
      const detail = data?.detail ? ` (${data.detail})` : "";
      setRankingError(`${data?.error ?? "No se pudo rankear"}${detail}`);
      return;
    }
    await refreshRegistrations();
    setMessage("Ranking actualizado segun la liga y categoria.");
  };

  const handleDelete = async (registrationId: string) => {
    if (registrationsLocked) {
      setError("El torneo ya esta pagado y no permite cambios.");
      return;
    }
    setError(null);
    setMessage(null);
    setSaving(true);

    const res = await fetch(
      `/api/tournaments/${tournamentId}/registrations/${registrationId}`,
      {
        method: "DELETE",
        credentials: "include",
      }
    );
    const data = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      const detail = data?.detail ? ` (${data.detail})` : "";
      setError(`${data?.error ?? "No se pudo eliminar la inscripcion"}${detail}`);
      return;
    }

    await refreshRegistrations();
    if (editingRegistrationId === registrationId) {
      setEditingRegistrationId(null);
      setSelectedPlayerId("");
      setPlayerQuery("");
      if (categories.length > 0) {
        const firstCategory = categories[0];
        setEntries([createEntry(firstCategory.id, firstCategory.price ?? "")]);
      } else {
        setEntries([]);
      }
    }
    setMessage("Inscripcion eliminada");
  };

  const startEditing = (registration: Registration) => {
    setEditingRegistrationId(registration.id);
    setSelectedPlayerId(registration.player.id);
    setPlayerQuery(playerLabel(registration.player));
    setEntries([
      {
        id: registration.id,
        categoryId: registration.category.id,
        partnerId: registration.partner?.id ?? "",
        partnerTwoId: registration.partnerTwo?.id ?? "",
        amountPaid: formatCategoryPrice(registration.amountPaid),
        teamName: registration.teamName ?? "",
        partnerQuery: registration.partner ? playerLabel(registration.partner) : "",
        partnerTwoQuery: registration.partnerTwo
          ? playerLabel(registration.partnerTwo)
          : "",
      },
    ]);
  };

  const cancelEditing = () => {
    setEditingRegistrationId(null);
    setSelectedPlayerId("");
    setPlayerQuery("");
    if (categories.length > 0) {
      const firstCategory = categories[0];
      setEntries([createEntry(firstCategory.id, firstCategory.price ?? "")]);
    } else {
      setEntries([]);
    }
  };

  const filterPlayers = (query: string, excludeIds: string[]) => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return players
      .filter((player) => !excludeIds.includes(player.id))
      .filter((player) => {
        const fullName = `${player.firstName} ${player.lastName}`.toLowerCase();
        return (
          fullName.includes(normalized) ||
          player.documentNumber.toLowerCase().includes(normalized)
        );
      })
      .slice(0, 8);
  };

  const filteredPlayers = useMemo(
    () => filterPlayers(playerQuery, []),
    [players, playerQuery]
  );

  const sortRegistrations = (list: Registration[]) => {
    return [...list].sort((a, b) => {
      const seedA = a.seed ?? Number.MAX_SAFE_INTEGER;
      const seedB = b.seed ?? Number.MAX_SAFE_INTEGER;
      if (seedA !== seedB) return seedA - seedB;
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (timeA !== timeB) return timeA - timeB;
      return a.player.lastName.localeCompare(b.player.lastName);
    });
  };

  const registrationGroups = useMemo(() => {
    const byCategory = new Map<string, Registration[]>();
    categories.forEach((category) => byCategory.set(category.id, []));
    const extras: Registration[] = [];

    registrations.forEach((registration) => {
      const bucket = byCategory.get(registration.category.id);
      if (bucket) {
        bucket.push(registration);
      } else {
        extras.push(registration);
      }
    });

    return {
      groups: categories.map((category) => ({
        category,
        registrations: sortRegistrations(byCategory.get(category.id) ?? []),
      })),
      extras: sortRegistrations(extras),
    };
  }, [categories, registrations]);

  const getRegistrationTimestamp = (registration: Registration) => {
    const value = registration.createdAt
      ? new Date(registration.createdAt).getTime()
      : 0;
    return Number.isFinite(value) ? value : 0;
  };

  const isEarlierRegistration = (
    candidate: Registration,
    existing: Registration
  ) => {
    const candidateTime = getRegistrationTimestamp(candidate);
    const existingTime = getRegistrationTimestamp(existing);
    if (candidateTime !== existingTime) return candidateTime < existingTime;
    return candidate.id.localeCompare(existing.id) < 0;
  };

  const formatRegistrationDate = (value?: string | Date | null) => {
    if (!value) return "N/D";
    const iso = typeof value === "string" ? value : value.toISOString();
    return iso.split("T")[0] ?? "N/D";
  };

  const reorderRegistrations = (
    list: Registration[],
    fromId: string,
    toId: string
  ) => {
    const fromIndex = list.findIndex((item) => item.id === fromId);
    const toIndex = list.findIndex((item) => item.id === toId);
    if (fromIndex === -1 || toIndex === -1) return list;
    const next = [...list];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
  };

  const persistSeeds = async (
    categoryId: string,
    ordered: Registration[]
  ) => {
    setReorderingCategoryId(categoryId);
    setError(null);
    setMessage(null);
    try {
      for (let index = 0; index < ordered.length; index += 1) {
        const registration = ordered[index];
        const seedValue = index + 1;
        const res = await fetch(
          `/api/tournaments/${tournamentId}/registrations/${registration.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              categoryId: registration.category.id,
              playerId: registration.player.id,
              partnerId: registration.partner?.id ?? null,
              partnerTwoId: registration.partnerTwo?.id ?? null,
              amountPaid: normalizePriceInput(String(registration.amountPaid)),
              seed: seedValue,
            }),
          }
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const detail = data?.detail ? ` (${data.detail})` : "";
          throw new Error(data?.error ?? `No se pudo guardar el orden${detail}`);
        }
      }
      await refreshRegistrations();
      setMessage("Orden actualizado");
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : undefined;
      setError(detail ?? "No se pudo guardar el orden");
      await refreshRegistrations();
    } finally {
      setReorderingCategoryId(null);
    }
  };

  const handleDragStart = (
    event: DragEvent,
    registration: Registration,
    categoryId: string
  ) => {
    if (registrationsLocked) return;
    setDraggingId(registration.id);
    setDraggingCategoryId(categoryId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", registration.id);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDraggingCategoryId(null);
    setDragOverId(null);
  };

  const handleDragOver = (
    event: DragEvent,
    categoryId: string,
    targetId: string
  ) => {
    if (!draggingId || draggingCategoryId !== categoryId) return;
    event.preventDefault();
    if (dragOverId !== targetId) {
      setDragOverId(targetId);
    }
  };

  const handleDrop = async (
    event: DragEvent,
    categoryId: string,
    targetId: string,
    orderedList: Registration[]
  ) => {
    if (registrationsLocked) return;
    event.preventDefault();
    if (draggingCategoryId !== categoryId) return;
    const draggedId =
      draggingId || event.dataTransfer.getData("text/plain") || "";
    if (!draggedId || draggedId === targetId) {
      setDragOverId(null);
      return;
    }
    const reordered = reorderRegistrations(orderedList, draggedId, targetId);
    const seedMap = new Map(
      reordered.map((registration, index) => [registration.id, index + 1])
    );
    setRegistrations((prev) =>
      prev.map((registration) =>
        registration.category.id === categoryId && seedMap.has(registration.id)
          ? { ...registration, seed: seedMap.get(registration.id) }
          : registration
      )
    );
    setDragOverId(null);
    setDraggingId(null);
    setDraggingCategoryId(null);
    await persistSeeds(categoryId, reordered);
  };

  const handlePlayerQueryChange = (value: string) => {
    setPlayerQuery(value);
    if (selectedPlayerId) {
      setSelectedPlayerId("");
    }
  };

  const selectPlayer = (player: Player) => {
    setSelectedPlayerId(player.id);
    setPlayerQuery(playerLabel(player));
  };

  const selectPartner = (entryId: string, player: Player) => {
    updateEntry(entryId, { partnerId: player.id, partnerQuery: playerLabel(player) });
  };

  const selectPartnerTwo = (entryId: string, player: Player) => {
    updateEntry(entryId, {
      partnerTwoId: player.id,
      partnerTwoQuery: playerLabel(player),
    });
  };

  const addEntry = () => {
    if (registrationsLocked) return;
    if (editingRegistrationId) return;
    if (!categories.length) return;
    const taken = new Set(entries.map((entry) => entry.categoryId).filter(Boolean));
    const nextCategory =
      categories.find((category) => !taken.has(category.id)) ?? categories[0];
    if (!nextCategory) return;
    const hasExisting =
      hasExistingRegistration(selectedPlayerId, editingRegistrationId) ||
      entries.some((entry) => entryHasPlayer(entry, selectedPlayerId));
    const basePrice = hasExisting
      ? formatCategoryPrice(nextCategory.secondaryPrice) ||
        formatCategoryPrice(nextCategory.price)
      : formatCategoryPrice(nextCategory.price);
    setEntries((prev) => [...prev, createEntry(nextCategory.id, basePrice)]);
  };

  const removeEntry = (entryId: string) => {
    if (registrationsLocked) return;
    if (editingRegistrationId) return;
    setEntries((prev) => (prev.length > 1 ? prev.filter((entry) => entry.id !== entryId) : prev));
  };

  const selectedCategoryIds = useMemo(
    () => new Set(entries.map((entry) => entry.categoryId).filter(Boolean)),
    [entries]
  );

  return (
    <div className="space-y-8">
      <div className="admin-fade-up relative overflow-hidden rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-[0_24px_70px_-50px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/70 backdrop-blur">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-indigo-300/70 via-sky-300/60 to-amber-200/70" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-500">
              Paso 2
            </p>
            <h2 className="text-2xl font-semibold text-slate-900">
              Inscripcion de jugadores
            </h2>
            <p className="text-sm text-slate-600">
              Torneo: <span className="font-semibold">{tournamentName}</span>
            </p>
          </div>
          <span className="rounded-full bg-indigo-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-indigo-700">
            Inscripcion
          </span>
        </div>

        {categories.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            No hay categorias seleccionadas para este torneo.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {registrationsLocked && (
              <div className="rounded-2xl border border-amber-200/70 bg-amber-50/80 px-4 py-3 text-sm text-amber-700">
                El torneo esta finalizado. Ya no puedes agregar, editar o eliminar
                inscripciones.
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Jugador</label>
              <input
                type="text"
                value={playerQuery}
                onChange={(e) => handlePlayerQueryChange(e.target.value)}
                disabled={registrationsLocked}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                placeholder="Busca por nombre o CI"
              />
              {selectedPlayer && (
                <p className="text-xs text-slate-500">
                  Seleccionado: {playerLabel(selectedPlayer)}
                </p>
              )}
              {playerQuery.trim().length > 0 && !selectedPlayerId && (
                <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-2 text-sm shadow-[0_12px_28px_-24px_rgba(15,23,42,0.2)]">
                  {filteredPlayers.length === 0 ? (
                    <p className="px-2 py-1 text-xs text-slate-500">
                      Sin resultados
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {filteredPlayers.map((player) => (
                        <button
                          key={player.id}
                          type="button"
                          onClick={() => selectPlayer(player)}
                          disabled={registrationsLocked}
                          className="w-full rounded-xl px-2 py-1 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                        >
                          {playerLabel(player)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                Agrega una o varias categorias para el jugador seleccionado.
              </p>
              <button
                type="button"
                onClick={addEntry}
                disabled={
                  editingRegistrationId ||
                  selectedCategoryIds.size >= categories.length ||
                  registrationsLocked
                }
                className="inline-flex items-center justify-center rounded-full border border-indigo-200/80 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-700 shadow-sm transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-70"
              >
                + Agregar categoria
              </button>
            </div>

            <div className="space-y-4">
              {entries.map((entry, index) => {
                const category = getEntryCategory(entry);
                const teamConfig = getTeamConfig(category);
                const availableCategories = categories.filter(
                  (item) => item.id === entry.categoryId || !selectedCategoryIds.has(item.id)
                );
                const partnerOptions = filterPlayers(entry.partnerQuery, [
                  selectedPlayerId,
                  entry.partnerTwoId,
                ]);
                const partnerTwoOptions = filterPlayers(entry.partnerTwoQuery, [
                  selectedPlayerId,
                  entry.partnerId,
                ]);
                const partner =
                  entry.partnerId && players.find((player) => player.id === entry.partnerId);
                const partnerTwo =
                  entry.partnerTwoId &&
                  players.find((player) => player.id === entry.partnerTwoId);

                return (
                  <div
                    key={entry.id}
                    className="rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-[0_16px_40px_-32px_rgba(15,23,42,0.3)]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                          Categoria {index + 1}
                        </p>
                        <p className="text-sm font-semibold text-slate-900">
                          {category?.name ?? "Selecciona categoria"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeEntry(entry.id)}
                        disabled={
                          editingRegistrationId !== null ||
                          entries.length === 1 ||
                          registrationsLocked
                        }
                        className="rounded-full border border-slate-200/70 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Quitar
                      </button>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">
                          Categoria
                        </label>
                        <select
                          value={entry.categoryId}
                          onChange={(e) => handleCategoryChange(entry.id, e.target.value)}
                          disabled={registrationsLocked}
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        >
                          <option value="">Selecciona categoria</option>
                          {availableCategories.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name} ({item.abbreviation})
                            </option>
                          ))}
                        </select>
                      </div>

                      {isFrontonCategory(category) && (
                        <div className="space-y-2 md:col-span-2">
                          <label className="text-sm font-medium text-slate-700">
                            Nombre del equipo
                          </label>
                          <input
                            type="text"
                            value={entry.teamName}
                            onChange={(e) =>
                              updateEntry(entry.id, { teamName: e.target.value })
                            }
                            disabled={registrationsLocked}
                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                            placeholder="Ej. Team Polanco"
                          />
                        </div>
                      )}

                      {teamConfig.maxPlayers > 1 && (
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-700">
                            Jugador 2
                          </label>
                          <input
                            type="text"
                            value={entry.partnerQuery}
                            onChange={(e) =>
                              updateEntry(entry.id, {
                                partnerQuery: e.target.value,
                                partnerId: "",
                              })
                            }
                            disabled={registrationsLocked}
                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                            placeholder="Busca por nombre o CI"
                          />
                          {partner && (
                            <p className="text-xs text-slate-500">
                              Seleccionado: {playerLabel(partner)}
                            </p>
                          )}
                          {entry.partnerQuery.trim().length > 0 && !entry.partnerId && (
                            <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-2 text-sm shadow-[0_12px_28px_-24px_rgba(15,23,42,0.2)]">
                              {partnerOptions.length === 0 ? (
                                <p className="px-2 py-1 text-xs text-slate-500">
                                  Sin resultados
                                </p>
                              ) : (
                                <div className="space-y-1">
                                  {partnerOptions.map((player) => (
                                    <button
                                      key={player.id}
                                      type="button"
                                      onClick={() => selectPartner(entry.id, player)}
                                      disabled={registrationsLocked}
                                      className="w-full rounded-xl px-2 py-1 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                                    >
                                      {playerLabel(player)}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {teamConfig.maxPlayers > 2 && (
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-700">
                            Jugador 3
                          </label>
                          <input
                            type="text"
                            value={entry.partnerTwoQuery}
                            onChange={(e) =>
                              updateEntry(entry.id, {
                                partnerTwoQuery: e.target.value,
                                partnerTwoId: "",
                              })
                            }
                            disabled={registrationsLocked}
                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                            placeholder="Busca por nombre o CI"
                          />
                          {partnerTwo && (
                            <p className="text-xs text-slate-500">
                              Seleccionado: {playerLabel(partnerTwo)}
                            </p>
                          )}
                          {entry.partnerTwoQuery.trim().length > 0 &&
                            !entry.partnerTwoId && (
                              <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-2 text-sm shadow-[0_12px_28px_-24px_rgba(15,23,42,0.2)]">
                                {partnerTwoOptions.length === 0 ? (
                                  <p className="px-2 py-1 text-xs text-slate-500">
                                    Sin resultados
                                  </p>
                                ) : (
                                  <div className="space-y-1">
                                    {partnerTwoOptions.map((player) => (
                                      <button
                                        key={player.id}
                                        type="button"
                                        onClick={() => selectPartnerTwo(entry.id, player)}
                                        disabled={registrationsLocked}
                                        className="w-full rounded-xl px-2 py-1 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                                      >
                                        {playerLabel(player)}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            Agrega jugadores a las categorias seleccionadas del torneo.
          </p>
          <div className="flex items-center gap-2">
            {editingRegistrationId && (
              <button
                type="button"
                onClick={cancelEditing}
                disabled={saving || registrationsLocked}
                className="rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
              >
                Cancelar edicion
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || categories.length === 0 || registrationsLocked}
              className="inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_-22px_rgba(15,23,42,0.5)] transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving
                ? "Guardando..."
                : editingRegistrationId
                ? "Actualizar inscripcion"
                : entries.length > 1
                ? "Agregar inscripciones"
                : "Agregar inscripcion"}
            </button>
          </div>
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {message && (
          <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
            {message}
          </p>
        )}
      </div>

      <div className="admin-fade-up relative overflow-hidden rounded-[24px] border border-white/70 bg-white/80 p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/70 backdrop-blur">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-slate-200/80 via-indigo-200/60 to-slate-200/80" />
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Inscripciones</h3>
          <p className="text-xs text-slate-500">
            {registrations.length}{" "}
            {registrations.length === 1 ? "registro" : "registros"}
          </p>
        </div>

        {rankingEnabled && leagueId && (
          <div className="mt-4 rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Rankear por liga y categoria
              </p>
            <p className="mt-1 text-sm text-slate-600">
              Liga:{" "}
              <span className="font-semibold text-slate-800">
                {leagueName ?? "Liga seleccionada"}
              </span>
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="min-w-[220px]">
                <label className="text-xs font-semibold text-slate-600">
                  Temporada
                </label>
                <select
                  value={selectedSeasonId}
                  onChange={(event) => setSelectedSeasonId(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                >
                  <option value="">Selecciona temporada</option>
                  {seasons.map((season) => (
                    <option key={season.id} value={season.id}>
                      {season.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={handleRankByLeague}
                disabled={rankingLoading || !selectedSeasonId}
                className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                  {rankingLoading ? "Rankeando..." : "Rankear por liga"}
              </button>
            </div>
            {rankingError && (
              <p className="mt-2 text-sm text-red-600">{rankingError}</p>
            )}
          </div>
        )}

        {loading ? (
          <p className="mt-3 text-sm text-slate-500">Cargando...</p>
        ) : registrations.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No hay inscripciones.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {registrationGroups.groups.map(
              ({ category, registrations: categoryRegistrations }) => (
              <div
                key={category.id}
                className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 shadow-[0_14px_36px_-28px_rgba(15,23,42,0.25)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50/80 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {category.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {category.abbreviation} - {category.sport?.name ?? "N/D"}
                    </p>
                  </div>
                  <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-600">
                    {categoryRegistrations.length}{" "}
                    {categoryRegistrations.length === 1
                      ? "inscrito"
                      : "inscritos"}
                  </span>
                </div>
                {categoryRegistrations.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-slate-500">
                    Sin inscripciones en esta categoria.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-[520px] divide-y divide-slate-200/70 text-sm">
                      <thead className="bg-slate-50/80 text-[11px] uppercase tracking-[0.2em] text-slate-500">
                        <tr>
                          <th className="px-3 py-3 text-left font-semibold">
                            Jugador / Equipo
                          </th>
                          <th className="px-3 py-3 text-left font-semibold">Fecha</th>
                          <th className="px-3 py-3 text-left font-semibold">
                            Accion
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {categoryRegistrations.map((registration, index) => {
                        const isDragTarget =
                          dragOverId === registration.id &&
                          draggingCategoryId === category.id;
                        const dragDisabled =
                          saving ||
                          reorderingCategoryId === category.id ||
                          registrationsLocked;
                        return (
                          <tr
                            key={registration.id}
                            onDragOver={(event) =>
                              handleDragOver(event, category.id, registration.id)
                            }
                            onDrop={(event) =>
                              handleDrop(
                                event,
                                category.id,
                                registration.id,
                                categoryRegistrations
                              )
                            }
                            className={isDragTarget ? "bg-indigo-50/70" : undefined}
                          >
                            <td className="px-3 py-2">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-center gap-3">
                                  <button
                                    type="button"
                                    draggable={!dragDisabled}
                                    onDragStart={(event) =>
                                      handleDragStart(
                                        event,
                                        registration,
                                        category.id
                                      )
                                    }
                                    onDragEnd={handleDragEnd}
                                    disabled={dragDisabled}
                                    className="cursor-grab rounded-full border border-slate-200/70 bg-white/80 px-2.5 py-1 text-xs font-semibold text-slate-500 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                                    aria-label="Mover"
                                  >
                                    ::
                                  </button>
                                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                                    {index + 1}
                                  </span>
                                  <div className="flex flex-col">
                                    {registration.teamName && (
                                      <span className="text-xs font-semibold uppercase tracking-[0.15em] text-indigo-600">
                                        {registration.teamName}
                                      </span>
                                    )}
                                    <span className="font-semibold text-slate-900">
                                      {registration.player.firstName}{" "}
                                      {registration.player.lastName}
                                    </span>
                                    {registration.partner && (
                                      <span className="text-xs text-slate-600">
                                        + {registration.partner.firstName}{" "}
                                        {registration.partner.lastName}
                                      </span>
                                    )}
                                    {registration.partnerTwo && (
                                      <span className="text-xs text-slate-600">
                                        + {registration.partnerTwo.firstName}{" "}
                                        {registration.partnerTwo.lastName}
                                      </span>
                                    )}
                                    <span className="text-xs text-slate-500">
                                      {registration.player.documentType === "ID_CARD"
                                        ? "CI"
                                        : "Pas"}{" "}
                                      {registration.player.documentNumber}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-slate-700">
                              {formatRegistrationDate(registration.createdAt)}
                            </td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => startEditing(registration)}
                                disabled={saving || registrationsLocked}
                                className="rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(registration.id)}
                                disabled={saving || registrationsLocked}
                                className="ml-2 rounded-full border border-red-200 bg-red-50/60 px-3 py-1.5 text-xs font-semibold text-red-600 shadow-sm transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-70"
                              >
                                Eliminar
                              </button>
                            </td>
                          </tr>
                        );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
            {registrationGroups.extras.length > 0 && (
              <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 shadow-[0_14px_36px_-28px_rgba(15,23,42,0.25)]">
                <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50/80 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Otras categorias
                    </p>
                    <p className="text-xs text-slate-500">
                      Inscripciones fuera de la seleccion actual.
                    </p>
                  </div>
                  <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-600">
                    {registrationGroups.extras.length}{" "}
                    {registrationGroups.extras.length === 1 ? "inscrito" : "inscritos"}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-[640px] divide-y divide-slate-200/70 text-sm">
                    <thead className="bg-slate-50/80 text-[11px] uppercase tracking-[0.2em] text-slate-500">
                      <tr>
                        <th className="px-3 py-3 text-left font-semibold">Categoria</th>
                        <th className="px-3 py-3 text-left font-semibold">
                          Jugador / Equipo
                        </th>
                        <th className="px-3 py-3 text-left font-semibold">Fecha</th>
                        <th className="px-3 py-3 text-left font-semibold">Accion</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {registrationGroups.extras.map((registration, index) => (
                      <tr key={registration.id}>
                        <td className="px-3 py-2">
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-900">
                              {registration.category.name}
                            </span>
                            <span className="text-xs text-slate-500">
                              {registration.category.abbreviation}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-3">
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                                {index + 1}
                              </span>
                              <div className="flex flex-col">
                                {registration.teamName && (
                                  <span className="text-xs font-semibold uppercase tracking-[0.15em] text-indigo-600">
                                    {registration.teamName}
                                  </span>
                                )}
                                <span className="font-semibold text-slate-900">
                                  {registration.player.firstName}{" "}
                                  {registration.player.lastName}
                                </span>
                                {registration.partner && (
                                  <span className="text-xs text-slate-600">
                                    + {registration.partner.firstName}{" "}
                                    {registration.partner.lastName}
                                  </span>
                                )}
                                {registration.partnerTwo && (
                                  <span className="text-xs text-slate-600">
                                    + {registration.partnerTwo.firstName}{" "}
                                    {registration.partnerTwo.lastName}
                                  </span>
                                )}
                                <span className="text-xs text-slate-500">
                                  {registration.player.documentType === "ID_CARD"
                                    ? "CI"
                                    : "Pas"}{" "}
                                  {registration.player.documentNumber}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {formatRegistrationDate(registration.createdAt)}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => startEditing(registration)}
                            disabled={saving || registrationsLocked}
                            className="rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(registration.id)}
                            disabled={saving || registrationsLocked}
                            className="ml-2 rounded-full border border-red-200 bg-red-50/60 px-3 py-1.5 text-xs font-semibold text-red-600 shadow-sm transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

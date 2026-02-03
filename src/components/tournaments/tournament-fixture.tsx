"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";

type DrawType = "ROUND_ROBIN" | "GROUPS_PLAYOFF" | "PLAYOFF";

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
  groupName: string | null;
  seed?: number | null;
  rankingNumber?: number | null;
  player: Player;
  partner: Player | null;
  partnerTwo: Player | null;
  teamName?: string | null;
};

type Category = {
  id: string;
  name: string;
  abbreviation: string;
  drawType: DrawType | null;
  groupQualifiers?: number | null;
  sport?: { id: string; name: string } | null;
};

type GroupQualifier = {
  categoryId: string;
  groupName: string;
  qualifiers: number;
};

type Match = {
  id: string;
  categoryId: string;
  groupName: string | null;
  stage?: "GROUP" | "PLAYOFF" | null;
  roundNumber: number | null;
  teamAId?: string | null;
  teamBId?: string | null;
};

type FixtureResponse = {
  categories: Category[];
  registrations: Registration[];
  matches?: Match[];
  groupQualifiers?: GroupQualifier[];
  tournamentStatus?: "WAITING" | "ACTIVE" | "FINISHED";
  groupsPublished?: boolean;
  paymentRate?: string;
  paymentPaidAmount?: string;
  paymentReportedAmount?: string | null;
  paymentReportedNote?: string | null;
  paymentReportedAt?: string | null;
  paymentReportedBy?: { id: string; name: string | null; email: string } | null;
  sessionRole?: "ADMIN" | "TOURNAMENT_ADMIN";
};

type Props = {
  tournamentId: string;
  tournamentName: string;
};

const groupDrawTypes = new Set<DrawType>(["ROUND_ROBIN", "GROUPS_PLAYOFF"]);

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

const getGroupKey = (value?: string | null) => value?.trim() || "A";

const countRegistrationPlayers = (registration: Registration) => {
  let count = 0;
  if (registration.player) count += 1;
  if (registration.partner) count += 1;
  if (registration.partnerTwo) count += 1;
  return count;
};

const parseMoneyInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

export default function TournamentFixture({ tournamentId, tournamentName }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [groupQualifiers, setGroupQualifiers] = useState<GroupQualifier[]>([]);
  const [tournamentStatus, setTournamentStatus] = useState<
    "WAITING" | "ACTIVE" | "FINISHED"
  >("WAITING");
  const [paymentRate, setPaymentRate] = useState("0");
  const [paymentPaidAmount, setPaymentPaidAmount] = useState("0");
  const [paymentReportedAmount, setPaymentReportedAmount] = useState<string | null>(
    null
  );
  const [paymentReportedNote, setPaymentReportedNote] = useState<string | null>(
    null
  );
  const [paymentReportedAt, setPaymentReportedAt] = useState<string | null>(null);
  const [paymentReportedBy, setPaymentReportedBy] = useState<{
    id: string;
    name: string | null;
    email: string;
  } | null>(null);
  const [sessionRole, setSessionRole] = useState<
    "ADMIN" | "TOURNAMENT_ADMIN"
  >("TOURNAMENT_ADMIN");
  const [groupsPublished, setGroupsPublished] = useState(false);
  const [paymentPaidDeltaInput, setPaymentPaidDeltaInput] = useState("");
  const [paymentReportedAmountInput, setPaymentReportedAmountInput] =
    useState("");
  const [paymentReportedNoteInput, setPaymentReportedNoteInput] = useState("");
  const [savingPaymentPaid, setSavingPaymentPaid] = useState(false);
  const [savingPaymentReport, setSavingPaymentReport] = useState(false);
  const [reviewingPaymentReport, setReviewingPaymentReport] = useState(false);
  const [publishingGroups, setPublishingGroups] = useState(false);
  const [paymentQrUrl, setPaymentQrUrl] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [loading, setLoading] = useState(false);
  const [autoGroupingId, setAutoGroupingId] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [updatingGroupId, setUpdatingGroupId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingCategoryId, setDraggingCategoryId] = useState<string | null>(
    null
  );
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);
  const [updatingQualifiersKey, setUpdatingQualifiersKey] = useState<
    string | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    const [fixtureRes, settingsRes] = await Promise.all([
      fetch(`/api/tournaments/${tournamentId}/fixtures`, {
        cache: "no-store",
      }),
      fetch(`/api/settings/payment-rate`, { cache: "no-store" }),
    ]);
    const data = (await fixtureRes.json().catch(() => ({}))) as FixtureResponse;
    const settingsData = (await settingsRes.json().catch(() => ({}))) as {
      paymentQrUrl?: string | null;
    };
    setLoading(false);
    if (!fixtureRes.ok) {
      const detail = (data as { detail?: string })?.detail
        ? ` (${(data as { detail?: string }).detail})`
        : "";
      setError(
        `${(data as { error?: string })?.error ?? "No se pudo cargar el sembrado"}${detail}`
      );
      return;
    }
    if (settingsRes.ok) {
      setPaymentQrUrl(
        typeof settingsData.paymentQrUrl === "string" &&
          settingsData.paymentQrUrl.trim().length > 0
          ? settingsData.paymentQrUrl
          : null
      );
    }

    setCategories(Array.isArray(data.categories) ? data.categories : []);
    setRegistrations(Array.isArray(data.registrations) ? data.registrations : []);
    setMatches(Array.isArray(data.matches) ? data.matches : []);
    setGroupQualifiers(
      Array.isArray(data.groupQualifiers) ? data.groupQualifiers : []
    );
    if (data.tournamentStatus) {
      setTournamentStatus(data.tournamentStatus);
    }
    if (data.paymentRate !== undefined) {
      setPaymentRate(String(data.paymentRate));
    }
    if (data.paymentPaidAmount !== undefined) {
      setPaymentPaidAmount(String(data.paymentPaidAmount));
    }
    setPaymentReportedAmount(
      data.paymentReportedAmount !== undefined && data.paymentReportedAmount !== null
        ? String(data.paymentReportedAmount)
        : null
    );
    setPaymentReportedNote(
      data.paymentReportedNote !== undefined && data.paymentReportedNote !== null
        ? String(data.paymentReportedNote)
        : null
    );
    setPaymentReportedAt(data.paymentReportedAt ?? null);
    setPaymentReportedBy(data.paymentReportedBy ?? null);
    setPaymentReportedAmountInput(
      data.paymentReportedAmount !== undefined && data.paymentReportedAmount !== null
        ? String(data.paymentReportedAmount)
        : ""
    );
    setPaymentReportedNoteInput(
      data.paymentReportedNote !== undefined && data.paymentReportedNote !== null
        ? String(data.paymentReportedNote)
        : ""
    );
    if (data.sessionRole) {
      setSessionRole(data.sessionRole);
    }
    setGroupsPublished(Boolean(data.groupsPublished));
  };

  useEffect(() => {
    loadData();
  }, [tournamentId]);

  const groupCategories = useMemo(() => {
    const categoriesWithMatches = new Set(
      matches
        .filter((match) => !match.stage || match.stage === "GROUP")
        .map((match) => match.categoryId)
    );
    const categoriesWithGroups = new Set(
      registrations
        .filter((registration) => registration.groupName)
        .map((registration) => registration.categoryId)
    );

    return categories.filter(
      (category) =>
        groupDrawTypes.has(category.drawType) ||
        categoriesWithMatches.has(category.id) ||
        categoriesWithGroups.has(category.id)
    );
  }, [categories, matches, registrations]);

  const groupActionCategories = useMemo(
    () => categories.filter((category) => groupDrawTypes.has(category.drawType)),
    [categories]
  );

  const registrationsByCategory = useMemo(() => {
    const map = new Map<string, Registration[]>();
    for (const registration of registrations) {
      if (!map.has(registration.categoryId)) {
        map.set(registration.categoryId, []);
      }
      map.get(registration.categoryId)?.push(registration);
    }
    return map;
  }, [registrations]);

  const totalPlayers = useMemo(
    () =>
      registrations.reduce(
        (sum, registration) => sum + countRegistrationPlayers(registration),
        0
      ),
    [registrations]
  );
  const paymentRateValue = parseMoneyInput(paymentRate) ?? 0;
  const paymentPaidValue = parseMoneyInput(paymentPaidAmount) ?? 0;
  const paymentTotal = paymentRateValue * totalPlayers;
  const paymentPending = Math.max(0, paymentTotal - paymentPaidValue);
  const paymentComplete = paymentPending <= 0.005;
  const paymentDeltaValue = parseMoneyInput(paymentPaidDeltaInput);
  const canRegisterPayment = paymentDeltaValue !== null && paymentDeltaValue > 0;
  const paymentReportedValue = parseMoneyInput(paymentReportedAmountInput);
  const canReportPayment =
    paymentReportedValue !== null && paymentReportedValue > 0;

  const matchesByCategory = useMemo(() => {
    const map = new Map<string, Match[]>();
    for (const match of matches) {
      if (match.stage && match.stage !== "GROUP") continue;
      if (!map.has(match.categoryId)) {
        map.set(match.categoryId, []);
      }
      map.get(match.categoryId)?.push(match);
    }
    return map;
  }, [matches]);

  const qualifiersByGroup = useMemo(() => {
    const map = new Map<string, number>();
    groupQualifiers.forEach((entry) => {
      const key = `${entry.categoryId}:${getGroupKey(entry.groupName)}`;
      map.set(key, entry.qualifiers);
    });
    return map;
  }, [groupQualifiers]);

  const sortRegistrations = (list: Registration[]) => {
    return [...list].sort((a, b) => {
      const seedA = a.seed ?? Number.MAX_SAFE_INTEGER;
      const seedB = b.seed ?? Number.MAX_SAFE_INTEGER;
      if (seedA !== seedB) return seedA - seedB;
      const nameA = formatTeamName(a);
      const nameB = formatTeamName(b);
      return nameA.localeCompare(nameB);
    });
  };

  const autoGroups = async (categoryId: string) => {
    if (!paymentComplete) {
      setPaymentPaidDeltaInput("");
      setShowPaymentModal(true);
      return;
    }
    setAutoGroupingId(categoryId);
    setError(null);
    setMessage(null);

    const res = await fetch(`/api/tournaments/${tournamentId}/fixtures/auto-groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ categoryId }),
    });

    const data = await res.json().catch(() => ({}));
    setAutoGroupingId(null);

    if (!res.ok) {
      const detail = data?.detail ? ` (${data.detail})` : "";
      setError(
        `${data?.error ?? "No se pudieron crear los grupos automaticamente"}${detail}`
      );
      return;
    }

    await loadData();
    setMessage("Grupos creados automaticamente");
  };

  const generateFixture = async (categoryId: string, regenerate: boolean) => {
    if (!paymentComplete) {
      setPaymentPaidDeltaInput("");
      setShowPaymentModal(true);
      return;
    }
    const res = await fetch(`/api/tournaments/${tournamentId}/fixtures/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ categoryId, regenerate }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const detail = data?.detail ? ` (${data.detail})` : "";
      throw new Error(data?.error ?? `No se pudo generar el fixture${detail}`);
    }
  };

  const generateAllFixtures = async () => {
    if (groupActionCategories.length === 0) return;
    if (!paymentComplete) {
      setPaymentPaidDeltaInput("");
      setShowPaymentModal(true);
      return;
    }
    setGeneratingAll(true);
    setError(null);
    setMessage(null);

    try {
      for (const category of groupActionCategories) {
        const categoryRegistrations =
          registrationsByCategory.get(category.id) ?? [];
        if (categoryRegistrations.length < 2) continue;
        await generateFixture(category.id, true);
      }
      await loadData();
      setMessage("Fixture generado por rondas");
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : undefined;
      setError(detail ?? "No se pudo generar el fixture");
    } finally {
      setGeneratingAll(false);
    }
  };

  const handleToggleGroupsPublish = async () => {
    if (publishingGroups) return;
    setPublishingGroups(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/draws`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ groupsPublished: !groupsPublished }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = data?.error ? ` (${data.error})` : "";
        throw new Error(`No se pudo actualizar${detail}`);
      }
      setGroupsPublished(Boolean(data.groupsPublished));
      setMessage(!groupsPublished ? "Sembrado publicado" : "Sembrado oculto");
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : undefined;
      setError(detail ?? "No se pudo actualizar");
    } finally {
      setPublishingGroups(false);
    }
  };

  const handleFinalizePayment = async () => {
    if (sessionRole !== "ADMIN") return;
    if (!paymentComplete) {
      setError("Aun hay saldo pendiente por pagar");
      return;
    }
    setUpdatingStatus(true);
    setError(null);
    setMessage(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ status: "ACTIVE" }),
    });
    const data = await res.json().catch(() => ({}));
    setUpdatingStatus(false);
    if (!res.ok) {
      const detail = data?.detail ? ` (${data.detail})` : "";
      setError(`${data?.error ?? "No se pudo activar el torneo"}${detail}`);
      return;
    }
    setTournamentStatus("ACTIVE");
    setShowPaymentModal(false);
    setMessage("Torneo activado");
  };

  const handlePaymentReported = () => {
    const parsed = parseMoneyInput(paymentReportedAmountInput);
    if (parsed === null || parsed <= 0) {
      setError("Ingresa un monto valido");
      return;
    }
    setSavingPaymentReport(true);
    setError(null);
    setMessage(null);
    fetch(`/api/tournaments/${tournamentId}/payment-report`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        paymentReportedAmount: parsed,
        paymentReportedNote: paymentReportedNoteInput,
      }),
    })
      .then((res) =>
        res
          .json()
          .catch(() => ({}))
          .then((data) => ({ res, data }))
      )
      .then(({ res, data }) => {
        if (!res.ok) {
          const detail = data?.detail ? ` (${data.detail})` : "";
          setError(`${data?.error ?? "No se pudo reportar el pago"}${detail}`);
          return;
        }
        setPaymentReportedAmount(data?.tournament?.paymentReportedAmount ?? String(parsed));
        setPaymentReportedNote(data?.tournament?.paymentReportedNote ?? null);
        setPaymentReportedAt(data?.tournament?.paymentReportedAt ?? null);
        setPaymentReportedBy(data?.tournament?.paymentReportedBy ?? null);
        setShowPaymentModal(false);
        setMessage("Pago reportado. Un administrador debe aprobarlo.");
      })
      .finally(() => setSavingPaymentReport(false));
  };

  const approvePaymentReport = async () => {
    if (sessionRole !== "ADMIN") return;
    setReviewingPaymentReport(true);
    setError(null);
    setMessage(null);
    const res = await fetch(
      `/api/tournaments/${tournamentId}/payment-report/approve`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      }
    );
    const data = await res.json().catch(() => ({}));
    setReviewingPaymentReport(false);
    if (!res.ok) {
      const detail = data?.detail ? ` (${data.detail})` : "";
      setError(`${data?.error ?? "No se pudo aprobar el reporte"}${detail}`);
      return;
    }
    if (data?.tournament?.paymentPaidAmount !== undefined) {
      setPaymentPaidAmount(String(data.tournament.paymentPaidAmount));
    }
    setPaymentReportedAmount(null);
    setPaymentReportedNote(null);
    setPaymentReportedAt(null);
    setPaymentReportedBy(null);
    setPaymentReportedAmountInput("");
    setPaymentReportedNoteInput("");
    setMessage("Pago reportado aprobado");
  };

  const rejectPaymentReport = async () => {
    if (sessionRole !== "ADMIN") return;
    setReviewingPaymentReport(true);
    setError(null);
    setMessage(null);
    const res = await fetch(
      `/api/tournaments/${tournamentId}/payment-report/reject`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      }
    );
    const data = await res.json().catch(() => ({}));
    setReviewingPaymentReport(false);
    if (!res.ok) {
      const detail = data?.detail ? ` (${data.detail})` : "";
      setError(`${data?.error ?? "No se pudo rechazar el reporte"}${detail}`);
      return;
    }
    setPaymentReportedAmount(null);
    setPaymentReportedNote(null);
    setPaymentReportedAt(null);
    setPaymentReportedBy(null);
    setPaymentReportedAmountInput("");
    setPaymentReportedNoteInput("");
    setMessage("Reporte rechazado");
  };

  const handleRegisterPayment = async () => {
    if (sessionRole !== "ADMIN") return;
    if (!canRegisterPayment) {
      setError("Ingresa un monto valido");
      return;
    }
    setSavingPaymentPaid(true);
    setError(null);
    setMessage(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/payment`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ paymentPaidDelta: paymentDeltaValue }),
    });
    const data = await res.json().catch(() => ({}));
    setSavingPaymentPaid(false);
    if (!res.ok) {
      const detail = data?.detail ? ` (${data.detail})` : "";
      setError(`${data?.error ?? "No se pudo registrar el pago"}${detail}`);
      return;
    }
    if (data?.tournament?.paymentPaidAmount !== undefined) {
      setPaymentPaidAmount(String(data.tournament.paymentPaidAmount));
    }
    setPaymentPaidDeltaInput("");
    setMessage("Pago registrado");
  };

  const handleQualifiersChange = async (
    categoryId: string,
    groupName: string,
    qualifiers: number
  ) => {
    const key = `${categoryId}:${getGroupKey(groupName)}`;
    setUpdatingQualifiersKey(key);
    setError(null);
    setMessage(null);

    const res = await fetch(
      `/api/tournaments/${tournamentId}/fixtures/qualifiers`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ categoryId, groupName, qualifiers }),
      }
    );

    const data = await res.json().catch(() => ({}));
    setUpdatingQualifiersKey(null);

    if (!res.ok) {
      const detail = data?.detail ? ` (${data.detail})` : "";
      setError(`${data?.error ?? "No se pudo actualizar"}${detail}`);
      return;
    }

    const normalizedGroup = getGroupKey(groupName);
    setGroupQualifiers((prev) => {
      const next = [...prev];
      const index = next.findIndex(
        (entry) =>
          entry.categoryId === categoryId &&
          getGroupKey(entry.groupName) === normalizedGroup
      );
      const nextValue =
        typeof data?.qualifiers === "number" ? data.qualifiers : qualifiers;
      if (index >= 0) {
        next[index] = { ...next[index], qualifiers: nextValue };
      } else {
        next.push({
          categoryId,
          groupName: normalizedGroup,
          qualifiers: nextValue,
        });
      }
      return next;
    });
    setMessage("Clasificados actualizados");
  };

  const handleDragStart = (
    event: DragEvent,
    registration: Registration,
    categoryId: string
  ) => {
    setDraggingId(registration.id);
    setDraggingCategoryId(categoryId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", registration.id);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDraggingCategoryId(null);
    setDragOverGroup(null);
  };

  const handleGroupDragOver = (
    event: DragEvent,
    categoryId: string,
    groupName: string
  ) => {
    if (!draggingId || draggingCategoryId !== categoryId) return;
    event.preventDefault();
    const key = `${categoryId}:${groupName}`;
    if (dragOverGroup !== key) {
      setDragOverGroup(key);
    }
  };

  const handleGroupDrop = async (
    event: DragEvent,
    categoryId: string,
    groupName: string
  ) => {
    event.preventDefault();
    if (!draggingId || draggingCategoryId !== categoryId) return;
    const registrationId =
      draggingId || event.dataTransfer.getData("text/plain");
    if (!registrationId) return;
    const current = registrations.find((item) => item.id === registrationId);
    if (!current || current.categoryId !== categoryId) return;
    const currentGroup = getGroupKey(current.groupName);
    if (currentGroup === groupName) {
      setDragOverGroup(null);
      return;
    }

    setRegistrations((prev) =>
      prev.map((registration) =>
        registration.id === registrationId
          ? { ...registration, groupName }
          : registration
      )
    );
    setDragOverGroup(null);
    setDraggingId(null);
    setDraggingCategoryId(null);
    setUpdatingGroupId(registrationId);
    setError(null);
    setMessage(null);

    const res = await fetch(`/api/tournaments/${tournamentId}/fixtures/groups`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        entries: [{ registrationId, groupName }],
      }),
    });

    setUpdatingGroupId(null);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const detail = data?.detail ? ` (${data.detail})` : "";
      setError(`${data?.error ?? "No se pudo mover el jugador"}${detail}`);
      await loadData();
      return;
    }

    setMessage("Grupo actualizado");
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Cargando sembrado...</p>;
  }

  return (
    <div className="space-y-8">
      <div className="admin-fade-up relative overflow-hidden rounded-[24px] border border-white/70 bg-white/80 p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/70 backdrop-blur">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-indigo-300/70 via-sky-300/60 to-amber-200/70" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-500">
              Paso 5
            </p>
            <h2 className="text-2xl font-semibold text-slate-900">
              Sembrado de grupo
            </h2>
            <p className="text-sm text-slate-600">
              Torneo: <span className="font-semibold">{tournamentName}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={generateAllFixtures}
              disabled={generatingAll || groupActionCategories.length === 0}
              className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-[0_14px_32px_-18px_rgba(79,70,229,0.45)] transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {generatingAll ? "Generando..." : "Generar fixture"}
            </button>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600">
                {groupsPublished ? "Sembrado publicado" : "Sembrado oculto"}
              </span>
              <button
                type="button"
                onClick={handleToggleGroupsPublish}
                disabled={publishingGroups}
                className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {publishingGroups
                  ? "Actualizando..."
                  : groupsPublished
                  ? "Ocultar"
                  : "Publicar"}
              </button>
            </div>
            {!paymentComplete && (
              <button
                type="button"
                onClick={() => {
                  setPaymentPaidDeltaInput("");
                  setShowPaymentModal(true);
                }}
                className="inline-flex items-center justify-center rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 shadow-sm transition hover:border-amber-300"
              >
                Ver pago
              </button>
            )}
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
              Grupos
            </span>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-600">
          Revisa los nombres y el grupo asignado para cada categoria. Arrastra
          para mover jugadores entre grupos.
        </p>
      </div>

      {groupCategories.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          No hay categorias con sorteo por grupos.
        </p>
      ) : (
        groupCategories.map((category) => {
          const categoryRegistrations =
            registrationsByCategory.get(category.id) ?? [];
          const canAutoGroup = groupDrawTypes.has(category.drawType);
          const groupMap = new Map<string, Registration[]>();
          categoryRegistrations.forEach((registration) => {
            const groupKey = getGroupKey(registration.groupName);
            if (!groupMap.has(groupKey)) {
              groupMap.set(groupKey, []);
            }
            groupMap.get(groupKey)?.push(registration);
          });
          const groupEntries = Array.from(groupMap.entries()).sort((a, b) =>
            a[0].localeCompare(b[0])
          );

          return (
            <div
              key={category.id}
              className="admin-fade-up space-y-6 rounded-[24px] border border-white/70 bg-white/80 p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/70 backdrop-blur"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-xl font-semibold text-slate-900">
                    {category.name}
                  </h3>
                <p className="text-xs text-slate-500">
                  {category.abbreviation} - {category.sport?.name ?? "N/D"}
                </p>
              </div>
                <button
                  type="button"
                  onClick={() => autoGroups(category.id)}
                  disabled={
                    !canAutoGroup ||
                    autoGroupingId === category.id ||
                    categoryRegistrations.length === 0
                  }
                  className="inline-flex items-center justify-center rounded-full border border-indigo-200 bg-white px-4 py-2 text-xs font-semibold text-indigo-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {autoGroupingId === category.id ? "Asignando..." : "Auto grupos"}
                </button>
              </div>

              {categoryRegistrations.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No hay inscritos para esta categoria.
                </p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {groupEntries.map(([groupName, groupRegistrations]) => {
                    const showQualifiers = category.drawType === "GROUPS_PLAYOFF";
                    const groupKey = `${category.id}:${groupName}`;
                    const storedQualifiers = qualifiersByGroup.get(groupKey);
                    const defaultQualifiers =
                      typeof category.groupQualifiers === "number" &&
                      category.groupQualifiers > 0
                        ? category.groupQualifiers
                        : 2;
                    const qualifiersValue =
                      typeof storedQualifiers === "number" && storedQualifiers > 0
                        ? storedQualifiers
                        : defaultQualifiers;
                    const maxQualifiers = Math.max(1, groupRegistrations.length);
                    const selectedQualifiers = Math.min(
                      qualifiersValue,
                      maxQualifiers
                    );
                    const qualifierOptions = Array.from(
                      { length: maxQualifiers },
                      (_, index) => index + 1
                    );
                    return (
                      <div
                        key={`${category.id}-${groupName}`}
                        onDragOver={(event) =>
                          handleGroupDragOver(event, category.id, groupName)
                        }
                        onDrop={(event) =>
                          handleGroupDrop(event, category.id, groupName)
                        }
                        className={`rounded-2xl border p-4 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.25)] transition ${
                          dragOverGroup === `${category.id}:${groupName}`
                            ? "border-indigo-300 bg-indigo-50/70"
                            : "border-slate-200/70 bg-white/90"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <h4 className="text-sm font-semibold text-slate-900">
                            Grupo {groupName}
                          </h4>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span>{groupRegistrations.length} inscritos</span>
                            {showQualifiers && (
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                  Clasifican
                                </span>
                                <select
                                  value={selectedQualifiers}
                                  onChange={(e) =>
                                    handleQualifiersChange(
                                      category.id,
                                      groupName,
                                      Number(e.target.value)
                                    )
                                  }
                                  disabled={updatingQualifiersKey === groupKey}
                                  className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-70"
                                >
                                  {qualifierOptions.map((value) => (
                                    <option key={value} value={value}>
                                      {value}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200/70">
                          <table className="min-w-[520px] divide-y divide-slate-200/70 text-xs">
                          <thead className="bg-slate-50/80 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                            <tr>
                              <th className="px-3 py-2 text-left font-semibold">
                                #
                              </th>
                              <th className="px-3 py-2 text-left font-semibold">
                                Ranking
                              </th>
                              <th className="px-3 py-2 text-left font-semibold">
                                Equipo
                              </th>
                              <th className="px-3 py-2 text-left font-semibold">
                                Mover
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {sortRegistrations(groupRegistrations).map(
                              (registration, index) => {
                                const rankingValue =
                                  registration.seed ?? registration.rankingNumber;
                                const isDragging = draggingId === registration.id;
                                const isUpdating =
                                  updatingGroupId === registration.id;
                                return (
                              <tr key={registration.id}>
                                <td className="px-3 py-2 text-slate-500">
                                  {index + 1}
                                </td>
                                <td className="px-3 py-2 text-slate-600">
                                  {rankingValue ?? "-"}
                                </td>
                                <td className="px-3 py-2 font-semibold text-slate-900">
                                  {formatTeamName(registration)}
                                </td>
                                <td className="px-3 py-2">
                                  <button
                                    type="button"
                                    draggable
                                    onDragStart={(event) =>
                                      handleDragStart(
                                        event,
                                        registration,
                                        category.id
                                      )
                                    }
                                    onDragEnd={handleDragEnd}
                                    aria-label="Mover"
                                    className={`rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 shadow-sm transition hover:bg-slate-50 ${
                                      isDragging ? "opacity-60" : ""
                                    }`}
                                  >
                                    ...
                                  </button>
                                </td>
                              </tr>
                                );
                              }
                            )}
                          </tbody>
                        </table>
                      </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.25)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">
                      Fixture por rondas
                    </h4>
                    <p className="text-xs text-slate-500">
                      Rondas generadas automaticamente por grupo.
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600">
                    Rondas
                  </span>
                </div>
                {(() => {
                  const categoryMatches =
                    matchesByCategory.get(category.id) ?? [];
                  if (categoryMatches.length === 0) {
                    return (
                      <p className="mt-3 text-sm text-slate-500">
                        Todavia no hay fixture generado.
                      </p>
                    );
                  }

                  const matchesByGroup = new Map<string, Match[]>();
                  categoryMatches.forEach((match) => {
                    const groupKey = getGroupKey(match.groupName);
                    if (!matchesByGroup.has(groupKey)) {
                      matchesByGroup.set(groupKey, []);
                    }
                    matchesByGroup.get(groupKey)?.push(match);
                  });

                  const groupEntriesSorted = Array.from(
                    matchesByGroup.entries()
                  ).sort((a, b) => a[0].localeCompare(b[0]));

                  return (
                    <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {groupEntriesSorted.map(([groupName, groupMatches]) => {
                        const roundsMap = new Map<number, Match[]>();
                        groupMatches.forEach((match) => {
                          const round = match.roundNumber ?? 0;
                          if (!roundsMap.has(round)) {
                            roundsMap.set(round, []);
                          }
                          roundsMap.get(round)?.push(match);
                        });
                        const rounds = Array.from(roundsMap.entries()).sort(
                          (a, b) => a[0] - b[0]
                        );

                        return (
                          <div
                            key={`${category.id}-fixture-${groupName}`}
                            className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.25)]"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <h5 className="text-sm font-semibold text-slate-900">
                                Grupo {groupName}
                              </h5>
                              <span className="text-xs text-slate-500">
                                {groupMatches.length} partidos
                              </span>
                            </div>
                            <div className="mt-3 space-y-3">
                              {rounds.map(([roundNumber, roundMatches]) => (
                                <div
                                  key={`${category.id}-${groupName}-round-${roundNumber}`}
                                  className="rounded-xl border border-slate-200/70 bg-slate-50/70 p-3"
                                >
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                                    {roundNumber > 0
                                      ? `Ronda ${roundNumber}`
                                      : "Sin ronda"}
                                  </p>
                                  <div className="mt-2 space-y-1 text-sm text-slate-700">
                                    {roundMatches.map((match) => {
                                      const teamA = registrations.find(
                                        (item) => item.id === match.teamAId
                                      );
                                      const teamB = registrations.find(
                                        (item) => item.id === match.teamBId
                                      );
                                      return (
                                        <p key={match.id} className="font-semibold">
                                          {formatTeamName(teamA)}{" "}
                                          <span className="text-slate-400">
                                            vs
                                          </span>{" "}
                                          {formatTeamName(teamB)}
                                        </p>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          );
        })
      )}

      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6">
          <div className="w-full max-w-lg rounded-3xl border border-white/60 bg-white/95 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                  Pago del torneo
                </p>
                <h3 className="text-xl font-semibold text-slate-900">
                  {tournamentName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600"
              >
                Cerrar
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-sm text-slate-600">Jugadores inscritos</p>
                <p className="text-2xl font-semibold text-slate-900">
                  {totalPlayers}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-sm text-slate-600">Monto por jugador</p>
                <p className="text-2xl font-semibold text-slate-900">
                  {paymentRateValue.toFixed(2)} Bs
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/80 p-4">
                <p className="text-sm text-emerald-700">Total a pagar</p>
                <p className="text-2xl font-semibold text-emerald-900">
                  {paymentTotal.toFixed(2)} Bs
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-sm text-slate-600">Pagado</p>
                  <p className="text-2xl font-semibold text-slate-900">
                    {paymentPaidValue.toFixed(2)} Bs
                  </p>
                </div>
                <div
                  className={`rounded-2xl border p-4 ${
                    paymentComplete
                      ? "border-emerald-200/80 bg-emerald-50/80"
                      : "border-amber-200/80 bg-amber-50/80"
                  }`}
                >
                  <p
                    className={`text-sm ${
                      paymentComplete ? "text-emerald-700" : "text-amber-700"
                    }`}
                  >
                    Saldo pendiente
                  </p>
                  <p
                    className={`text-2xl font-semibold ${
                      paymentComplete ? "text-emerald-900" : "text-amber-900"
                    }`}
                  >
                    {paymentPending.toFixed(2)} Bs
                  </p>
                </div>
              </div>
              {sessionRole === "ADMIN" && (
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">
                      Registrar pago
                    </label>
                    <input
                      value={paymentPaidDeltaInput}
                      onChange={(event) => setPaymentPaidDeltaInput(event.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      placeholder="Ej. 50.00"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleRegisterPayment}
                    disabled={!canRegisterPayment || savingPaymentPaid}
                    className="h-[42px] self-end rounded-full bg-indigo-600 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {savingPaymentPaid ? "Registrando..." : "Agregar pago"}
                  </button>
                </div>
              )}
              {sessionRole === "ADMIN" && paymentReportedAmount && (
                <div className="rounded-2xl border border-amber-200/80 bg-amber-50/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">
                    Reporte pendiente
                  </p>
                  <div className="mt-2 grid gap-2 text-xs text-amber-900 sm:grid-cols-2">
                    <div>
                      <span className="font-semibold">Monto:</span>{" "}
                      {paymentReportedAmount} Bs
                    </div>
                    <div>
                      <span className="font-semibold">Reportado:</span>{" "}
                      {paymentReportedAt
                        ? new Date(paymentReportedAt).toISOString().split("T")[0]
                        : "N/D"}
                    </div>
                    {paymentReportedBy && (
                      <div className="sm:col-span-2">
                        <span className="font-semibold">Usuario:</span>{" "}
                        {paymentReportedBy.name ?? paymentReportedBy.email}
                      </div>
                    )}
                    {paymentReportedNote && (
                      <div className="sm:col-span-2">
                        <span className="font-semibold">Nota:</span>{" "}
                        {paymentReportedNote}
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={approvePaymentReport}
                      disabled={reviewingPaymentReport}
                      className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      Aprobar reporte
                    </button>
                    <button
                      type="button"
                      onClick={rejectPaymentReport}
                      disabled={reviewingPaymentReport}
                      className="rounded-full border border-amber-300 bg-white px-4 py-1.5 text-xs font-semibold text-amber-700 shadow-sm transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      Rechazar
                    </button>
                  </div>
                </div>
              )}
              {sessionRole !== "ADMIN" && (
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Reportar pago
                  </p>
                  <div className="mt-3 grid gap-3">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-slate-700">
                        Monto pagado
                      </label>
                      <input
                        value={paymentReportedAmountInput}
                        onChange={(event) =>
                          setPaymentReportedAmountInput(event.target.value)
                        }
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        placeholder="Ej. 50.00"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-slate-700">
                        Nota (opcional)
                      </label>
                      <input
                        value={paymentReportedNoteInput}
                        onChange={(event) =>
                          setPaymentReportedNoteInput(event.target.value)
                        }
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        placeholder="Ej. Transferencia del 03/02"
                      />
                    </div>
                    {paymentReportedAmount && (
                      <p className="text-xs text-amber-700">
                        Ya existe un reporte pendiente. Si actualizas, se
                        reemplazara el monto reportado.
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={handlePaymentReported}
                      disabled={!canReportPayment || savingPaymentReport}
                      className="rounded-full bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {savingPaymentReport
                        ? "Reportando..."
                        : paymentReportedAmount
                          ? "Actualizar reporte"
                          : "Reportar pago"}
                    </button>
                  </div>
                </div>
              )}
              <p className="text-xs text-slate-500">
                Si agregas o eliminas jugadores luego, el saldo pendiente se
                recalculara automaticamente.
              </p>
              {paymentQrUrl && (
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-sm text-slate-600">QR de pago</p>
                  <div className="mt-3 flex h-40 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50">
                    <img
                      src={paymentQrUrl}
                      alt="QR de pago"
                      className="max-h-36 object-contain"
                    />
                  </div>
                </div>
              )}
              {sessionRole !== "ADMIN" && (
                <p className="text-xs text-amber-600">
                  Envia el Comprobante de Pago al Numero de Whatsapp{" "}
                  <a
                    href="https://wa.me/59160021284"
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-amber-700 underline underline-offset-2"
                  >
                    +59160021284
                  </a>
                  .
                </p>
              )}
            </div>
            <div className="mt-6 flex items-center justify-end gap-2">
              {sessionRole === "ADMIN" && (
                <button
                  type="button"
                  onClick={handleFinalizePayment}
                  disabled={updatingStatus || !paymentComplete}
                  className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {updatingStatus ? "Activando..." : "Pago finalizado"}
                </button>
              )}
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
    </div>
  );
}

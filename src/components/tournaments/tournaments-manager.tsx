"use client";

import TournamentDraws from "@/components/tournaments/tournament-draws";
import TournamentFixture from "@/components/tournaments/tournament-fixture";
import TournamentPlayoffs from "@/components/tournaments/tournament-playoffs";
import TournamentSchedule from "@/components/tournaments/tournament-schedule";
import TournamentScores from "@/components/tournaments/tournament-scores";
import TournamentFinalStandings from "@/components/tournaments/tournament-final-standings";
import TournamentPrizes from "@/components/tournaments/tournament-prizes";
import TournamentRegistrations from "@/components/tournaments/tournament-registrations";
import { useEffect, useMemo, useRef, useState } from "react";
import "quill/dist/quill.snow.css";
import { useSearchParams } from "next/navigation";

type League = {
  id: string;
  name: string;
};

type Sport = {
  id: string;
  name: string;
};

type CategoryModality = "SINGLES" | "DOUBLES";
type CategoryGender = "MALE" | "FEMALE" | "MIXED";

type Category = {
  id: string;
  name: string;
  abbreviation: string;
  modality?: CategoryModality | null;
  gender?: CategoryGender | null;
  sport?: { id: string; name: string } | null;
};

type TournamentCategory = {
  categoryId: string;
  category: Category;
  price: string | number;
  secondaryPrice: string | number;
  siblingPrice: string | number;
};

const isRulesEmpty = (value: string | null) => {
  if (!value) return true;
  const text = value
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
  return text.length === 0;
};

type TournamentClub = {
  id: string;
  name: string;
  address: string | null;
  courtsCount?: number | null;
};

type TournamentSponsor = {
  id?: string;
  name?: string | null;
  imageUrl: string;
  linkUrl?: string | null;
  sortOrder?: number;
};

type Tournament = {
  id: string;
  name: string;
  sportId: string | null;
  address: string | null;
  photoUrl: string | null;
  rankingEnabled: boolean;
  status: "WAITING" | "ACTIVE" | "FINISHED";
  paymentRate: string;
  leagueId: string | null;
  league?: League | null;
  ownerId?: string | null;
  canEdit?: boolean;
  startDate: string | Date | null;
  endDate: string | Date | null;
  registrationDeadline: string | Date | null;
  rulesText: string | null;
  playDays: string[] | null;
  clubs: TournamentClub[];
  sponsors: TournamentSponsor[];
  categories: TournamentCategory[];
};

type ClubForm = {
  name: string;
  address: string;
  courtsCount: string;
};

type SponsorForm = {
  name: string;
  imageUrl: string;
  linkUrl: string;
};

type Props = {
  leagues: League[];
  sports: Sport[];
  categories: Category[];
  initialTournaments: Tournament[];
  isAdmin: boolean;
  currentUserId: string;
};

const createEmptyClub = (): ClubForm => ({ name: "", address: "", courtsCount: "1" });
const createEmptySponsor = (): SponsorForm => ({
  name: "",
  imageUrl: "",
  linkUrl: "",
});

const toISODate = (value: string | Date | null | undefined) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().split("T")[0];
};

const isDateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const normalizePlayDays = (value?: string[] | null) => {
  const dates = Array.isArray(value) ? value.filter((date) => isDateOnly(date)) : [];
  return dates.length ? dates : [""];
};

const parsePriceInput = (value?: string) => {
  if (!value) return null;
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizePriceInput = (value: string) => value.trim().replace(",", ".");

const formatPriceInput = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value.toString();
  if (typeof value === "string") return value;
  return "";
};

const parseCourtsCountInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return parsed;
};

const countRegistrationPlayers = (registration: {
  player?: unknown;
  partner?: unknown;
  partnerTwo?: unknown;
}) => {
  let count = 0;
  if (registration.player) count += 1;
  if (registration.partner) count += 1;
  if (registration.partnerTwo) count += 1;
  return count;
};

export default function TournamentsManager({
  leagues,
  sports,
  categories,
  initialTournaments,
  isAdmin,
  currentUserId,
}: Props) {
  const searchParams = useSearchParams();
  const [tournaments, setTournaments] = useState<Tournament[]>(initialTournaments);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activePermissionsTournamentId, setActivePermissionsTournamentId] =
    useState<string | null>(null);
  const [permissionEmail, setPermissionEmail] = useState("");
  const [permissionUsers, setPermissionUsers] = useState<
    { id: string; name: string | null; email: string }[]
  >([]);
  const [permissionLoading, setPermissionLoading] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [permissionMessage, setPermissionMessage] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<
    1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
  >(1);
  const [activeTournamentId, setActiveTournamentId] = useState<string | null>(null);
  const [activeTournamentName, setActiveTournamentName] = useState<string>("");
  const [activeTournamentStatus, setActiveTournamentStatus] = useState<
    "WAITING" | "ACTIVE" | "FINISHED"
  >("WAITING");
  const [roundRobinComplete, setRoundRobinComplete] = useState(false);
  const [stepNineUnlocked, setStepNineUnlocked] = useState(false);
  const [activePaymentRate, setActivePaymentRate] = useState("0");
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentRateInput, setPaymentRateInput] = useState("0");
  const [paymentCount, setPaymentCount] = useState(0);
  const [loadingPayment, setLoadingPayment] = useState(false);
  const [paymentQrUrl, setPaymentQrUrl] = useState<string | null>(null);
  const [paymentRates, setPaymentRates] = useState<Record<string, string>>({});
  const [statusEdits, setStatusEdits] = useState<
    Record<string, "WAITING" | "ACTIVE" | "FINISHED">
  >({});
  const [savingTournamentId, setSavingTournamentId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    sportId: sports[0]?.id ?? "",
    leagueId: leagues[0]?.id ?? "",
    rankingEnabled: true,
    address: "",
    photoUrl: "",
    startDate: "",
    endDate: "",
    registrationDeadline: "",
    rulesText: "",
    playDays: [""],
    clubs: [createEmptyClub()],
    sponsors: [] as SponsorForm[],
  });
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(new Set());
  const [categoryPrices, setCategoryPrices] = useState<Record<string, string>>({});
  const [categorySecondaryPrices, setCategorySecondaryPrices] = useState<
    Record<string, string>
  >({});
  const [categorySiblingPrices, setCategorySiblingPrices] = useState<
    Record<string, string>
  >({});
  const [noEndDate, setNoEndDate] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [uploadingSponsors, setUploadingSponsors] = useState<
    Record<number, boolean>
  >({});
  const [uploadingTournamentPhoto, setUploadingTournamentPhoto] = useState(false);
  const rulesEditorRef = useRef<HTMLDivElement | null>(null);
  const quillRef = useRef<any>(null);
  const lastRulesHtmlRef = useRef<string>("");
  const autoOpenedRef = useRef(false);

  const canEditTournament = (tournament: Tournament) =>
    tournament.canEdit !== undefined
      ? tournament.canEdit
      : isAdmin || tournament.ownerId === currentUserId;
  const canManagePermissions = (tournament: Tournament) =>
    isAdmin || tournament.ownerId === currentUserId;

  const handleSponsorUpload = async (index: number, file?: File | null) => {
    if (!file) return;
    setUploadingSponsors((prev) => ({ ...prev, [index]: true }));
    setError(null);
    setMessage(null);

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/uploads/sponsor-logo", {
      method: "POST",
      body: formData,
    });

    const data = await res.json().catch(() => ({}));
    setUploadingSponsors((prev) => ({ ...prev, [index]: false }));

    if (!res.ok) {
      setError(data?.error ?? "No se pudo subir el logo");
      return;
    }

    updateSponsorField(index, "imageUrl", data.url as string);
    setMessage("Logo subido");
  };

  const handleTournamentPhotoUpload = async (file?: File | null) => {
    if (!file) return;
    setUploadingTournamentPhoto(true);
    setError(null);
    setMessage(null);

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/uploads/tournament-photo", {
      method: "POST",
      body: formData,
    });

    const data = await res.json().catch(() => ({}));
    setUploadingTournamentPhoto(false);

    if (!res.ok) {
      setError(data?.error ?? "No se pudo subir la imagen");
      return;
    }

    setForm((prev) => ({ ...prev, photoUrl: data.url as string }));
    setMessage("Imagen subida");
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    let quillInstance: any;

    const setup = async () => {
      if (currentStep !== 1) return;
      if (!rulesEditorRef.current || quillRef.current) return;
      if (!rulesEditorRef.current.isConnected) return;
      const QuillModule = await import("quill");
      const Quill = QuillModule.default ?? QuillModule;
      const Font = Quill.import("formats/font");
      Font.whitelist = [
        "calibri",
        "arial",
        "times-new-roman",
        "georgia",
        "merriweather",
        "playfair-display",
        "cormorant-garamond",
        "source-serif",
        "serif",
        "sans-serif",
      ];
      Quill.register(Font, true);
      const SizeStyle = Quill.import("attributors/style/size");
      SizeStyle.whitelist = ["12px", "14px", "16px", "18px", "20px", "24px", "32px"];
      Quill.register(SizeStyle, true);

      const host = rulesEditorRef.current;
      if (!host) return;
      host.innerHTML = "";
      const container = document.createElement("div");
      host.appendChild(container);

      quillInstance = new Quill(container, {
        theme: "snow",
        placeholder: "Escribe las reglas del torneo...",
        modules: {
          toolbar: [
            [{ font: Font.whitelist }, { size: SizeStyle.whitelist }],
            ["bold", "italic", "underline", "strike"],
            [{ color: [] }, { background: [] }],
            [{ list: "ordered" }, { list: "bullet" }],
            [{ align: [] }],
            ["clean"],
          ],
          clipboard: {
            matchVisual: false,
          },
        },
      });

      quillInstance.on("text-change", () => {
        const html = quillInstance.root.innerHTML;
        const normalized = html === "<p><br></p>" ? "" : html;
        lastRulesHtmlRef.current = normalized;
        setForm((prev) => ({ ...prev, rulesText: normalized }));
      });

      quillRef.current = quillInstance;
      const initial = form.rulesText ?? "";
      lastRulesHtmlRef.current = initial;
      quillInstance.clipboard.dangerouslyPasteHTML(initial, "silent");
    };

    setup();

    return () => {
      if (quillInstance) {
        quillInstance.off("text-change");
      }
      if (rulesEditorRef.current) {
        rulesEditorRef.current.innerHTML = "";
      }
      quillRef.current = null;
    };
  }, [currentStep]);

  useEffect(() => {
    const quillInstance = quillRef.current;
    if (!quillInstance) return;
    const next = form.rulesText ?? "";
    if (next === lastRulesHtmlRef.current) return;
    lastRulesHtmlRef.current = next;
    quillInstance.clipboard.dangerouslyPasteHTML(next, "silent");
  }, [form.rulesText]);

  const canSubmit = useMemo(() => {
    if (!form.name.trim()) return false;
    if (!form.sportId) return false;
    if (form.rankingEnabled && !form.leagueId) return false;
    if (!form.startDate || !form.registrationDeadline) return false;
    if (!noEndDate && !form.endDate) return false;
    if (!noEndDate && form.endDate < form.startDate) return false;
    const validPlayDates = form.playDays.filter((date) => isDateOnly(date));
    if (validPlayDates.length === 0) return false;
    const hasOutOfRange = validPlayDates.some((date) => {
      if (date < form.startDate) return true;
      if (!noEndDate && form.endDate && date > form.endDate) return true;
      return false;
    });
    if (hasOutOfRange) return false;
    if (selectedCategoryIds.size === 0) return false;
    for (const categoryId of selectedCategoryIds) {
      const parsed = parsePriceInput(categoryPrices[categoryId]);
      if (parsed === null || parsed < 0) return false;
      const secondaryRaw = categorySecondaryPrices[categoryId] ?? "";
      if (secondaryRaw.trim().length > 0) {
        const parsedSecondary = parsePriceInput(secondaryRaw);
        if (parsedSecondary === null || parsedSecondary < 0) return false;
      }
      const siblingRaw = categorySiblingPrices[categoryId] ?? "";
      if (siblingRaw.trim().length > 0) {
        const parsedSibling = parsePriceInput(siblingRaw);
        if (parsedSibling === null || parsedSibling < 0) return false;
      }
    }
    const invalidSponsor = form.sponsors.some(
      (sponsor) => sponsor.imageUrl.trim().length === 0
    );
    if (invalidSponsor) return false;
    const validClubs = form.clubs.filter((club) => club.name.trim().length >= 2);
    if (validClubs.length === 0) return false;
    const hasInvalidCourts = validClubs.some(
      (club) => parseCourtsCountInput(club.courtsCount) === null
    );
    if (hasInvalidCourts) return false;
    return true;
  }, [
    form,
    noEndDate,
    selectedCategoryIds,
    categoryPrices,
    categorySecondaryPrices,
    categorySiblingPrices,
  ]);

  const resetForm = () => {
    setForm({
      name: "",
      sportId: sports[0]?.id ?? "",
      leagueId: leagues[0]?.id ?? "",
      rankingEnabled: true,
      address: "",
      photoUrl: "",
      startDate: "",
      endDate: "",
      registrationDeadline: "",
      rulesText: "",
      playDays: [""],
      clubs: [createEmptyClub()],
      sponsors: [],
    });
    setSelectedCategoryIds(new Set());
    setCategoryPrices({});
    setCategorySecondaryPrices({});
    setCategorySiblingPrices({});
    setNoEndDate(true);
    setEditingId(null);
    setActiveTournamentId(null);
    setActiveTournamentName("");
    setActiveTournamentStatus("WAITING");
    setActivePaymentRate("0");
    setCurrentStep(nextStep ?? 1);
  };

  useEffect(() => {
    if (autoOpenedRef.current) return;
    const openId = searchParams.get("open");
    if (!openId) return;
    const selected = tournaments.find((item) => item.id === openId);
    if (!selected) return;
    autoOpenedRef.current = true;
    const preferredStep = selected.status === "WAITING" ? 1 : 6;
    startEditing(selected, preferredStep);
  }, [searchParams, tournaments]);

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
        sponsors: Array.isArray(tournament.sponsors) ? tournament.sponsors : [],
      }));
      setTournaments(normalized);
      if (activeTournamentId) {
        const updated = normalized.find(
          (item: Tournament) => item.id === activeTournamentId
        );
        if (updated?.status) {
          setActiveTournamentStatus(updated.status);
        }
        if (updated?.paymentRate !== undefined) {
          setActivePaymentRate(String(updated.paymentRate));
        }
      }
    }
  };

  const syncActiveStatus = async () => {
    if (!activeTournamentId) return;
    const res = await fetch("/api/tournaments", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(data.tournaments)) {
      const updated = data.tournaments.find(
        (item: Tournament) => item.id === activeTournamentId
      );
      if (updated?.status) {
        setActiveTournamentStatus(updated.status);
      }
      if (updated?.paymentRate !== undefined) {
        setActivePaymentRate(String(updated.paymentRate));
      }
    }
  };

  const normalizeMoneyInput = (value: string) => value.trim().replace(",", ".");

  const saveAdminTournament = async (tournament: Tournament) => {
    if (!isAdmin) return;
    const nextRate = paymentRates[tournament.id] ?? tournament.paymentRate ?? "0";
    const nextStatus = statusEdits[tournament.id] ?? tournament.status;
    const rateChanged = String(tournament.paymentRate) !== String(nextRate);
    const statusChanged = tournament.status !== nextStatus;
    if (!rateChanged && !statusChanged) return;
    setSavingTournamentId(tournament.id);
    setError(null);
    setMessage(null);
    try {
      if (rateChanged) {
        const rateRes = await fetch(
          `/api/tournaments/${tournament.id}/payment`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ paymentRate: normalizeMoneyInput(nextRate) }),
          }
        );
        const rateData = await rateRes.json().catch(() => ({}));
        if (!rateRes.ok) {
          const detail = rateData?.detail ? ` (${rateData.detail})` : "";
          throw new Error(
            `${rateData?.error ?? "No se pudo actualizar el monto"}${detail}`
          );
        }
      }
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
      setSavingTournamentId(null);
    }
  };

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

  const updateSponsorField = (
    index: number,
    field: keyof SponsorForm,
    value: string
  ) => {
    setForm((prev) => {
      const sponsors = [...prev.sponsors];
      sponsors[index] = { ...sponsors[index], [field]: value };
      return { ...prev, sponsors };
    });
  };

  const addSponsor = () => {
    setForm((prev) => {
      if (prev.sponsors.length >= 13) return prev;
      return { ...prev, sponsors: [...prev.sponsors, createEmptySponsor()] };
    });
  };

  const removeSponsor = (index: number) => {
    setForm((prev) => {
      const sponsors = prev.sponsors.filter((_, idx) => idx !== index);
      return { ...prev, sponsors };
    });
  };

  const addPlayDate = () => {
    setForm((prev) => ({ ...prev, playDays: [...prev.playDays, ""] }));
  };

  const handleSportChange = (sportId: string) => {
    setForm((prev) => ({ ...prev, sportId }));
    setSelectedCategoryIds(new Set());
    setCategoryPrices({});
    setCategorySecondaryPrices({});
    setCategorySiblingPrices({});
  };

  const updatePlayDate = (index: number, value: string) => {
    setForm((prev) => {
      const playDays = [...prev.playDays];
      playDays[index] = value;
      return { ...prev, playDays };
    });
  };

  const removePlayDate = (index: number) => {
    setForm((prev) => {
      const playDays = prev.playDays.filter((_, idx) => idx !== index);
      return { ...prev, playDays: playDays.length ? playDays : [""] };
    });
  };

  const toggleCategory = (categoryId: string) => {
    const wasSelected = selectedCategoryIds.has(categoryId);
    setSelectedCategoryIds((prev) => {
      const next = new Set(prev);
      if (wasSelected) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
    setCategoryPrices((prev) => {
      const next = { ...prev };
      if (wasSelected) {
        delete next[categoryId];
      } else if (next[categoryId] === undefined) {
        next[categoryId] = "";
      }
      return next;
    });
    setCategorySecondaryPrices((prev) => {
      const next = { ...prev };
      if (wasSelected) {
        delete next[categoryId];
      } else if (next[categoryId] === undefined) {
        next[categoryId] = "";
      }
      return next;
    });
    setCategorySiblingPrices((prev) => {
      const next = { ...prev };
      if (wasSelected) {
        delete next[categoryId];
      } else if (next[categoryId] === undefined) {
        next[categoryId] = "";
      }
      return next;
    });
  };

  const updateCategoryPrice = (categoryId: string, value: string) => {
    setCategoryPrices((prev) => ({ ...prev, [categoryId]: value }));
    setCategorySecondaryPrices((prev) => {
      const current = prev[categoryId];
      if (current === undefined || current.trim() === "") {
        return { ...prev, [categoryId]: value };
      }
      return prev;
    });
    setCategorySiblingPrices((prev) => {
      const current = prev[categoryId];
      if (current === undefined || current.trim() === "") {
        return { ...prev, [categoryId]: value };
      }
      return prev;
    });
  };

  const updateCategorySecondaryPrice = (categoryId: string, value: string) => {
    setCategorySecondaryPrices((prev) => ({ ...prev, [categoryId]: value }));
  };

  const updateCategorySiblingPrice = (categoryId: string, value: string) => {
    setCategorySiblingPrices((prev) => ({ ...prev, [categoryId]: value }));
  };

  const startEditing = (
    tournament: Tournament,
    nextStep?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
  ) => {
    if (!canEditTournament(tournament)) {
      setError("No tienes permiso para editar este torneo");
      return;
    }
    const fallbackSportId =
      tournament.sportId ??
      tournament.categories[0]?.category?.sport?.id ??
      sports[0]?.id ??
      "";
    const validTournamentCategories = tournament.categories.filter(
      (item) => (item.category?.sport?.id ?? "") === fallbackSportId
    );
    setEditingId(tournament.id);
    setActiveTournamentId(tournament.id);
    setActiveTournamentName(tournament.name);
    setActiveTournamentStatus(tournament.status ?? "WAITING");
    setActivePaymentRate(tournament.paymentRate ?? "0");
    setCurrentStep(nextStep ?? 1);
    setForm({
      name: tournament.name,
      sportId: fallbackSportId,
      leagueId: tournament.leagueId ?? "",
      rankingEnabled: tournament.rankingEnabled ?? true,
      address: tournament.address ?? "",
      photoUrl: tournament.photoUrl ?? "",
      startDate: toISODate(tournament.startDate),
      endDate: toISODate(tournament.endDate),
      registrationDeadline: toISODate(tournament.registrationDeadline),
      rulesText: tournament.rulesText ?? "",
      playDays: normalizePlayDays(tournament.playDays),
      clubs: tournament.clubs.length
        ? tournament.clubs.map((club) => ({
            name: club.name,
            address: club.address ?? "",
            courtsCount:
              typeof club.courtsCount === "number" && Number.isFinite(club.courtsCount)
                ? String(club.courtsCount)
                : "1",
          }))
        : [createEmptyClub()],
      sponsors: tournament.sponsors?.length
        ? tournament.sponsors.map((sponsor) => ({
            name: sponsor.name ?? "",
            imageUrl: sponsor.imageUrl ?? "",
            linkUrl: sponsor.linkUrl ?? "",
          }))
        : [],
    });
    setSelectedCategoryIds(new Set(validTournamentCategories.map((item) => item.categoryId)));
    setCategoryPrices(() => {
      const prices: Record<string, string> = {};
      for (const item of validTournamentCategories) {
        prices[item.categoryId] = formatPriceInput(item.price);
      }
      return prices;
    });
    setCategorySecondaryPrices(() => {
      const prices: Record<string, string> = {};
      for (const item of validTournamentCategories) {
        prices[item.categoryId] = formatPriceInput(item.secondaryPrice);
      }
      return prices;
    });
    setCategorySiblingPrices(() => {
      const prices: Record<string, string> = {};
      for (const item of validTournamentCategories) {
        prices[item.categoryId] = formatPriceInput(item.siblingPrice);
      }
      return prices;
    });
    setNoEndDate(!tournament.endDate);
    setError(null);
    setMessage("Editando torneo");
  };

  const handleDelete = async (tournament: Tournament) => {
    if (!canEditTournament(tournament)) {
      setError("No tienes permiso para eliminar este torneo");
      return;
    }
    const confirmed = window.confirm(
      `Eliminar el torneo "${tournament.name}"? Esta accion no se puede deshacer.`
    );
    if (!confirmed) return;

    setLoading(true);
    setError(null);
    setMessage(null);

    const res = await fetch(`/api/tournaments/${tournament.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      const detail = data?.detail ? ` (${data.detail})` : "";
      setError(`${data?.error ?? "No se pudo eliminar el torneo"}${detail}`);
      return;
    }

    if (editingId === tournament.id || activeTournamentId === tournament.id) {
      resetForm();
    }
    await refreshTournaments();
    setMessage("Torneo eliminado");
  };

  const fetchPermissions = async (tournamentId: string) => {
    setPermissionLoading(true);
    setPermissionError(null);
    setPermissionMessage(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/permissions`, {
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

  const openPermissions = async (tournamentId: string) => {
    setActivePermissionsTournamentId(tournamentId);
    setPermissionEmail("");
    await fetchPermissions(tournamentId);
  };

  const closePermissions = () => {
    setActivePermissionsTournamentId(null);
    setPermissionEmail("");
    setPermissionUsers([]);
    setPermissionError(null);
    setPermissionMessage(null);
  };

  const handleGrantPermission = async (tournamentId: string) => {
    if (!permissionEmail.trim()) {
      setPermissionError("Ingresa el correo del usuario");
      return;
    }
    setPermissionLoading(true);
    setPermissionError(null);
    setPermissionMessage(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/permissions`, {
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
    await fetchPermissions(tournamentId);
  };

  const handleRevokePermission = async (tournamentId: string, userId: string) => {
    setPermissionLoading(true);
    setPermissionError(null);
    setPermissionMessage(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/permissions`, {
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
    await fetchPermissions(tournamentId);
  };

  const saveTournament = async () => {
    const isEditing = Boolean(editingId);
    setError(null);
    setMessage(null);
    setLoading(true);

    const normalizedPlayDays = form.playDays.filter((date) => isDateOnly(date));

    const payload = {
      name: form.name,
      sportId: form.sportId,
      leagueId: form.leagueId,
      rankingEnabled: form.rankingEnabled,
      address: form.address || null,
      photoUrl: form.photoUrl || null,
      startDate: form.startDate,
      endDate: noEndDate ? null : form.endDate || null,
      registrationDeadline: form.registrationDeadline,
      rulesText: form.rulesText || null,
      playDays: normalizedPlayDays,
      categoryEntries: Array.from(selectedCategoryIds).map((categoryId) => ({
        categoryId,
        price: normalizePriceInput(categoryPrices[categoryId] ?? ""),
        secondaryPrice: normalizePriceInput(categorySecondaryPrices[categoryId] ?? ""),
        siblingPrice: normalizePriceInput(categorySiblingPrices[categoryId] ?? ""),
      })),
      clubs: form.clubs.map((club) => ({
        name: club.name,
        address: club.address || null,
        courtsCount: parseCourtsCountInput(club.courtsCount) ?? 1,
      })),
      sponsors: form.sponsors
        .filter((sponsor) => sponsor.imageUrl.trim().length > 0)
        .map((sponsor) => ({
          name: sponsor.name || null,
          imageUrl: sponsor.imageUrl.trim(),
          linkUrl: sponsor.linkUrl || null,
        })),
    };

    const endpoint = isEditing ? `/api/tournaments/${editingId}` : "/api/tournaments";
    const method = isEditing ? "PATCH" : "POST";

    const res = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      const detail = data?.detail ? ` (${data.detail})` : "";
      const fallback = isEditing
        ? "No se pudo actualizar el torneo"
        : "No se pudo crear el torneo";
      setError(`${data?.error ?? fallback}${detail}`);
      return null;
    }

    const savedTournament = data?.tournament ?? null;
    const savedId = savedTournament?.id ?? editingId ?? null;
    if (savedId) {
      setEditingId(savedId);
      setActiveTournamentId(savedId);
      setActiveTournamentName(savedTournament?.name ?? form.name);
      if (savedTournament?.status) {
        setActiveTournamentStatus(savedTournament.status);
      }
      if (savedTournament?.paymentRate !== undefined) {
        setActivePaymentRate(String(savedTournament.paymentRate));
      }
    }

    await refreshTournaments();
    setMessage(isEditing ? "Torneo actualizado" : "Torneo creado");
    return savedId ? { id: savedId, name: savedTournament?.name ?? form.name } : null;
  };

  const handleNext = async () => {
    const saved = await saveTournament();
    if (!saved) return;
    setCurrentStep(2);
  };

  const sortedTournaments = useMemo(
    () => [...tournaments].sort((a, b) => a.name.localeCompare(b.name)),
    [tournaments]
  );

  const filteredCategories = useMemo(() => {
    if (!form.sportId) return [];
    return categories.filter((category) => category.sport?.id === form.sportId);
  }, [categories, form.sportId]);

  const selectedCategories = useMemo(
    () => filteredCategories.filter((category) => selectedCategoryIds.has(category.id)),
    [filteredCategories, selectedCategoryIds]
  );

  const registrationCategories = useMemo(
    () =>
      selectedCategories.map((category) => ({
        ...category,
        price: categoryPrices[category.id] ?? "0.00",
        secondaryPrice: categorySecondaryPrices[category.id] ?? "",
        siblingPrice: categorySiblingPrices[category.id] ?? "",
      })),
    [selectedCategories, categoryPrices, categorySecondaryPrices, categorySiblingPrices]
  );
  const rulesEmpty = isRulesEmpty(form.rulesText);

  const stepTwoEnabled = Boolean(activeTournamentId);
  const stepThreeEnabled = Boolean(activeTournamentId);
  const stepFourEnabled = Boolean(activeTournamentId);
  const stepFiveEnabled = Boolean(activeTournamentId);
  const canContinueAfterPayment =
    activeTournamentStatus === "ACTIVE" || activeTournamentStatus === "FINISHED";
  const stepSixEnabled = Boolean(activeTournamentId) && canContinueAfterPayment;
  const stepSevenEnabled = Boolean(activeTournamentId) && canContinueAfterPayment;
  const stepEightEnabled = Boolean(activeTournamentId) && canContinueAfterPayment;
  const stepNineEnabled =
    Boolean(activeTournamentId) &&
    (activeTournamentStatus === "FINISHED" || stepNineUnlocked);

  const updateTournamentStatus = async (
    status: "WAITING" | "ACTIVE" | "FINISHED"
  ) => {
    if (!activeTournamentId) return;
    setError(null);
    setMessage(null);
    const res = await fetch(`/api/tournaments/${activeTournamentId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ status }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = data?.detail ? ` (${data.detail})` : "";
      setError(`${data?.error ?? "No se pudo actualizar el estado"}${detail}`);
      return;
    }
    const nextStatus = data?.tournament?.status ?? status;
    setActiveTournamentStatus(nextStatus);
    if (nextStatus === "FINISHED") {
      setStepNineUnlocked(true);
    }
    await refreshTournaments();
    setMessage("Estado actualizado");
  };

  const openPaymentModal = async () => {
    if (!activeTournamentId) return;
    setLoadingPayment(true);
    setError(null);
    setMessage(null);
    await syncActiveStatus();
    const [registrationsRes, settingsRes] = await Promise.all([
      fetch(`/api/tournaments/${activeTournamentId}/registrations`, {
        cache: "no-store",
      }),
      fetch(`/api/settings/payment-rate`, { cache: "no-store" }),
    ]);
    const data = await registrationsRes.json().catch(() => ({}));
    const settingsData = await settingsRes.json().catch(() => ({}));
    setLoadingPayment(false);
    if (settingsRes.ok) {
      setPaymentQrUrl(
        typeof settingsData.paymentQrUrl === "string" &&
          settingsData.paymentQrUrl.trim().length > 0
          ? settingsData.paymentQrUrl
          : null
      );
    }
    if (!registrationsRes.ok) {
      const detail = data?.detail ? ` (${data.detail})` : "";
      setError(`${data?.error ?? "No se pudo cargar las inscripciones"}${detail}`);
      return;
    }
    const count = Array.isArray(data.registrations)
      ? data.registrations.reduce(
          (sum: number, registration: { player?: unknown; partner?: unknown; partnerTwo?: unknown }) =>
            sum + countRegistrationPlayers(registration),
          0
        )
      : 0;
    setPaymentCount(count);
    setPaymentRateInput(activePaymentRate || "0");
    setShowPaymentModal(true);
  };

  useEffect(() => {
    if (!activeTournamentId) return;
    setStepNineUnlocked(false);
    syncActiveStatus();
  }, [activeTournamentId]);

  const handlePaymentReported = () => {
    setShowPaymentModal(false);
    setMessage("Pago reportado. Un administrador debe activar el torneo.");
  };

  const savePaymentRate = async () => {
    if (!activeTournamentId) return;
    setLoadingPayment(true);
    setError(null);
    setMessage(null);
    const res = await fetch(
      `/api/tournaments/${activeTournamentId}/payment`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ paymentRate: paymentRateInput }),
      }
    );
    const data = await res.json().catch(() => ({}));
    setLoadingPayment(false);
    if (!res.ok) {
      const detail = data?.detail ? ` (${data.detail})` : "";
      setError(`${data?.error ?? "No se pudo actualizar el monto"}${detail}`);
      return;
    }
    const nextRate = data?.tournament?.paymentRate ?? paymentRateInput;
    setActivePaymentRate(String(nextRate));
    setPaymentRateInput(String(nextRate));
    await refreshTournaments();
    setMessage("Monto actualizado");
  };

  return (
    <div className="space-y-8">
      <div className="admin-fade-up relative overflow-hidden rounded-[24px] border border-white/70 bg-white/80 p-4 shadow-[0_18px_50px_-40px_rgba(15,23,42,0.3)] ring-1 ring-slate-200/70 backdrop-blur">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-indigo-300/70 via-sky-300/60 to-amber-200/70" />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentStep(1)}
            className={`rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] transition ${
              currentStep === 1
                ? "bg-slate-900 text-white shadow-[0_12px_30px_-18px_rgba(15,23,42,0.45)]"
                : "border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            Paso 1 - Configuracion
          </button>
          <button
            type="button"
            onClick={() => setCurrentStep(2)}
            disabled={!stepTwoEnabled}
            className={`rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] transition ${
              stepTwoEnabled
                ? currentStep === 2
                  ? "bg-slate-900 text-white shadow-[0_12px_30px_-18px_rgba(15,23,42,0.45)]"
                  : "border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                : "cursor-not-allowed border border-slate-200 text-slate-400"
            }`}
          >
            Paso 2 - Inscripcion
          </button>
          <button
            type="button"
            onClick={() => setCurrentStep(3)}
            disabled={!stepThreeEnabled}
            className={`rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] transition ${
              stepThreeEnabled
                ? currentStep === 3
                  ? "bg-slate-900 text-white shadow-[0_12px_30px_-18px_rgba(15,23,42,0.45)]"
                  : "border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                : "cursor-not-allowed border border-slate-200 text-slate-400"
            }`}
          >
            Paso 3 - Premios
          </button>
          <button
            type="button"
            onClick={() => setCurrentStep(4)}
            disabled={!stepFourEnabled}
            className={`rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] transition ${
              stepFourEnabled
                ? currentStep === 4
                  ? "bg-slate-900 text-white shadow-[0_12px_30px_-18px_rgba(15,23,42,0.45)]"
                  : "border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                : "cursor-not-allowed border border-slate-200 text-slate-400"
            }`}
          >
            Paso 4 - Sorteo
          </button>
          <button
            type="button"
            onClick={() => setCurrentStep(5)}
            disabled={!stepFiveEnabled}
            className={`rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] transition ${
              stepFiveEnabled
                ? currentStep === 5
                  ? "bg-slate-900 text-white shadow-[0_12px_30px_-18px_rgba(15,23,42,0.45)]"
                  : "border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                : "cursor-not-allowed border border-slate-200 text-slate-400"
            }`}
          >
            Paso 5 - Sembrado de grupo
          </button>
          <button
            type="button"
            onClick={() => setCurrentStep(6)}
            disabled={!stepSixEnabled}
            className={`rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] transition ${
              stepSixEnabled
                ? currentStep === 6
                  ? "bg-slate-900 text-white shadow-[0_12px_30px_-18px_rgba(15,23,42,0.45)]"
                  : "border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                : "cursor-not-allowed border border-slate-200 text-slate-400"
            }`}
          >
            Paso 6 - Calendario
          </button>
          <button
            type="button"
            onClick={() => setCurrentStep(7)}
            disabled={!stepSevenEnabled}
            className={`rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] transition ${
              stepSevenEnabled
                ? currentStep === 7
                  ? "bg-slate-900 text-white shadow-[0_12px_30px_-18px_rgba(15,23,42,0.45)]"
                  : "border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                : "cursor-not-allowed border border-slate-200 text-slate-400"
            }`}
          >
            Paso 7 - Posiciones
          </button>
          <button
            type="button"
            onClick={() => setCurrentStep(8)}
            disabled={!stepEightEnabled}
            className={`rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] transition ${
              stepEightEnabled
                ? currentStep === 8
                  ? "bg-slate-900 text-white shadow-[0_12px_30px_-18px_rgba(15,23,42,0.45)]"
                  : "border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                : "cursor-not-allowed border border-slate-200 text-slate-400"
            }`}
          >
            Paso 8 - Playoff
          </button>
          <button
            type="button"
            onClick={() => setCurrentStep(9)}
            disabled={!stepNineEnabled}
            className={`rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] transition ${
              stepNineEnabled
                ? currentStep === 9
                  ? "bg-slate-900 text-white shadow-[0_12px_30px_-18px_rgba(15,23,42,0.45)]"
                  : "border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                : "cursor-not-allowed border border-slate-200 text-slate-400"
            }`}
          >
            Paso 9 - Posiciones generales
          </button>
        </div>
        {stepTwoEnabled ? (
          <p className="mt-2 text-xs text-slate-500">
            Torneo activo: {activeTournamentName || form.name}
          </p>
        ) : (
          <p className="mt-2 text-xs text-slate-500">
            Guarda el torneo para habilitar la inscripcion.
          </p>
        )}
      </div>

      {currentStep === 1 ? (
        <>
      <div className="admin-fade-up relative overflow-hidden rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-[0_24px_70px_-50px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/70 backdrop-blur">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-indigo-300/70 via-sky-300/60 to-amber-200/70" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-500">
              Paso 1
            </p>
            <h2 className="text-2xl font-semibold text-slate-900">
              {editingId ? "Editar torneo" : "Crear torneo"}
            </h2>
            <p className="text-sm text-slate-600">
              Completa los datos del torneo en un solo formulario.
            </p>
          </div>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-white"
            >
              Cancelar edicion
            </button>
          )}
        </div>

        <div className="mt-6 space-y-8">
          <div className="grid gap-4 md:grid-cols-2">
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
              <label className="text-sm font-medium text-slate-700">Deporte</label>
              <select
                value={form.sportId}
                onChange={(e) => handleSportChange(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                <option value="">Selecciona deporte</option>
                {sports.map((sport) => (
                  <option key={sport.id} value={sport.id}>
                    {sport.name}
                  </option>
                ))}
              </select>
              {sports.length === 0 && (
                <p className="text-xs text-slate-500">
                  Primero crea un deporte para poder continuar.
                </p>
              )}
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
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-slate-700">
                Imagen del torneo (opcional)
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  value={form.photoUrl}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, photoUrl: e.target.value }))
                  }
                  className="min-w-[240px] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="https://... o /uploads/..."
                />
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300">
                  {uploadingTournamentPhoto ? "Subiendo..." : "Subir foto"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingTournamentPhoto}
                    onChange={(event) =>
                      handleTournamentPhotoUpload(event.target.files?.[0] ?? null)
                    }
                  />
                </label>
                {form.photoUrl && (
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, photoUrl: "" }))}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300"
                  >
                    Quitar
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Recomendado: 1200x600 px (2:1), formato JPG o PNG, maximo 2MB.
              </p>
              {form.photoUrl ? (
                <div className="mt-3 h-40 w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                  <img
                    src={form.photoUrl}
                    alt="Imagen del torneo"
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Si no subes una foto, se usara la imagen de la liga o una foto aleatoria.
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                Fecha de inicio
              </label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-medium text-slate-700">
                  Fecha de fin
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    checked={noEndDate}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setNoEndDate(checked);
                      if (checked) {
                        setForm((prev) => ({ ...prev, endDate: "" }));
                      }
                    }}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Sin fecha de fin
                </label>
              </div>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => {
                  const value = e.target.value;
                  setForm((prev) => ({ ...prev, endDate: value }));
                  if (value) setNoEndDate(false);
                }}
                disabled={noEndDate}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-slate-100"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                Cierre de inscripcion
              </label>
              <input
                type="date"
                value={form.registrationDeadline}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, registrationDeadline: e.target.value }))
                }
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-slate-700">Reglas</label>
              <div className="rules-editor overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div ref={rulesEditorRef} />
              </div>
              {rulesEmpty && (
                <p className="text-xs text-slate-500">
                  Puedes pegar desde Word y conservar estilos, colores y tamanos.
                </p>
              )}
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200/70 bg-white/90 p-5 shadow-[0_12px_32px_-24px_rgba(15,23,42,0.25)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Auspiciadores</h3>
                <p className="text-sm text-slate-600">
                  Agrega hasta 13 logos con link para la pagina publica del torneo.
                </p>
              </div>
              <button
                type="button"
                onClick={addSponsor}
                className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700 shadow-sm transition hover:border-slate-300"
              >
                + Agregar auspiciador
              </button>
            </div>

            {form.sponsors.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                Sin auspiciadores registrados.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {form.sponsors.map((sponsor, index) => (
                  <div
                    key={`sponsor-${index}`}
                    className="grid gap-3 rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4 md:grid-cols-[1.2fr_1.6fr_1.6fr_auto]"
                  >
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase text-slate-500">
                        Nombre
                      </label>
                      <input
                        type="text"
                        value={sponsor.name}
                        onChange={(e) =>
                          updateSponsorField(index, "name", e.target.value)
                        }
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        placeholder="Sponsor"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase text-slate-500">
                        Imagen (URL)
                      </label>
                      <input
                        type="url"
                        value={sponsor.imageUrl}
                        onChange={(e) =>
                          updateSponsorField(index, "imageUrl", e.target.value)
                        }
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        placeholder="https://..."
                      />
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-700 transition hover:border-slate-300">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) =>
                              handleSponsorUpload(index, e.target.files?.[0])
                            }
                          />
                          Subir desde galeria
                        </label>
                        {uploadingSponsors[index] && (
                          <span className="text-xs text-slate-500">
                            Subiendo...
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase text-slate-500">
                        Link (opcional)
                      </label>
                      <input
                        type="url"
                        value={sponsor.linkUrl}
                        onChange={(e) =>
                          updateSponsorField(index, "linkUrl", e.target.value)
                        }
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        placeholder="https://..."
                      />
                    </div>
                    <div className="flex items-start justify-end">
                      <button
                        type="button"
                        onClick={() => removeSponsor(index)}
                        className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-red-600 transition hover:border-red-300"
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-5 shadow-[0_12px_32px_-24px_rgba(15,23,42,0.25)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Fechas de juego</h3>
                <p className="text-sm text-slate-600">
                  Agrega las fechas exactas (dia/mes/ano) dentro del rango de inicio
                  y fin del torneo.
                </p>
              </div>
              <button
                type="button"
                onClick={addPlayDate}
                className="inline-flex items-center justify-center rounded-full border border-indigo-200/80 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-700 shadow-sm transition hover:bg-indigo-50"
              >
                + Agregar fecha
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {form.playDays.map((date, index) => (
                <div key={`play-date-${index}`} className="flex flex-wrap gap-3">
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => updatePlayDate(index, e.target.value)}
                    min={form.startDate || undefined}
                    max={!noEndDate && form.endDate ? form.endDate : undefined}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 sm:max-w-xs"
                  />
                  {form.playDays.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePlayDate(index)}
                      className="text-xs font-semibold text-red-600 transition hover:text-red-700"
                    >
                      Quitar
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-5 shadow-[0_12px_32px_-24px_rgba(15,23,42,0.25)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Clubes / complejos
                </h3>
                <p className="text-sm text-slate-600">
                  Agrega los complejos deportivos que usara el torneo.
                </p>
              </div>
              <button
                type="button"
                onClick={addClub}
                className="inline-flex items-center justify-center rounded-full border border-indigo-200/80 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-700 shadow-sm transition hover:bg-indigo-50"
              >
                + Agregar club
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {form.clubs.map((club, index) => (
                <div
                  key={`club-${index}`}
                  className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-[0_8px_20px_-18px_rgba(15,23,42,0.2)]"
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
                        Canchas habilitadas
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={club.courtsCount}
                        onChange={(e) =>
                          updateClub(index, "courtsCount", e.target.value)
                        }
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        placeholder="Ej. 6"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
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

          <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-5 shadow-[0_12px_32px_-24px_rgba(15,23,42,0.25)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Categorias</h3>
                <p className="text-sm text-slate-600">
                  Selecciona las categorias que se jugaran en este torneo.
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-500">
                {selectedCategoryIds.size} seleccionadas
              </span>
            </div>

            {filteredCategories.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                {form.sportId
                  ? "No hay categorias para este deporte."
                  : "Selecciona un deporte para ver categorias."}
              </p>
              ) : (
                <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200/70 bg-white/80 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.2)]">
                  <table className="min-w-[640px] divide-y divide-slate-200/70 text-sm">
                  <thead className="bg-slate-50/80 text-[11px] uppercase tracking-[0.2em] text-slate-500">
                    <tr>
                      <th className="px-3 py-3 text-left font-semibold">Seleccion</th>
                      <th className="px-3 py-3 text-left font-semibold">Deporte</th>
                      <th className="px-3 py-3 text-left font-semibold">Categoria</th>
                      <th className="px-3 py-3 text-left font-semibold">Abrev.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCategories.map((category) => {
                      const selected = selectedCategoryIds.has(category.id);
                      return (
                        <tr
                          key={category.id}
                          onClick={() => toggleCategory(category.id)}
                          className={`cursor-pointer transition ${
                            selected ? "bg-indigo-50/70" : "hover:bg-slate-50/80"
                          }`}
                        >
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleCategory(category.id)}
                              onClick={(event) => event.stopPropagation()}
                              className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                            />
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            {category.sport?.name ?? "N/D"}
                          </td>
                          <td className="px-3 py-2 font-semibold text-slate-900">
                            {category.name}
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            {category.abbreviation}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-5 shadow-[0_12px_32px_-24px_rgba(15,23,42,0.25)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="mt-2 text-lg font-semibold text-slate-900">
                  Precio de inscripcion por categoria
                </h3>
                <p className="text-sm text-slate-600">
                  Define el costo base y el precio desde la segunda categoria por jugador.
                </p>
              </div>
            </div>

            {selectedCategories.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                Selecciona categorias para asignar precios.
              </p>
              ) : (
                <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200/70 bg-white/80 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.2)]">
                  <table className="min-w-[640px] divide-y divide-slate-200/70 text-sm">
                  <thead className="bg-slate-50/80 text-[11px] uppercase tracking-[0.2em] text-slate-500">
                    <tr>
                      <th className="px-3 py-3 text-left font-semibold">Deporte</th>
                      <th className="px-3 py-3 text-left font-semibold">Categoria</th>
                      <th className="px-3 py-3 text-left font-semibold">
                        Precio 1
                      </th>
                      <th className="px-3 py-3 text-left font-semibold">
                        Precio 2+ (opcional)
                      </th>
                      <th className="px-3 py-3 text-left font-semibold">
                        Precio hermano (opcional)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedCategories.map((category) => (
                      <tr key={`price-${category.id}`}>
                        <td className="px-3 py-2 text-slate-700">
                          {category.sport?.name ?? "N/D"}
                        </td>
                        <td className="px-3 py-2 font-semibold text-slate-900">
                          {category.name}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-500">
                              Bs
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={categoryPrices[category.id] ?? ""}
                              onChange={(e) =>
                                updateCategoryPrice(category.id, e.target.value)
                              }
                              className="w-full max-w-[140px] rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                              placeholder="0.00"
                            />
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-500">
                              Bs
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={categorySecondaryPrices[category.id] ?? ""}
                              onChange={(e) =>
                                updateCategorySecondaryPrice(
                                  category.id,
                                  e.target.value
                                )
                              }
                              className="w-full max-w-[140px] rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                              placeholder="0.00"
                            />
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-500">
                              Bs
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={categorySiblingPrices[category.id] ?? ""}
                              onChange={(e) =>
                                updateCategorySiblingPrice(
                                  category.id,
                                  e.target.value
                                )
                              }
                              className="w-full max-w-[140px] rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                              placeholder="0.00"
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              Completa el paso 1 para continuar con inscripciones.
            </p>
            <button
              type="button"
              onClick={handleNext}
              disabled={!canSubmit || loading}
              className="inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_-22px_rgba(15,23,42,0.5)] transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? "Guardando..." : "Siguiente"}
          </button>
        </div>
        {activeTournamentId && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Estado del torneo
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-700">
              {activeTournamentStatus === "WAITING"
                ? "En espera"
                : activeTournamentStatus === "ACTIVE"
                ? "Torneo pagado"
                : "Finalizado"}
            </span>
            {isAdmin && currentStep >= 5 && (
              <>
                <button
                  type="button"
                  onClick={() => updateTournamentStatus("WAITING")}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Marcar en espera
                </button>
                <button
                  type="button"
                  onClick={() => updateTournamentStatus("ACTIVE")}
                  className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 shadow-sm transition hover:border-emerald-300"
                >
                  Activar torneo
                </button>
                {currentStep === 8 && activeTournamentStatus === "ACTIVE" && (
                  <button
                    type="button"
                    onClick={() => updateTournamentStatus("FINISHED")}
                    className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700 shadow-sm transition hover:border-amber-300"
                  >
                    Terminar torneo
                  </button>
                )}
              </>
            )}
            {!isAdmin && activeTournamentStatus === "WAITING" && currentStep >= 5 && (
              <span className="text-xs text-amber-600">
                Pendiente de pago. Solo el administrador general puede activarlo.
              </span>
            )}
          </div>
        )}
      </div>

      {currentStep === 5 && activeTournamentId && (
        <div className="admin-fade-up overflow-hidden rounded-[24px] border border-slate-200/70 bg-white/90 p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.35)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                Pago del torneo
              </p>
              <p className="text-sm text-slate-600">
                Cobro por inscrito en todas las categorias.
              </p>
            </div>
            <button
              type="button"
              onClick={openPaymentModal}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              Ver pago
            </button>
          </div>
        </div>
      )}
      </div>

      <div className="admin-fade-up relative overflow-hidden rounded-[24px] border border-white/70 bg-white/80 p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/70 backdrop-blur">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-slate-200/80 via-indigo-200/60 to-slate-200/80" />
        <h3 className="text-lg font-semibold text-slate-900">Torneos creados</h3>
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
                      Inicio: {toISODate(tournament.startDate) || "N/D"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={`/tournaments/${tournament.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-indigo-200 bg-indigo-50/70 px-3 py-1.5 text-xs font-semibold text-indigo-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50"
                    >
                      Ver publico
                    </a>
                    <button
                      type="button"
                      onClick={() => startEditing(tournament)}
                      disabled={!canEditTournament(tournament)}
                      className="rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-white"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(tournament)}
                      disabled={!canEditTournament(tournament)}
                      className="rounded-full border border-red-200 bg-red-50/60 px-3 py-1.5 text-xs font-semibold text-red-600 shadow-sm transition hover:bg-red-50"
                    >
                      Eliminar
                    </button>
                    {canManagePermissions(tournament) && (
                      <button
                        type="button"
                        onClick={() =>
                          activePermissionsTournamentId === tournament.id
                            ? closePermissions()
                            : openPermissions(tournament.id)
                        }
                        className="rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-white"
                      >
                        Permisos
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600">
                    Estado:{" "}
                    {tournament.status === "WAITING"
                      ? "En espera"
                      : tournament.status === "ACTIVE"
                      ? "Torneo pagado"
                      : "Finalizado"}
                  </span>
                  {!canEditTournament(tournament) && (
                    <span className="text-[11px] font-semibold text-slate-400">
                      Solo lectura
                    </span>
                  )}
                </div>
                {activePermissionsTournamentId === tournament.id &&
                  canManagePermissions(tournament) && (
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
                          onClick={() => handleGrantPermission(tournament.id)}
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
                                onClick={() =>
                                  handleRevokePermission(tournament.id, user.id)
                                }
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
        </>
      ) : currentStep === 2 ? (
        activeTournamentId ? (
          <TournamentRegistrations
            tournamentId={activeTournamentId}
            tournamentName={activeTournamentName || form.name}
            categories={registrationCategories}
            tournamentStatus={activeTournamentStatus}
          />
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Guarda el torneo para continuar con la inscripcion.
          </p>
        )
      ) : currentStep === 3 ? (
        activeTournamentId ? (
          <TournamentPrizes
            tournamentId={activeTournamentId}
            tournamentName={activeTournamentName || form.name}
            categories={selectedCategories}
          />
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Guarda el torneo para continuar con los premios.
          </p>
        )
      ) : currentStep === 4 ? (
        activeTournamentId ? (
          <TournamentDraws
            tournamentId={activeTournamentId}
            tournamentName={activeTournamentName || form.name}
          />
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Guarda el torneo para continuar con el sorteo.
          </p>
        )
      ) : currentStep === 5 ? (
        activeTournamentId ? (
          <TournamentFixture
            tournamentId={activeTournamentId}
            tournamentName={activeTournamentName || form.name}
          />
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Guarda el torneo para continuar con el fixture.
          </p>
        )
      ) : currentStep === 6 ? (
        activeTournamentId && canContinueAfterPayment ? (
          <TournamentSchedule
            tournamentId={activeTournamentId}
            tournamentName={activeTournamentName || form.name}
          />
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            El torneo debe estar activo para continuar con el calendario.
          </p>
        )
      ) : currentStep === 7 ? (
        activeTournamentId && canContinueAfterPayment ? (
          <TournamentScores
            tournamentId={activeTournamentId}
            tournamentName={activeTournamentName || form.name}
            onStatusChange={(status) => {
              setActiveTournamentStatus(status);
              refreshTournaments();
            }}
            onCompletionChange={(complete) => {
              setRoundRobinComplete(complete);
            }}
            onUnlockStepNine={() => {
              setStepNineUnlocked(true);
              setCurrentStep(9);
            }}
          />
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            El torneo debe estar activo para continuar con la tabla de scores.
          </p>
        )
      ) : currentStep === 8 ? (
        activeTournamentId && canContinueAfterPayment ? (
          <TournamentPlayoffs
            tournamentId={activeTournamentId}
            tournamentName={activeTournamentName || form.name}
            onStatusChange={(status) => {
              setActiveTournamentStatus(status);
              if (status === "FINISHED") {
                setStepNineUnlocked(true);
              }
              refreshTournaments();
            }}
            onUnlockStepNine={() => {
              setStepNineUnlocked(true);
              setCurrentStep(9);
            }}
          />
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            El torneo debe estar activo para continuar con los playoffs.
          </p>
        )
      ) : currentStep === 9 ? (
        activeTournamentId &&
        (activeTournamentStatus === "FINISHED" || stepNineUnlocked) ? (
          <TournamentFinalStandings
            tournamentId={activeTournamentId}
            tournamentName={activeTournamentName || form.name}
          />
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Finaliza el torneo para ver las posiciones finales.
          </p>
        )
      ) : null}

      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6">
          <div className="w-full max-w-lg rounded-3xl border border-white/60 bg-white/95 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                  Pago del torneo
                </p>
                <h3 className="text-xl font-semibold text-slate-900">
                  {activeTournamentName}
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
                  {loadingPayment ? "..." : paymentCount}
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  Monto por jugador
                </label>
                <input
                  value={paymentRateInput}
                  onChange={(event) => setPaymentRateInput(event.target.value)}
                  disabled={!isAdmin}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-100"
                  placeholder="Ej. 5.00"
                />
              </div>
              <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/80 p-4">
                <p className="text-sm text-emerald-700">Total a pagar</p>
                <p className="text-2xl font-semibold text-emerald-900">
                  {(() => {
                    const rate = parsePriceInput(paymentRateInput) ?? 0;
                    return `${(rate * paymentCount).toFixed(2)} Bs`;
                  })()}
                </p>
              </div>
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
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
              {!isAdmin && (
                <button
                  type="button"
                  onClick={handlePaymentReported}
                  className="rounded-full bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"
                >
                  Pago realizada
                </button>
              )}
              {isAdmin && (
                <button
                  type="button"
                  onClick={savePaymentRate}
                  disabled={loadingPayment}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Guardar monto
                </button>
              )}
              {isAdmin && activeTournamentStatus !== "ACTIVE" && (
                <button
                  type="button"
                  onClick={() => updateTournamentStatus("ACTIVE")}
                  disabled={loadingPayment}
                  className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Pago finalizado
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { BracketCanvas } from "@/components/tournaments/bracket-canvas";
import TournamentPublicFixture from "@/components/tournaments/tournament-public-fixture";
import TournamentPublicParticipants from "@/components/tournaments/tournament-public-participants";
import {
  computeTournamentStandingsByCategory,
  type TournamentRankingData,
  type StandingEntry,
} from "@/lib/ranking";
import { buildSlotPositionMap, computePlayoffMatchOrder } from "@/lib/playoff-match-utils";
import { nextPowerOfTwo } from "@/lib/playoff-utils";

import {
  type TournamentPublicData,
  type Match,
  type Category,
  type Registration,
  type Player,
  type Sponsor,
  type Club,
  type TournamentCategory,
  type Prize,
  type ParticipantRow,
  type PlayoffSlotPublic,
} from "@/types/tournament-public";

type TabKey =
  | "info"
  | "participants"
  | "groups"
  | "standings"
  | "bracket"
  | "fixture"
  | "results"
  | "prizes"
  | "contact";

const playoffDrawTypes = new Set(["PLAYOFF", "GROUPS_PLAYOFF"]);

const TABS: { key: TabKey; label: string }[] = [
  { key: "info", label: "Info" },
  { key: "participants", label: "Participantes" },
  { key: "groups", label: "Sembrado" },
  { key: "standings", label: "Posiciones" },
  { key: "bracket", label: "Brackets" },
  { key: "fixture", label: "Fixture" },
  { key: "results", label: "Resultados" },
  { key: "prizes", label: "Premios" },
  { key: "contact", label: "Contacto" },
];

const FALLBACK_TOURNAMENT_PHOTOS = [
  "/hero/fotouno.jpeg",
  "/hero/fotodos.jpeg",
  "/hero/fototres.jpeg",
  "/hero/fotocuatro.jpeg",
];

const getSportFolder = (name?: string | null) => {
  if (!name) return null;
  const normalized = name.toLowerCase().replace(/\s+/g, "");
  if (normalized === "racquetball" || normalized === "raquetball") return "raquet";
  if (normalized === "fronton") return "fronton";
  if (normalized === "padel") return "padel";
  if (normalized === "tenis") return "tenis";
  if (normalized === "squash") return "squash";
  return null;
};

const SPORT_FALLBACK_COUNTS: Record<string, number> = {
  raquet: 3,
  fronton: 2,
  padel: 1,
  squash: 1,
  tenis: 1,
};

const pickSportFallbackPhoto = (sportName?: string | null) => {
  const folder = getSportFolder(sportName);
  if (!folder) return null;
  const count = SPORT_FALLBACK_COUNTS[folder];
  if (!count) return null;
  const index = Math.floor(Math.random() * count) + 1;
  return `/sports/${folder}/${index}.jpg`;
};

const pickFallbackTournamentPhoto = (seed: string) => {
  if (!seed) return FALLBACK_TOURNAMENT_PHOTOS[0];
  let total = 0;
  for (let i = 0; i < seed.length; i += 1) {
    total += seed.charCodeAt(i);
  }
  return FALLBACK_TOURNAMENT_PHOTOS[total % FALLBACK_TOURNAMENT_PHOTOS.length];
};

const formatDateLong = (value?: string | null) => {
  if (!value) return "N/D";
  const trimmed = value.trim();
  if (!trimmed) return "N/D";
  const datePart = trimmed.includes("T") ? trimmed.split("T")[0] : trimmed;
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  const parsed = dateOnlyMatch
    ? new Date(
      Number(dateOnlyMatch[1]),
      Number(dateOnlyMatch[2]) - 1,
      Number(dateOnlyMatch[3])
    )
    : new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("es-BO", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const formatDateShort = (value?: string | null) => {
  if (!value) return "N/D";
  const trimmed = value.trim();
  if (!trimmed) return "N/D";
  const datePart = trimmed.includes("T") ? trimmed.split("T")[0] : trimmed;
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  const parsed = dateOnlyMatch
    ? new Date(
      Number(dateOnlyMatch[1]),
      Number(dateOnlyMatch[2]) - 1,
      Number(dateOnlyMatch[3])
    )
    : new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("es-BO", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatOrdinal = (value: number) => {
  if (value === 1) return "1ro";
  if (value === 2) return "2do";
  if (value === 3) return "3ro";
  return `${value}to`;
};

const formatMatchScore = (match: Match, category?: Category | null) => {
  if (!Array.isArray(match.games)) return null;
  const parts: string[] = [];
  for (const entry of match.games) {
    if (!entry || typeof entry !== "object") continue;
    const a = (entry as { a?: unknown }).a;
    const b = (entry as { b?: unknown }).b;
    const tiebreakA = (entry as { tiebreakA?: unknown }).tiebreakA;
    const tiebreakB = (entry as { tiebreakB?: unknown }).tiebreakB;
    if (typeof a !== "number" || typeof b !== "number") continue;
    const tiebreak =
      typeof tiebreakA === "number" && typeof tiebreakB === "number"
        ? `(${tiebreakA}-${tiebreakB})`
        : "";
    parts.push(`${a}-${b}${tiebreak}`);
  }
  if (parts.length === 0) return null;
  return parts.join(" | ");
};

const isMatchComplete = (match: Match) => {
  const outcomeType = match.outcomeType ?? "PLAYED";
  if (outcomeType !== "PLAYED") {
    return Boolean(match.outcomeSide || match.winnerSide);
  }
  if (match.winnerSide) return true;
  return Array.isArray(match.games) && match.games.length > 0;
};

const formatPlayoffRoundLabel = (bracketSize: number, roundNumber: number) => {
  const roundSize = Math.max(
    2,
    Math.floor(bracketSize / Math.pow(2, roundNumber - 1))
  );
  if (roundSize === 2) return "Final";
  if (roundSize === 4) return "Semifinal";
  if (roundSize === 8) return "Cuartos";
  if (roundSize === 16) return "Ronda de 16";
  if (roundSize === 32) return "Ronda de 32";
  if (roundSize === 64) return "Ronda de 64";
  return `Ronda de ${roundSize}`;
};

const describePrizePlace = (placeFrom: number, placeTo?: number | null) => {
  const toValue = placeTo ?? placeFrom;
  if (placeFrom === toValue) {
    if (placeFrom === 1) return "1er lugar";
    if (placeFrom === 2) return "2do lugar";
    if (placeFrom === 3) return "3er lugar";
    if (placeFrom === 4) return "4to lugar";
    if (placeFrom === 5) return "5to lugar";
    return `Lugar ${placeFrom}`;
  }
  if (placeFrom === 3 && toValue === 4) return "Semifinal";
  if (placeFrom === 5 && toValue === 8) return "Cuartos de final";
  if (placeFrom === 1 && toValue === 2) return "Final";
  return `Lugar ${placeFrom} a ${toValue}`;
};

const playerLabel = (player?: Player | null) =>
  player ? `${player.firstName} ${player.lastName}` : "Por definir";

const teamLabel = (registration?: Registration | null) => {
  if (!registration) return "Por definir";
  if (registration.teamName) return registration.teamName;
  const names = [
    registration.player,
    registration.partner,
    registration.partnerTwo,
  ]
    .filter(Boolean)
    .map((p) => playerLabel(p as Player));
  return names.join(" / ");
};

const teamMembersLabel = (registration?: Registration | null) => {
  if (!registration) return "";
  const members = [registration.player, registration.partner, registration.partnerTwo].filter(
    Boolean
  ) as Player[];
  return members.map((member) => `${member.firstName} ${member.lastName}`).join(" / ");
};

const registrationLocation = (registration: Registration) => {
  const members = [registration.player, registration.partner, registration.partnerTwo].filter(
    Boolean
  ) as Player[];
  const city = members.find((member) => member.city)?.city ?? "";
  const country = members.find((member) => member.country)?.country ?? "";
  return [city, country].filter(Boolean).join(", ");
};

export default function TournamentPublic({
  tournament,
}: {
  tournament: TournamentPublicData;
}) {
  const [tab, setTab] = useState<TabKey>("info");
  const [themeMode, setThemeMode] = useState<"light" | "dark">("light");
  const [participantQuery, setParticipantQuery] = useState("");
  const [matches, setMatches] = useState<Match[]>(
    Array.isArray(tournament.matches) ? tournament.matches : []
  );
  const [playoffSlots, setPlayoffSlots] = useState<PlayoffSlotPublic[]>(
    Array.isArray(tournament.playoffSlots) ? tournament.playoffSlots : []
  );
  const [matchesError, setMatchesError] = useState<string | null>(null);
  const schedulePublished = Boolean(tournament.schedulePublished);
  const groupsPublished = Boolean(tournament.groupsPublished);
  const playoffsPublished = Boolean(tournament.playoffsPublished);
  const visibleTabs = useMemo(
    () =>
      TABS.filter((item) => {
        if (!schedulePublished && item.key === "fixture") return false;
        if (!groupsPublished && item.key === "groups") return false;
        if (!groupsPublished && item.key === "standings") return false;
        if (!playoffsPublished && item.key === "bracket") return false;
        return true;
      }),
    [schedulePublished, groupsPublished, playoffsPublished]
  );

  useEffect(() => {
    if (schedulePublished && groupsPublished && playoffsPublished) return;
    if (!schedulePublished && tab === "fixture") {
      setTab("info");
      return;
    }
    if (!groupsPublished && (tab === "groups" || tab === "standings")) {
      setTab("info");
      return;
    }
    if (!playoffsPublished && tab === "bracket") {
      setTab("info");
    }
  }, [schedulePublished, groupsPublished, playoffsPublished, tab]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const updateTheme = () => {
      const next = document.documentElement.classList.contains("theme-dark")
        ? "dark"
        : "light";
      setThemeMode(next);
    };
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const liveTabs: TabKey[] = ["fixture", "results", "bracket", "standings"];
    if (!liveTabs.includes(tab)) return;
    let active = true;

    const loadMatches = async () => {
      try {
        const response = await fetch(
          `/api/tournaments/${tournament.id}/public-matches`,
          { cache: "no-store" }
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error ?? "No se pudo actualizar el calendario");
        }
        if (!active) return;
        setMatches(Array.isArray(data.matches) ? data.matches : []);
        if (Array.isArray(data.playoffSlots)) {
          setPlayoffSlots(data.playoffSlots);
        }
        setMatchesError(null);
      } catch (err) {
        if (!active) return;
        setMatchesError(
          err instanceof Error ? err.message : "No se pudo actualizar el calendario"
        );
      }
    };

    void loadMatches();
    const interval = window.setInterval(loadMatches, 10000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [tab, tournament.id]);

  const categoriesById = useMemo(() => {
    const map = new Map<string, Category>();
    tournament.categories.forEach((entry) => {
      map.set(entry.categoryId, entry.category);
    });
    return map;
  }, [tournament.categories]);

  const getMatchCategory = (match: Match) =>
    categoriesById.get(match.categoryId) ??
    tournament.categories.find((entry) => entry.categoryId === match.categoryId)
      ?.category ??
    null;

  const categoryDrawTypeById = useMemo(() => {
    const map = new Map<string, string | null>();
    tournament.categories.forEach((entry) => {
      map.set(entry.categoryId, entry.drawType ?? null);
    });
    return map;
  }, [tournament.categories]);

  const groupStageCompleteByCategory = useMemo(() => {
    const map = new Map<string, boolean>();
    const groupMatchesByCategory = new Map<string, Match[]>();
    matches
      .filter((match) => match.stage === "GROUP")
      .forEach((match) => {
        if (!groupMatchesByCategory.has(match.categoryId)) {
          groupMatchesByCategory.set(match.categoryId, []);
        }
        groupMatchesByCategory.get(match.categoryId)?.push(match);
      });

    groupMatchesByCategory.forEach((list, categoryId) => {
      const allComplete =
        list.length > 0 && list.every((match) => isMatchComplete(match));
      map.set(categoryId, allComplete);
    });

    return map;
  }, [matches]);

  const normalizedParticipantQuery = participantQuery.trim().toLowerCase();

  const participantRows = useMemo(() => {
    const rows: ParticipantRow[] = [];

    tournament.registrations.forEach((registration) => {
      const category =
        categoriesById.get(registration.categoryId) ??
        tournament.categories.find((entry) => entry.categoryId === registration.categoryId)
          ?.category;
      if (!category) return;
      const members = [registration.player, registration.partner, registration.partnerTwo].filter(
        Boolean
      ) as Player[];
      const location = registrationLocation(registration);
      members.forEach((member) => {
        rows.push({
          id: `${registration.id}-${member.id}`,
          player: member,
          category,
          teamName: registration.teamName ?? null,
          location,
          createdAt: registration.createdAt,
        });
      });
    });
    return rows;
  }, [tournament.registrations, tournament.categories, categoriesById]);

  const registrationById = useMemo(() => {
    const map = new Map<string, Registration>();
    tournament.registrations.forEach((registration) => {
      map.set(registration.id, registration);
    });
    return map;
  }, [tournament.registrations]);

  const registrationMap = useMemo(() => {
    const map = new Map<string, Registration>();
    tournament.registrations.forEach((registration) => {
      map.set(registration.id, registration);
    });
    return map;
  }, [tournament.registrations]);

  const filteredParticipantRows = useMemo(() => {
    if (!normalizedParticipantQuery) return participantRows;
    return participantRows.filter((row) => {
      const name = `${row.player.firstName} ${row.player.lastName}`.toLowerCase();
      const teamName = (row.teamName ?? "").toLowerCase();
      const category = `${row.category.name} ${row.category.abbreviation}`.toLowerCase();
      const location = row.location.toLowerCase();
      const combined = [name, teamName, category, location].join(" ");
      return combined.includes(normalizedParticipantQuery);
    });
  }, [participantRows, normalizedParticipantQuery]);

  const groupSeedings = useMemo(() => {
    const map = new Map<
      string,
      { category: Category; groups: Map<string, Registration[]> }
    >();
    tournament.registrations.forEach((registration) => {
      const category =
        categoriesById.get(registration.categoryId) ??
        tournament.categories.find((entry) => entry.categoryId === registration.categoryId)
          ?.category;
      if (!category) return;
      if (!registration.groupName) return;
      const entry = map.get(registration.categoryId) ?? {
        category,
        groups: new Map<string, Registration[]>(),
      };
      const groupKey = registration.groupName.trim() || "A";
      const list = entry.groups.get(groupKey) ?? [];
      list.push(registration);
      entry.groups.set(groupKey, list);
      map.set(registration.categoryId, entry);
    });

    return Array.from(map.values()).map((entry) => {
      const groups = Array.from(entry.groups.entries()).map(([key, list]) => {
        const sorted = [...list].sort((a, b) => {
          const rankA = a.rankingNumber ?? Number.MAX_SAFE_INTEGER;
          const rankB = b.rankingNumber ?? Number.MAX_SAFE_INTEGER;
          if (rankA !== rankB) return rankA - rankB;
          return a.createdAt.localeCompare(b.createdAt);
        });
        return { key, list: sorted };
      });
      groups.sort((a, b) => a.key.localeCompare(b.key));
      return { category: entry.category, groups };
    });
  }, [tournament.registrations, categoriesById, tournament.categories]);

  const safeCategories = Array.isArray(tournament.categories)
    ? tournament.categories
    : [];
  const safeRegistrations = Array.isArray(tournament.registrations)
    ? tournament.registrations
    : [];
  const safeMatches = Array.isArray(matches) ? matches : [];
  const safePlayoffSlots = Array.isArray(playoffSlots) ? playoffSlots : [];

  const standingsByCategory = useMemo(() => {
    const data: TournamentRankingData = {
      categories: safeCategories.map((entry) => ({
        categoryId: entry.categoryId,
        drawType: undefined,
      })),
      registrations: safeRegistrations.map((registration) => ({
        id: registration.id,
        categoryId: registration.categoryId,
        groupName: registration.groupName ?? null,
        seed: null,
        rankingNumber: registration.rankingNumber ?? null,
        createdAt: registration.createdAt,
        playerId: registration.playerId,
        partnerId: registration.partnerId ?? null,
        partnerTwoId: registration.partnerTwoId ?? null,
      })),
      matches: safeMatches.map((match) => ({
        categoryId: match.categoryId,
        groupName: match.groupName ?? null,
        stage: match.stage as TournamentRankingData["matches"][number]["stage"],
        roundNumber: match.roundNumber ?? null,
        games: match.games,
        teamAId: match.teamAId ?? null,
        teamBId: match.teamBId ?? null,
        winnerSide: match.winnerSide as TournamentRankingData["matches"][number]["winnerSide"],
        outcomeType: match.outcomeType as TournamentRankingData["matches"][number]["outcomeType"],
        outcomeSide: match.outcomeSide as TournamentRankingData["matches"][number]["outcomeSide"],
        isBronzeMatch: match.isBronzeMatch ?? null,
      })),
      groupPoints: tournament.groupPoints ?? null,
      rankingPoints: [],
    };
    const computed = computeTournamentStandingsByCategory(data);
    return computed instanceof Map ? computed : new Map<string, StandingEntry[]>();
  }, [safeCategories, safeRegistrations, safeMatches, tournament.groupPoints]);

  const labelByRegistration = useMemo(() => {
    const map = new Map<string, string>();
    standingsByCategory.forEach((entries) => {
      if (!Array.isArray(entries)) return;
      const groupMap = new Map<string, typeof entries>();
      entries.forEach((entry) => {
        const groupKey = entry.groupName ?? "A";
        const list = groupMap.get(groupKey) ?? [];
        list.push(entry);
        groupMap.set(groupKey, list);
      });
      groupMap.forEach((list, groupKey) => {
        list.forEach((entry, index) => {
          map.set(
            entry.id,
            `${formatOrdinal(index + 1)} Grupo ${groupKey}`
          );
        });
      });
    });
    return map;
  }, [standingsByCategory]);

  const standingsByCategoryGroups = useMemo(() => {
    const result: {
      category: Category;
      groups: { key: string; entries: StandingEntry[] }[];
    }[] = [];

    standingsByCategory.forEach((entries, categoryId) => {
      if (!Array.isArray(entries)) return;
      const category =
        categoriesById.get(categoryId) ??
        safeCategories.find((entry) => entry.categoryId === categoryId)?.category;
      if (!category) return;
      const groupMap = new Map<string, typeof entries>();
      entries.forEach((entry) => {
        const groupKey = entry.groupName ?? "A";
        const list = groupMap.get(groupKey) ?? [];
        list.push(entry);
        groupMap.set(groupKey, list);
      });
      const groups = Array.from(groupMap.entries()).map(([key, list]) => ({
        key,
        entries: list,
      }));
      groups.sort((a, b) => a.key.localeCompare(b.key));
      result.push({ category, groups });
    });

    return result;
  }, [standingsByCategory, categoriesById, tournament.categories]);

  const slotMapByCategory = useMemo(() => {
    const map = new Map<string, PlayoffSlotPublic[]>();
    safePlayoffSlots.forEach((slot) => {
      const list = map.get(slot.categoryId) ?? [];
      list.push(slot);
      map.set(slot.categoryId, list);
    });
    map.forEach((list) => list.sort((a, b) => a.position - b.position));
    return map;
  }, [safePlayoffSlots]);

  const slotPositionMapByCategory = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    slotMapByCategory.forEach((slots, categoryId) => {
      const matchesForCategory = safeMatches.filter(
        (match) => match.stage === "PLAYOFF" && match.categoryId === categoryId
      );
      const mapping = buildSlotPositionMap({
        slots: slots.map((slot) => ({
          position: slot.position,
          entrantId: slot.entrantId ?? null,
        })),
        matches: matchesForCategory.map((match) => ({
          id: match.id,
          roundNumber: match.roundNumber ?? null,
          orderHint: match.orderHint ?? null,
          createdAt: match.createdAt ?? null,
          teamAId: match.teamAId ?? null,
          teamBId: match.teamBId ?? null,
        })),
      });
      map.set(categoryId, mapping);
    });
    return map;
  }, [slotMapByCategory, safeMatches]);

  const playoffBrackets = useMemo(() => {
    const map = new Map<
      string,
      { category: Category; matches: Match[]; bronzeMatches: Match[] }
    >();
    safeMatches
      .filter((match) => match.stage === "PLAYOFF")
      .forEach((match) => {
        const category =
          categoriesById.get(match.categoryId) ??
          tournament.categories.find((entry) => entry.categoryId === match.categoryId)
            ?.category;
        if (!category) return;
        const drawType =
          categoryDrawTypeById.get(match.categoryId) ??
          tournament.categories.find((entry) => entry.categoryId === match.categoryId)
            ?.drawType ??
          null;
        if (!drawType || !playoffDrawTypes.has(drawType)) return;
        const entry =
          map.get(match.categoryId) ?? { category, matches: [], bronzeMatches: [] };
        if (match.isBronzeMatch) {
          entry.bronzeMatches.push(match);
        } else {
          entry.matches.push(match);
        }
        map.set(match.categoryId, entry);
      });

    const deriveBracketSizeFromMatches = (matches: Match[]) => {
      if (matches.length === 0) return undefined;
      const roundCounts = new Map<number, number>();
      matches.forEach((match) => {
        const round = match.roundNumber ?? 1;
        roundCounts.set(round, (roundCounts.get(round) ?? 0) + 1);
      });
      let maxSize = 0;
      roundCounts.forEach((count, round) => {
        const size = count * 2 ** Math.max(0, round - 1);
        if (size > maxSize) maxSize = size;
      });
      return maxSize > 1 ? maxSize : undefined;
    };

    return Array.from(map.values()).map((entry) => {
      const slotEntries = slotMapByCategory.get(entry.category.id) ?? [];
      const slotPositionMap =
        slotPositionMapByCategory.get(entry.category.id) ?? new Map();
      const roundNumbers = Array.from(
        new Set(
          entry.matches
            .map((match) => match.roundNumber ?? 1)
            .filter((round) => typeof round === "number")
        )
      ).sort((a, b) => a - b);
      const firstRoundNumber = roundNumbers[0] ?? 1;
      const lastRoundNumber =
        roundNumbers.length > 0 ? roundNumbers[roundNumbers.length - 1] : 1;
      const derivedBracketSize =
        slotEntries.length > 0
          ? slotEntries.length
          : deriveBracketSizeFromMatches(entry.matches);
      const filledSlotCount = slotEntries.filter((slot) => slot.entrantId).length;
      const displayBracketSize =
        filledSlotCount > 1 ? nextPowerOfTwo(filledSlotCount) : null;
      const labelBracketSize =
        displayBracketSize ?? deriveBracketSizeFromMatches(entry.matches) ?? 0;
      const expectedRounds =
        labelBracketSize > 1
          ? Math.max(1, Math.round(Math.log2(labelBracketSize)))
          : roundNumbers.length || 1;
      const normalizedRoundNumbers =
        expectedRounds > 0
          ? Array.from({ length: expectedRounds }, (_, index) => index + 1)
          : roundNumbers.length > 0
          ? roundNumbers
          : [1];

      const slotEntriesForOrder = slotEntries.map((slot) => ({
        position: slot.position,
        entrantId: slot.entrantId ?? null,
      }));
      const matchesForBracket = entry.matches.map((match) => {
        if (slotEntriesForOrder.length === 0) return match;
        const orderHint = computePlayoffMatchOrder({
          match: {
            teamAId: match.teamAId ?? null,
            teamBId: match.teamBId ?? null,
            roundNumber: match.roundNumber ?? firstRoundNumber,
          },
          slots: slotEntriesForOrder,
        });
        if (typeof orderHint === "number") {
          return { ...match, orderHint };
        }
        return match;
      });
      const matchStatusByMatchId = new Map<string, string>();
      matchesForBracket.forEach((match) => {
        const score = formatMatchScore(match, getMatchCategory(match));
        if (score) {
          matchStatusByMatchId.set(match.id, score);
        }
      });
      const labelMap = new Map<number, string>();
      if (labelBracketSize > 0 && normalizedRoundNumbers.length > 0) {
        normalizedRoundNumbers.forEach((round) => {
          labelMap.set(round, formatPlayoffRoundLabel(labelBracketSize, round));
        });
      }
      const useLabelMap =
        labelMap.size > 0 ? labelMap : undefined;
      return {
        category: entry.category,
        matches: matchesForBracket,
        bronzeMatches: entry.bronzeMatches,
        roundNumbers: normalizedRoundNumbers,
        bracketSize: labelBracketSize || derivedBracketSize,
        matchStatusByMatchId,
        roundLabelMap: useLabelMap,
      };
    });
  }, [
    safeMatches,
    categoriesById,
    tournament.categories,
    categoryDrawTypeById,
    slotMapByCategory,
    slotPositionMapByCategory,
  ]);

  const bracketSizeByCategory = useMemo(() => {
    const map = new Map<string, number>();
    playoffBrackets.forEach((entry) => {
      if (entry.bracketSize) {
        map.set(entry.category.id, entry.bracketSize);
      }
    });
    return map;
  }, [playoffBrackets]);

  const playoffRoundsByCategory = useMemo(() => {
    const map = new Map<string, number[]>();
    playoffBrackets.forEach((entry) => {
      map.set(entry.category.id, entry.roundNumbers);
    });
    return map;
  }, [playoffBrackets]);


  const resultMatches = useMemo(
    () =>
      matches.filter((match) => {
        const score = formatMatchScore(match, getMatchCategory(match));
        return Boolean(
          score ||
          match.winnerSide ||
          (match.outcomeType && match.outcomeType !== "PLAYED")
        );
      }),
    [matches]
  );

  const prizesByCategory = useMemo(() => {
    const map = new Map<string, { category: Category | null; prizes: Prize[] }>();
    tournament.prizes.forEach((prize) => {
      const category = prize.category ?? null;
      const key = prize.categoryId;
      const entry = map.get(key) ?? { category, prizes: [] };
      entry.prizes.push(prize);
      map.set(key, entry);
    });
    return Array.from(map.values());
  }, [tournament.prizes]);

  const toggleTeamExpanded = (key: string) => {
    setExpandedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const getTeamMembers = (registration?: Registration | null) => {
    if (!registration) return [];
    return [registration.player, registration.partner, registration.partnerTwo]
      .filter(Boolean)
      .map((player) => playerLabel(player as Player));
  };

  const getPlayoffLabel = (match: Match) => {
    if (match.stage !== "PLAYOFF") return match.groupName ?? "-";
    if (match.isBronzeMatch) return "Bronce";
    const roundNumber = match.roundNumber ?? null;
    const bracketSize = bracketSizeByCategory.get(match.categoryId) ?? null;
    const roundNumbers = playoffRoundsByCategory.get(match.categoryId) ?? null;
    if (!roundNumber || !bracketSize || !roundNumbers) return "Playoff";
    const roundIndex = roundNumbers.indexOf(roundNumber);
    const normalizedRound = roundIndex >= 0 ? roundIndex + 1 : roundNumber;
    return formatPlayoffRoundLabel(bracketSize, normalizedRound);
  };

  const tournamentPhoto = useMemo(() => {
    if (tournament.photoUrl) return tournament.photoUrl;
    if (tournament.league?.photoUrl) return tournament.league.photoUrl;
    const sportFallback = pickSportFallbackPhoto(tournament.sport?.name);
    if (sportFallback) return sportFallback;
    return pickFallbackTournamentPhoto(tournament.id);
  }, [
    tournament.id,
    tournament.league?.photoUrl,
    tournament.photoUrl,
    tournament.sport?.name,
  ]);
  const showLeagueInfo = Boolean(tournament.rankingEnabled && tournament.league);

  return (
    <main className="min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-[var(--background)] text-[var(--foreground)]">
      <div className="relative overflow-hidden border-b border-[var(--border)] bg-[radial-gradient(1200px_circle_at_10%_20%,rgba(59,130,246,0.25),transparent_55%),radial-gradient(900px_circle_at_90%_0%,rgba(14,165,233,0.25),transparent_50%)]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-12">
          <div className="relative h-52 w-full overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)]">
            <img
              src={tournamentPhoto}
              alt={`Imagen del torneo ${tournament.name}`}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300/80">
                Torneo
              </p>
              <h1
                className="mt-3 text-4xl font-semibold text-slate-900"
                style={{ fontFamily: "'Merriweather', serif" }}
              >
                {tournament.name}
              </h1>
              <p className="mt-3 max-w-2xl text-sm text-slate-600">
                {tournament.description ||
                  "Informacion oficial del torneo y detalles para los jugadores."}
              </p>
            </div>
            {showLeagueInfo && (
              <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-xs text-slate-600">
                <div className="h-16 w-24 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
                  {tournament.league?.photoUrl ? (
                    <img
                      src={tournament.league.photoUrl}
                      alt={tournament.league.name}
                      className="h-full w-full object-contain p-1"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">
                      Sin foto
                    </div>
                  )}
                </div>
                <div>
                  <p className="font-semibold text-slate-900">
                    {tournament.league?.name ?? "Sin liga"}
                  </p>
                  <p className="mt-1 text-slate-500">
                    {tournament.sport?.name ?? "Sin deporte"}
                  </p>
                  <p className="mt-1 text-slate-500">
                    Inicio: {formatDateShort(tournament.startDate)}
                  </p>
                </div>
              </div>
            )}
          </div>

          {tournament.sponsors.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
              {tournament.sponsors.map((sponsor, index) => {
                const content = (
                  <div className="flex h-14 w-32 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
                    <img
                      src={sponsor.imageUrl}
                      alt={sponsor.name ?? `Auspiciador ${index + 1}`}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                );
                if (sponsor.linkUrl) {
                  return (
                    <a
                      key={`${sponsor.imageUrl}-${index}`}
                      href={sponsor.linkUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {content}
                    </a>
                  );
                }
                return (
                  <div key={`${sponsor.imageUrl}-${index}`}>{content}</div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="flex flex-wrap gap-2">
          {visibleTabs.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] ${tab === item.key
                ? "bg-blue-600 text-white dark:bg-cyan-400/90 dark:text-slate-900"
                : "border border-[var(--border)] bg-[var(--surface)] text-slate-600"
                }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === "info" && (
          <section className="mt-8">
            <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
              <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
                <h2 className="text-lg font-semibold text-slate-900">Reglas</h2>
                {tournament.rulesText ? (
                  <div
                    className="rules-content ql-editor mt-4"
                    dangerouslySetInnerHTML={{ __html: tournament.rulesText }}
                  />
                ) : (
                  <p className="mt-4 text-sm text-slate-500">
                    Sin reglas publicadas.
                  </p>
                )}
              </div>
              <div className="space-y-6">
                <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
                  <h2 className="text-lg font-semibold text-slate-900">Fechas clave</h2>
                  <div className="mt-4 space-y-3 text-sm text-slate-500">
                    <p>Inicio: {formatDateLong(tournament.startDate)}</p>
                    <p>Fin: {formatDateLong(tournament.endDate)}</p>
                    <p>
                      Cierre inscripciones: {formatDateLong(tournament.registrationDeadline)}
                    </p>
                    <div>
                      <p className="mt-4 font-semibold text-slate-900">Dias de juego</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {tournament.playDays.map((day) => (
                          <span
                            key={day}
                            className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-xs text-slate-600"
                          >
                            {formatDateShort(day)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
                  <h2 className="text-lg font-semibold text-slate-900">Sedes</h2>
                  <div className="mt-4 space-y-3 text-sm text-slate-500">
                    {tournament.clubs.map((club) => (
                      <div
                        key={club.id}
                        className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3"
                      >
                        <p className="font-semibold text-slate-900">{club.name}</p>
                        <p>{club.address ?? "Sin direccion"}</p>
                        <p className="text-xs text-slate-500">
                          Canchas habilitadas: {club.courtsCount ?? 1}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
                  <h2 className="text-lg font-semibold text-slate-900">
                    Categorias disponibles
                  </h2>
                  <div className="mt-4 space-y-3 text-sm">
                    {tournament.categories.map((entry) => (
                      <div
                        key={entry.categoryId}
                        className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <p className="font-semibold text-slate-900">
                            {entry.category.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {entry.category.abbreviation} - {entry.category.sport?.name ?? "N/D"}
                          </p>
                        </div>
                        <div className="text-xs text-slate-500">
                          <p>Precio 1: Bs {entry.price}</p>
                          <p>Precio 2+: Bs {entry.secondaryPrice || entry.price}</p>
                          <p>Precio hermano: Bs {entry.siblingPrice || entry.price}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {tab === "participants" && (
          <TournamentPublicParticipants
            participantQuery={participantQuery}
            setParticipantQuery={setParticipantQuery}
            filteredParticipantRows={filteredParticipantRows}
          />
        )}

        {tab === "groups" && (
          <section className="mt-8 space-y-6">
            {groupSeedings.length === 0 ? (
              <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-slate-500">
                Aun no hay sembrado de grupos.
              </div>
            ) : (
              groupSeedings.map((entry) => (
                <div
                  key={`groups-${entry.category.id}`}
                  className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">
                        {entry.category.name}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {entry.category.abbreviation}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {entry.groups.map((group) => (
                      <div
                        key={`group-table-${entry.category.id}-${group.key}`}
                        className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-2)]"
                      >
                        <div className="bg-[var(--surface-2)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-blue-600 dark:text-cyan-200">
                          Grupo {group.key}
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-[420px] text-xs text-slate-600">
                            <thead className="bg-[var(--surface)] uppercase tracking-[0.2em] text-slate-500">
                              <tr>
                                <th className="px-3 py-2 text-left">Ranking</th>
                                <th className="px-3 py-2 text-left">Jugador/Equipo</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                              {group.list.map((registration) => (
                                <tr key={registration.id}>
                                  <td className="px-3 py-2">
                                    {registration.rankingNumber ?? "-"}
                                  </td>
                                  <td className="px-3 py-2">
                                    <p className="font-semibold text-slate-900">
                                      {teamLabel(registration)}
                                    </p>
                                    <p className="mt-1 text-[11px] text-slate-500">
                                      {teamMembersLabel(registration)}
                                    </p>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </section>
        )}

        {tab === "fixture" && (
          <section className="mt-8 space-y-6">
            {matchesError && (
              <p className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {matchesError}
              </p>
            )}
            <TournamentPublicFixture
              matches={safeMatches}
              categoriesById={categoriesById}
              categoryDrawTypeById={categoryDrawTypeById}
              groupStageCompleteByCategory={groupStageCompleteByCategory}
              bracketSizeByCategory={bracketSizeByCategory}
              playoffRoundsByCategory={playoffRoundsByCategory}
            />
          </section>
        )}

        {tab === "bracket" && (
          <section className="mt-8 space-y-6">
            {playoffBrackets.length === 0 ? (
              <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-slate-500">
                No hay llaves publicadas.
              </div>
            ) : (
              playoffBrackets.map((entry) => (
                <div
                  key={`bracket-${entry.category.id}`}
                  className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">
                        {entry.category.name}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {entry.category.abbreviation}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <BracketCanvas
                      categoryId={entry.category.id}
                      matches={entry.matches}
                      bronzeMatches={entry.bronzeMatches}
                      roundNumbers={entry.roundNumbers}
                      roundLabelMap={entry.roundLabelMap}
                      bracketSize={entry.bracketSize}
                      registrationMap={registrationMap}
                      labelByRegistration={labelByRegistration}
                      matchStatusByMatchId={entry.matchStatusByMatchId}
                      className="relative max-h-[80vh] min-h-[480px] overflow-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3"
                      theme={themeMode}
                      disableSwap
                      bracketState="published"
                    />
                  </div>
                </div>
              ))
            )}
          </section>
        )}

        {
          tab === "standings" && (
            <section className="mt-8 space-y-6">
              {standingsByCategoryGroups.length === 0 ? (
                <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-slate-500">
                  No hay tabla de posiciones disponible.
                </div>
              ) : (
                standingsByCategoryGroups.map((entry) => (
                  <div
                    key={`standings-${entry.category.id}`}
                    className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">
                          {entry.category.name}
                        </h3>
                        <p className="text-xs text-slate-500">
                          {entry.category.abbreviation}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-[11px] text-slate-500">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600 dark:text-cyan-200">
                        Significado de columnas
                      </p>
                      <div className="mt-2 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                        <p>PJ: Partidos jugados</p>
                        <p>PG: Partidos ganados</p>
                        <p>PP: Partidos perdidos</p>
                        <p>Pts: Puntos por partido</p>
                        <p>SG: Sets ganados</p>
                        <p>SP: Sets perdidos</p>
                        <p>DS: Diferencia de sets</p>
                        <p>PF: Puntos a favor</p>
                        <p>PC: Puntos en contra</p>
                        <p>DP: Diferencia de puntos</p>
                      </div>
                    </div>
                    <div className="mt-4 space-y-4">
                      {entry.groups.map((group) => (
                        <div
                          key={`standings-${entry.category.id}-${group.key}`}
                          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)]"
                        >
                          <div className="bg-[var(--surface-2)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-blue-600 dark:text-cyan-200">
                            Grupo {group.key}
                          </div>
                          <div className="overflow-x-auto">
                            <table className="min-w-[900px] text-[11px] text-slate-600">
                              <thead className="bg-[var(--surface)] uppercase tracking-[0.2em] text-slate-500">
                                <tr>
                                  <th className="px-3 py-2 text-left">Pos</th>
                                  <th className="px-3 py-2 text-left">Jugador/Equipo</th>
                                  <th className="px-3 py-2 text-left">PJ</th>
                                  <th className="px-3 py-2 text-left">PG</th>
                                  <th className="px-3 py-2 text-left">PP</th>
                                  <th className="px-3 py-2 text-left">Pts</th>
                                  <th className="px-3 py-2 text-left">SG</th>
                                  <th className="px-3 py-2 text-left">SP</th>
                                  <th className="px-3 py-2 text-left">DS</th>
                                  <th className="px-3 py-2 text-left">PF</th>
                                  <th className="px-3 py-2 text-left">PC</th>
                                  <th className="px-3 py-2 text-left">DP</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5">
                                {group.entries.map((entryItem, index) => {
                                const registration = registrationById.get(entryItem.id);
                                const setsDiff =
                                  entryItem.setsWon - entryItem.setsLost;
                                const pointsDiff =
                                  entryItem.pointsWon - entryItem.pointsLost;
                                return (
                                  <tr key={entryItem.id}>
                                    <td className="px-3 py-2 text-cyan-200">
                                      {index + 1}
                                    </td>
                                    <td className="px-3 py-2 font-semibold text-slate-900">
                                      {teamLabel(registration)}
                                    </td>
                                    <td className="px-3 py-2">
                                      {entryItem.matchesWon + entryItem.matchesLost}
                                    </td>
                                    <td className="px-3 py-2">{entryItem.matchesWon}</td>
                                    <td className="px-3 py-2">{entryItem.matchesLost}</td>
                                    <td className="px-3 py-2">{entryItem.points}</td>
                                    <td className="px-3 py-2">{entryItem.setsWon}</td>
                                    <td className="px-3 py-2">{entryItem.setsLost}</td>
                                    <td className="px-3 py-2">{setsDiff}</td>
                                    <td className="px-3 py-2">{entryItem.pointsWon}</td>
                                    <td className="px-3 py-2">{entryItem.pointsLost}</td>
                                    <td className="px-3 py-2">{pointsDiff}</td>
                                  </tr>
                                );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                    {entry.groups.length === 1 && entry.groups[0].entries.length > 0 && (
                      <div className="mt-5 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-xs text-slate-600">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-200">
                          Posiciones finales
                        </p>
                        <div className="mt-2 flex flex-wrap gap-3">
                          {entry.groups[0].entries.slice(0, 3).map((item, idx) => {
                            const reg = registrationById.get(item.id);
                            return (
                              <div
                                key={`${item.id}-podium`}
                                className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-[11px]"
                              >
                                {idx + 1}º {reg ? teamLabel(reg) : "N/D"}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                </div>
              ))
            )}
          </section>
        )}

        {tab === "results" && (
          <section className="mt-8 space-y-6">
            {matchesError && (
              <p className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {matchesError}
              </p>
            )}
            {resultMatches.length === 0 ? (
              <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-slate-500">
                Aun no hay resultados registrados.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {[...resultMatches]
                  .sort((a, b) => {
                    const aLive = a.liveState?.isLive ? 1 : 0;
                    const bLive = b.liveState?.isLive ? 1 : 0;
                    if (aLive !== bLive) return bLive - aLive;
                    return 0;
                  })
                  .map((match) => {
                    const category =
                      match.category ?? categoriesById.get(match.categoryId);
                    const score = formatMatchScore(match, getMatchCategory(match));
                    const scoreParts = score ? score.split(" | ") : [];
                    const activeSetIndex =
                      typeof match.liveState?.activeSet === "number"
                        ? match.liveState.activeSet
                        : null;
                    const mainScore =
                      activeSetIndex !== null && scoreParts[activeSetIndex]
                        ? scoreParts[activeSetIndex]
                        : score ?? "N/D";
                    const unitLabel =
                      tournament.sport?.name?.toLowerCase().includes("fronton")
                        ? "Cancha"
                        : "Set";
                    const detailedScore =
                      activeSetIndex !== null
                        ? null
                        : scoreParts.length
                          ? scoreParts
                              .map(
                                (part, index) =>
                                  `${unitLabel} ${index + 1}: ${part}`
                              )
                              .join(" - ")
                          : null;
                    const setLeadLabel =
                      activeSetIndex !== null && activeSetIndex > 0
                        ? (() => {
                            let aWins = 0;
                            let bWins = 0;
                            for (let i = 0; i < activeSetIndex; i += 1) {
                              const part = scoreParts[i];
                              if (!part) continue;
                              const [aRaw, bRaw] = part.split("-");
                              const aVal = Number(aRaw);
                              const bVal = Number(bRaw);
                              if (!Number.isFinite(aVal) || !Number.isFinite(bVal)) {
                                continue;
                              }
                              if (aVal > bVal) aWins += 1;
                              if (bVal > aVal) bWins += 1;
                            }
                            const label =
                              unitLabel === "Cancha" ? "Cancha a favor" : "Set a favor";
                            return `${label} ${aWins}-${bWins}`;
                          })()
                        : null;
                    const isLive = Boolean(match.liveState?.isLive);
                    const isFinished = isMatchComplete(match);
                    const dateLabel = match.scheduledDate
                      ? formatDateShort(match.scheduledDate)
                      : "Sin fecha";
                    return (
                      <div
                        key={match.id}
                        className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                              {category?.abbreviation ?? "N/D"} - {getPlayoffLabel(match)}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {dateLabel}
                              {match.startTime ? ` - ${match.startTime}` : ""}
                            </p>
                          </div>
                          {isLive && (
                            <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-rose-200">
                              En vivo
                            </span>
                          )}
                          {!isLive && isFinished && (
                            <span className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                              Finalizado
                            </span>
                          )}
                        </div>
                        <div className="mt-4 grid gap-2">
                          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-sm">
                            <span className="font-semibold text-slate-900">
                              {teamLabel(match.teamA)}
                            </span>
                            <span className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-[11px] font-semibold text-slate-600">
                              {mainScore ?? "-"}
                            </span>
                            <span className="text-right font-semibold text-slate-900">
                              {teamLabel(match.teamB)}
                            </span>
                          </div>
                          {detailedScore && (
                            <p className="text-[11px] text-slate-500">{detailedScore}</p>
                          )}
                          {setLeadLabel && (
                            <p className="text-[11px] text-slate-500">{setLeadLabel}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </section>
        )}
        {
          tab === "prizes" && (
            <section className="mt-8 space-y-6">
              {tournament.prizes.length === 0 ? (
                <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-slate-500">
                  Premios por definir.
                </div>
              ) : (
                prizesByCategory.map((entry, index) => (
                  <div
                    key={`prize-category-${entry.category?.id ?? index}`}
                    className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.25em] text-cyan-200/80">
                          Categoria
                        </p>
                        <h3 className="mt-2 text-xl font-semibold text-slate-900">
                          {entry.category?.name ?? "Categoria"}
                        </h3>
                        {entry.category?.abbreviation && (
                          <p className="mt-1 text-xs text-slate-500">
                            {entry.category.abbreviation}
                          </p>
                        )}
                      </div>
                      <span className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-xs font-semibold text-slate-600">
                        {entry.prizes.length} premio(s)
                      </span>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      {entry.prizes.map((prize) => (
                        <div
                          key={prize.id}
                          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">
                                {describePrizePlace(prize.placeFrom, prize.placeTo)}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                Desde {prize.placeFrom} hasta{" "}
                                {prize.placeTo ?? prize.placeFrom}
                              </p>
                            </div>
                            <div className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-[11px] font-semibold text-slate-600">
                              {prize.amount ? `Bs ${prize.amount}` : "Premio"}
                            </div>
                          </div>
                          <p className="mt-3 text-xs text-slate-500">
                            {prize.prizeText ?? "-"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </section>
          )
        }

        {
          tab === "contact" && (
            <section className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
              <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
                <h2 className="text-lg font-semibold text-slate-900">Contacto</h2>
                <div className="mt-4 space-y-2 text-sm text-slate-500">
                  <p>Organiza: {tournament.league?.name ?? "N/D"}</p>
                  <p>
                    Responsable: {tournament.owner?.name ?? "Sin nombre"}
                  </p>
                  <p>Correo: {tournament.owner?.email ?? "Sin correo"}</p>
                  <p>Direccion: {tournament.address ?? "Sin direccion"}</p>
                </div>
              </div>
              <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
                <h2 className="text-lg font-semibold text-slate-900">Ubicacion</h2>
                <p className="mt-4 text-sm text-slate-500">
                  Consulta las sedes y horarios en la pestaña de tiempos.
                </p>
              </div>
            </section>
          )
        }
      </div>

    </main>
  );
}



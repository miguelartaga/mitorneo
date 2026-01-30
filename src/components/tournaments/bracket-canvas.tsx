"use client";

import { useEffect, useMemo, useState } from "react";

type BracketPlayer = {
  firstName: string;
  lastName: string;
};

export type BracketRegistration = {
  id: string;
  teamName?: string | null;
  player?: BracketPlayer | null;
  partner?: BracketPlayer | null;
  partnerTwo?: BracketPlayer | null;
};

export type BracketMatch = {
  id: string;
  roundNumber?: number | null;
  winnerSide?: "A" | "B" | null;
  teamAId?: string | null;
  teamBId?: string | null;
  createdAt?: string;
  orderHint?: number;
};

type BracketContestant = {
  players: { title: string }[];
  entryStatus?: string;
};

type BracketSide = {
  contestantId?: string;
  isWinner?: boolean;
  title?: string;
};

type BracketMatchEntry = {
  roundIndex: number;
  order: number;
  sides: BracketSide[];
  matchStatus?: string;
  matchId?: string;
};

type BracketBuildParams = {
  categoryId: string;
  bracketSize?: number;
  matches: BracketMatch[];
  bronzeMatches?: BracketMatch[];
  roundNumbers: number[];
  roundLabelMap?: Map<number, string>;
  registrationMap: Map<string, BracketRegistration>;
  labelByRegistration: Map<string, string>;
  matchStatusByMatchId?: Map<string, string>;
  bracketState?: "draft" | "locked" | "published";
  teamNameOnly?: boolean;
};

const formatTeamName = (
  registration?: BracketRegistration,
  teamNameOnly?: boolean
) => {
  if (!registration) return "N/D";
  const teamName = registration.teamName?.trim();
  if (teamNameOnly && teamName) return teamName;
  const players = [
    registration.player,
    registration.partner,
    registration.partnerTwo,
  ].filter(Boolean) as BracketPlayer[];
  const playersLabel = players
    .map((player) => `${player.firstName} ${player.lastName}`.trim())
    .join(" / ");
  if (teamName) {
    return playersLabel ? `${teamName} (${playersLabel})` : teamName;
  }
  return playersLabel || "N/D";
};

const formatPlayoffRoundLabel = (roundSize: number, roundNumber: number) => {
  if (roundSize === 2) return "Final";
  if (roundSize === 4) return "Semifinal";
  if (roundSize === 8) return "Cuartos";
  if (roundSize === 16) return "Ronda de 16";
  if (roundSize === 32) return "Ronda de 32";
  if (roundSize === 64) return "Ronda de 64";
  if (roundSize > 1) return `Ronda de ${roundSize}`;
  return `Ronda ${roundNumber}`;
};

const buildBracketData = ({
  categoryId,
  bracketSize,
  matches,
  bronzeMatches,
  roundNumbers,
  roundLabelMap,
  registrationMap,
  labelByRegistration,
  matchStatusByMatchId,
  bracketState,
  teamNameOnly,
}: BracketBuildParams) => {
  const safeMatches = Array.isArray(matches) ? matches : [];
  const safeBronzeMatches = Array.isArray(bronzeMatches) ? bronzeMatches : [];
  const safeRoundNumbers = Array.isArray(roundNumbers) ? roundNumbers : [];
  const contestants: Record<string, BracketContestant> = {};
  const ensureRegistrationContestant = (id: string) => {
    if (contestants[id]) return;
    const registration = registrationMap.get(id);
    const title =
      formatTeamName(registration, teamNameOnly) ||
      (registration ? "Equipo" : "Participante sin datos");
    contestants[id] = {
      players: [{ title }],
      entryStatus: labelByRegistration.get(id) ?? undefined,
    };
  };
  const ensurePlaceholderContestant = (id: string, title: string) => {
    if (contestants[id]) return;
    contestants[id] = {
      players: [{ title }],
    };
  };
  const allMatches = [...safeMatches, ...safeBronzeMatches];
  allMatches.forEach((match) => {
    if (match.teamAId) ensureRegistrationContestant(match.teamAId);
    if (match.teamBId) ensureRegistrationContestant(match.teamBId);
  });

  const normalizedRoundNumbers =
    safeRoundNumbers.length > 0
      ? safeRoundNumbers
      : [safeMatches[0]?.roundNumber ?? 1];
  const roundIndexMap = new Map<number, number>();
  normalizedRoundNumbers.forEach((roundNumber, index) => {
    roundIndexMap.set(roundNumber, index);
  });

  const rounds = normalizedRoundNumbers.map((roundNumber, index) => {
    const roundSize =
      typeof bracketSize === "number"
        ? Math.max(2, Math.round(bracketSize / 2 ** index) || 2)
        : 2;
    return {
      name:
        roundLabelMap?.get(roundNumber) ??
        formatPlayoffRoundLabel(roundSize, roundNumber),
    };
  });

  const orderTracker = new Map<number, number>();
  const bracketMatches: BracketMatchEntry[] = safeMatches
    .slice()
    .sort((a, b) => {
      const roundA =
        roundIndexMap.get(a.roundNumber ?? normalizedRoundNumbers[0]) ?? 0;
      const roundB =
        roundIndexMap.get(b.roundNumber ?? normalizedRoundNumbers[0]) ?? 0;
      if (roundA !== roundB) return roundA - roundB;
      const orderA = typeof a.orderHint === "number" ? a.orderHint : null;
      const orderB = typeof b.orderHint === "number" ? b.orderHint : null;
      if (orderA !== null || orderB !== null) {
        if (orderA === null) return 1;
        if (orderB === null) return -1;
        if (orderA !== orderB) return orderA - orderB;
      }
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeA - timeB;
    })
    .map((match) => {
      const roundNumber = match.roundNumber ?? normalizedRoundNumbers[0];
      const roundIndex = roundIndexMap.get(roundNumber) ?? 0;
      const nextOrder = orderTracker.get(roundNumber) ?? 0;
      orderTracker.set(roundNumber, nextOrder + 1);
      const winnerSide = match.winnerSide ?? null;

      const buildSide = (
        teamId: string | null | undefined,
        sideIndex: 0 | 1,
        roundIndexValue: number,
        hasOpponent: boolean
      ): BracketSide => {
        if (roundIndexValue > 0 && bracketState === "draft") {
          if (teamId) {
            return {
              contestantId: teamId,
              isWinner:
                winnerSide === (sideIndex === 0 ? "A" : "B") ? true : undefined,
            };
          }
          const pendingId = `pending-${categoryId}-${match.id}-${sideIndex}`;
          ensurePlaceholderContestant(pendingId, "Por definir");
          return { contestantId: pendingId };
        }
        if (teamId) {
          return {
            contestantId: teamId,
            isWinner:
              winnerSide === (sideIndex === 0 ? "A" : "B") ? true : undefined,
          };
        }
        if (roundIndexValue === 0) {
          if (hasOpponent) {
            const byeId = `bye-${categoryId}-${match.id}-${sideIndex}`;
            ensurePlaceholderContestant(byeId, "Bye");
            return { contestantId: byeId };
          }
          const emptyId = `empty-${categoryId}-${match.id}-${sideIndex}`;
          ensurePlaceholderContestant(emptyId, "Disponible");
          return { contestantId: emptyId };
        }
        const pendingId = `pending-${categoryId}-${match.id}-${sideIndex}`;
        ensurePlaceholderContestant(pendingId, "Por definir");
        return { contestantId: pendingId };
      };

      const hasTeamA = Boolean(match.teamAId);
      const hasTeamB = Boolean(match.teamBId);
      const matchStatus =
        matchStatusByMatchId?.get(match.id) ??
        roundLabelMap?.get(roundNumber);

      return {
        roundIndex,
        order: nextOrder,
        sides: [
          buildSide(match.teamAId, 0, roundIndex, hasTeamB),
          buildSide(match.teamBId, 1, roundIndex, hasTeamA),
        ],
        matchStatus,
        matchId: match.id,
      };
    });

  return {
    contestants,
    rounds,
    matches: bracketMatches,
  };
};

export type BracketCanvasProps = {
  categoryId: string;
  matches: BracketMatch[];
  bronzeMatches?: BracketMatch[];
  roundNumbers: number[];
  roundLabelMap?: Map<number, string>;
  bracketSize?: number;
  registrationMap: Map<string, BracketRegistration>;
  labelByRegistration: Map<string, string>;
  matchStatusByMatchId?: Map<string, string>;
  className?: string;
  theme?: "light" | "dark";
  allowVerticalScroll?: boolean;
  watermarkUrl?: string;
  watermarkUrlDark?: string;
  watermarkText?: string;
  teamNameOnly?: boolean;
  swapMode?: "drag" | "select";
  selectableRegistrationIds?: string[];
  onSwapSides?: (
    from: { matchId: string; side: "A" | "B" },
    to: { matchId: string; side: "A" | "B" }
  ) => Promise<void>;
  onSelectSwap?: (
    matchId: string,
    side: "A" | "B",
    registrationId: string
  ) => Promise<void> | void;
  disableSwap?: boolean;
  occupiedRegistrationIds?: Set<string>;
  bracketState?: "draft" | "locked" | "published";
};

type DragInfo = {
  matchId: string;
  side: "A" | "B";
  contestantId: string | null;
  roundIndex: number;
  order: number;
};

type BracketInstance = ReturnType<CreateBracketFn>;

const bracketOptions = {
  width: "100%",
  height: "420px",
  rootBorderColor: "transparent",
  wrapperBorderColor: "transparent",
  rootBgColor: "transparent",
  matchTextColor: "#0f172a",
  connectionLinesColor: "rgba(79,70,229,0.35)",
  highlightedConnectionLinesColor: "#6366f1",
  matchStatusBgColor: "#eef2ff",
  verticalScrollMode: "native" as const,
  navButtonsPosition: "hidden" as const,
  rootFontFamily: "Inter, system-ui, sans-serif",
  matchFontSize: 13,
  distanceBetweenScorePairs: 8,
  matchMinVerticalGap: 28,
  matchHorMargin: 18,
};

export const BracketCanvas = ({
  categoryId,
  matches,
  bronzeMatches,
  roundNumbers,
  roundLabelMap,
  bracketSize,
  registrationMap,
  labelByRegistration,
  matchStatusByMatchId,
  className,
  theme = "light",
  allowVerticalScroll = true,
  watermarkUrl,
  watermarkUrlDark,
  watermarkText = "mitorneo.com.bo",
  teamNameOnly = false,
  swapMode = "drag",
  selectableRegistrationIds = [],
  onSwapSides,
  onSelectSwap,
  disableSwap,
  occupiedRegistrationIds = new Set<string>(),
  bracketState = "draft",
}: BracketCanvasProps) => {
  const data = useMemo(
    () =>
      buildBracketData({
        categoryId,
        bracketSize,
        matches,
        bronzeMatches,
        roundNumbers,
        roundLabelMap,
        registrationMap,
        labelByRegistration,
        matchStatusByMatchId,
        bracketState,
        teamNameOnly,
      }),
    [
      categoryId,
      bracketSize,
      matches,
      roundNumbers,
      roundLabelMap,
      registrationMap,
      labelByRegistration,
      matchStatusByMatchId,
      bracketState,
      teamNameOnly,
    ]
  );
  const missingOrderHintByRound = useMemo(() => {
    if (bracketState !== "draft") return [];
    const map = new Map<number, number>();
    data.matches
      .filter((match) => match.roundIndex > 0)
      .forEach((match) => {
        const hint = matches.find((item) => item.id === match.matchId)?.orderHint;
        if (typeof hint !== "number") {
          map.set(match.roundIndex, (map.get(match.roundIndex) ?? 0) + 1);
        }
      });
    return Array.from(map.entries());
  }, [bracketState, data.matches, matches]);
  if (missingOrderHintByRound.length > 0) {
    console.warn(
      "[bracket] missing orderHint in rounds:",
      missingOrderHintByRound.map(([round, count]) => `r${round + 1}=${count}`)
    );
  }
  const wrapperClassName = [
    className ??
      "relative overflow-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-sm",
    theme === "dark" ? "bracket-theme-dark" : null,
  ]
    .filter(Boolean)
    .join(" ");
  const [viewportWidth, setViewportWidth] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setViewportWidth(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return (
    <>
      <style jsx global>{`
        .simple-bracket {
          position: relative;
          overflow-x: auto;
          overflow-y: hidden;
          min-height: 320px;
          padding: 8px;
          -webkit-overflow-scrolling: touch;
        }
        .simple-bracket.scroll-y {
          overflow-y: auto;
        }
        .simple-bracket-grid {
          position: relative;
          min-height: 320px;
        }
        .simple-bracket-watermark {
          position: absolute;
          inset: 0;
          z-index: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          opacity: 0.08;
          background-repeat: no-repeat;
          background-position: center;
          background-size: 520px auto;
        }
        .simple-bracket-watermark span {
          font-size: 40px;
          font-weight: 700;
          letter-spacing: 0.35em;
          text-transform: uppercase;
          color: #1e293b;
        }
        .simple-bracket-lines {
          position: absolute;
          inset: 0;
          z-index: 1;
          fill: none;
          stroke: rgba(99, 102, 241, 0.35);
          stroke-width: 2;
        }
        .simple-bracket-round-column {
          position: absolute;
          top: 0;
          z-index: 2;
          display: flex;
          flex-direction: column;
          align-items: stretch;
        }
        .simple-bracket-round-title {
          font-size: 10px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          font-weight: 700;
          color: #475569;
          text-align: center;
          margin-bottom: 12px;
        }
        .simple-bracket-match {
          position: absolute;
          left: 0;
          right: 0;
          border-radius: 14px;
          border: 1px solid #e2e8f0;
          background: #fff;
          box-shadow: 0 12px 32px -24px rgba(15, 23, 42, 0.5);
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .simple-bracket-side {
          position: relative;
          border-radius: 10px;
          border: 1px solid #e5e7eb;
          padding: 6px 28px 6px 8px;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: #0f172a;
          background: #f8fafc;
        }
        .simple-bracket-side-label {
          display: block;
          padding-right: 72px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .simple-bracket-side.winner {
          border-color: #6366f1;
          background: #eef2ff;
          color: #312e81;
          box-shadow: 0 10px 20px -16px rgba(79, 70, 229, 0.6);
        }
        .simple-bracket-side.loser {
          color: #94a3b8;
        }
        .simple-bracket-side select {
          width: 100%;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          padding: 4px 6px;
          font-size: 12px;
          background: #fff;
        }
        .simple-bracket-meta {
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.18em;
          color: #6366f1;
        }
        .simple-bracket-winner {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border-radius: 999px;
          background: #eef2ff;
          color: #4338ca;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.18em;
          padding: 2px 8px;
          text-transform: uppercase;
        }
        .simple-bracket-runner {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border-radius: 999px;
          background: #f1f5f9;
          color: #475569;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.18em;
          padding: 2px 8px;
          text-transform: uppercase;
        }
        .bracket-theme-dark .simple-bracket-lines {
          stroke: rgba(148, 163, 184, 0.35);
        }
        .bracket-theme-dark .simple-bracket-round-title {
          color: #cbd5f5;
        }
        .bracket-theme-dark .simple-bracket-match {
          border-color: rgba(148, 163, 184, 0.2);
          background: rgba(15, 23, 42, 0.7);
          box-shadow: 0 16px 32px -24px rgba(15, 23, 42, 0.8);
        }
        .bracket-theme-dark .simple-bracket-side {
          border-color: rgba(148, 163, 184, 0.25);
          background: rgba(30, 41, 59, 0.9);
          color: #e2e8f0;
        }
        .bracket-theme-dark .simple-bracket-side.loser {
          color: #64748b;
        }
        .bracket-theme-dark .simple-bracket-side.winner {
          border-color: rgba(56, 189, 248, 0.6);
          background: rgba(2, 132, 199, 0.15);
          color: #e0f2fe;
        }
        .bracket-theme-dark .simple-bracket-meta {
          color: #7dd3fc;
        }
        .bracket-theme-dark .simple-bracket-winner {
          background: rgba(2, 132, 199, 0.2);
          color: #bae6fd;
        }
        .bracket-theme-dark .simple-bracket-runner {
          background: rgba(30, 41, 59, 0.8);
          color: #cbd5e1;
        }
        .simple-bracket-side-badge {
          position: absolute;
          right: 6px;
          bottom: 6px;
          border-radius: 999px;
          padding: 2px 6px;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          background: #eef2ff;
          color: #4338ca;
        }
        .simple-bracket-side-badge.runner {
          background: #f1f5f9;
          color: #475569;
        }
        .bracket-theme-dark .simple-bracket-side-badge {
          background: rgba(2, 132, 199, 0.2);
          color: #bae6fd;
        }
        .bracket-theme-dark .simple-bracket-side-badge.runner {
          background: rgba(30, 41, 59, 0.8);
          color: #cbd5e1;
        }
      `}</style>
      <div className={wrapperClassName}>
        {data.rounds.length === 0 ? (
          <div className="text-sm text-slate-500">Sin llaves</div>
        ) : (
          <>
            {(() => {
              const isRealContestant = (id?: string) =>
                Boolean(id) &&
                !String(id).startsWith("bye-") &&
                !String(id).startsWith("empty-") &&
                !String(id).startsWith("pending-");

              const getSideId = (side?: BracketSide) =>
                side?.contestantId ?? undefined;

              const roundsMatches = data.rounds.map((round, roundIndex) => ({
                roundIndex,
                name: round.name,
                matches: data.matches
                  .filter((match) => match.roundIndex === roundIndex)
                  .sort((a, b) => a.order - b.order),
              }));

              const draftRounds =
                bracketState === "draft" && roundsMatches.length > 0
                  ? (() => {
                      const firstRound = roundsMatches[0].matches;
                      const roundCount = roundsMatches.length;
                      const draft = [] as Array<{
                        name: string;
                        matches: Array<{
                          matchId?: string;
                          order: number;
                          aId?: string;
                          bId?: string;
                        }>;
                      }>;

                      const firstMatches = firstRound.map((match) => {
                        const aId = isRealContestant(getSideId(match.sides[0]))
                          ? getSideId(match.sides[0])
                          : undefined;
                        const bId = isRealContestant(getSideId(match.sides[1]))
                          ? getSideId(match.sides[1])
                          : undefined;
                        return {
                          matchId: match.matchId,
                          order: match.order,
                          aId,
                          bId,
                        };
                      });

                      draft.push({
                        name: roundsMatches[0].name,
                        matches: firstMatches,
                      });

                      for (
                        let roundIndex = 1;
                        roundIndex < roundCount;
                        roundIndex += 1
                      ) {
                        const prev = draft[roundIndex - 1].matches;
                        const nextMatches: Array<{
                          matchId?: string;
                          order: number;
                          aId?: string;
                          bId?: string;
                        }> = [];
                        const matchesCount = Math.max(
                          1,
                          Math.floor(prev.length / 2)
                        );
                        for (let i = 0; i < matchesCount; i += 1) {
                          const feederA = prev[i * 2];
                          const feederB = prev[i * 2 + 1];
                          const allowAutoAdvance = roundIndex === 1;
                          const aId = allowAutoAdvance
                            ? feederA && feederA.aId && !feederA.bId
                              ? feederA.aId
                              : feederA && feederA.bId && !feederA.aId
                              ? feederA.bId
                              : undefined
                            : undefined;
                          const bId = allowAutoAdvance
                            ? feederB && feederB.aId && !feederB.bId
                              ? feederB.aId
                              : feederB && feederB.bId && !feederB.aId
                              ? feederB.bId
                              : undefined
                            : undefined;
                          nextMatches.push({
                            order: i,
                            aId,
                            bId,
                          });
                        }
                        draft.push({
                          name:
                            roundsMatches[roundIndex]?.name ??
                            `Ronda ${roundIndex + 1}`,
                          matches: nextMatches,
                        });
                      }

                      return draft;
                    })()
                  : null;

              const renderRounds = draftRounds
                ? draftRounds.map((round, roundIndex) => ({
                    roundIndex,
                    name: round.name,
                    matches: round.matches.map((match) => ({
                      matchId: match.matchId,
                      order: match.order,
                      displayA: match.aId,
                      displayB: match.bId,
                    })),
                  }))
                : roundsMatches.map((round) => ({
                    roundIndex: round.roundIndex,
                    name: round.name,
                    matches: round.matches.map((match) => ({
                      matchId: match.matchId,
                      order: match.order,
                      displayA: isRealContestant(getSideId(match.sides[0]))
                        ? getSideId(match.sides[0])
                        : undefined,
                      displayB: isRealContestant(getSideId(match.sides[1]))
                        ? getSideId(match.sides[1])
                        : undefined,
                      rawSides: match.sides,
                      matchStatus: match.matchStatus,
                    })),
                  }));

              const isMobile =
                typeof viewportWidth === "number" && viewportWidth < 640;
              const matchHeight = isMobile ? 108 : 120;
              const matchWidth = isMobile ? 260 : 300;
              const columnGap = isMobile ? 96 : 140;
              const step = matchHeight + (isMobile ? 40 : 52);
              const roundCount = renderRounds.length;
              const firstCount = Math.max(1, renderRounds[0]?.matches.length ?? 1);
              const totalWidth =
                roundCount * matchWidth + Math.max(0, roundCount - 1) * columnGap;

              const getCenterY = (roundIndex: number, matchIndex: number) => {
                const stepR = step * Math.pow(2, roundIndex);
                const offset = stepR / 2;
                return offset + stepR * matchIndex;
              };
              const bronzeCount = bronzeMatches?.length ?? 0;
              const bronzeExtra = bronzeCount > 0 ? matchHeight + 56 : 0;
              const totalHeight = firstCount * step + bronzeExtra;

              const lines: Array<{
                d: string;
                key: string;
              }> = [];

              renderRounds.forEach((round, roundIndex) => {
                if (roundIndex >= roundCount - 1) return;
                const nextLeft = roundIndex * (matchWidth + columnGap) + matchWidth + columnGap;
                const currentLeft = roundIndex * (matchWidth + columnGap) + matchWidth;
                const midX = currentLeft + columnGap / 2;
                round.matches.forEach((match, matchIndex) => {
                  const targetIndex = Math.floor(matchIndex / 2);
                  const y1 = getCenterY(roundIndex, matchIndex);
                  const y2 = getCenterY(roundIndex + 1, targetIndex);
                  const x1 = currentLeft;
                  const x2 = nextLeft - columnGap;
                  const d = `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`;
                  lines.push({
                    d,
                    key: `${roundIndex}-${matchIndex}`,
                  });
                });
              });

              const renderBronze = () => {
                if (!bronzeMatches || bronzeMatches.length === 0) return null;
                const match = bronzeMatches[0];
                const displayA = match.teamAId ?? undefined;
                const displayB = match.teamBId ?? undefined;
                const hasTeamA = Boolean(displayA);
                const hasTeamB = Boolean(displayB);
                const winnerSide = match.winnerSide ?? null;
                const top = firstCount * step + 32;
                const columnLeft = (roundCount - 1) * (matchWidth + columnGap);

                const renderSideStatic = (
                  teamId?: string | null,
                  hasOpponent?: boolean,
                  sideKey?: "A" | "B"
                ) => {
                  if (teamId) {
                    const registration = registrationMap.get(teamId);
                    const label = formatTeamName(registration, teamNameOnly);
                    const seedLabel = labelByRegistration.get(teamId);
                    const isWinner =
                      Boolean(winnerSide) && sideKey && winnerSide === sideKey;
                    const sideClass = [
                      "simple-bracket-side",
                      isWinner ? "winner" : null,
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <div className={sideClass}>
                        <span className="simple-bracket-side-label">
                          {seedLabel ? `${seedLabel} ` : ""}
                          {label}
                        </span>
                        {isWinner && (
                          <span className="simple-bracket-side-badge">3er lugar</span>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div className="simple-bracket-side">
                      {hasOpponent ? "Bye" : "Por definir"}
                    </div>
                  );
                };

                return (
                  <div
                    className="simple-bracket-round-column"
                    style={{ left: columnLeft, width: matchWidth }}
                  >
                    <div className="simple-bracket-round-title">3er lugar</div>
                    <div
                      className="simple-bracket-match"
                      style={{ top, height: matchHeight }}
                    >
                      <div className="simple-bracket-meta">3er lugar</div>
                      {renderSideStatic(displayA, hasTeamB, "A")}
                      {renderSideStatic(displayB, hasTeamA, "B")}
                    </div>
                  </div>
                );
              };

              return (
                <div
                  className={`simple-bracket${allowVerticalScroll ? " scroll-y" : ""}`}
                  style={{ height: allowVerticalScroll ? undefined : totalHeight }}
                >
                  <div
                    className="simple-bracket-grid"
                    style={{
                      height: totalHeight,
                      width: totalWidth,
                    }}
                  >
                    {((theme === "dark" ? watermarkUrlDark : watermarkUrl) || watermarkText) && (
                      <div
                        className="simple-bracket-watermark"
                        style={{
                          backgroundImage: (theme === "dark" ? watermarkUrlDark : watermarkUrl)
                            ? `url(${theme === "dark" ? watermarkUrlDark : watermarkUrl})`
                            : undefined,
                        }}
                        aria-hidden="true"
                      >
                        {watermarkText ? <span>{watermarkText}</span> : null}
                      </div>
                    )}
                    <svg
                      className="simple-bracket-lines"
                      width={totalWidth}
                      height={totalHeight}
                      viewBox={`0 0 ${totalWidth} ${totalHeight}`}
                      preserveAspectRatio="none"
                    >
                      {lines.map((line) => (
                        <path key={line.key} d={line.d} />
                      ))}
                    </svg>
                    {renderRounds.map((round, roundIndex) => {
                      const columnLeft = roundIndex * (matchWidth + columnGap);
                      return (
                        <div
                          key={`${round.roundIndex}-${round.name}`}
                          className="simple-bracket-round-column"
                          style={{ left: columnLeft, width: matchWidth }}
                        >
                          <div className="simple-bracket-round-title">
                            {round.name}
                          </div>
                          {round.matches.map((match) => {
                            const matchIndex = match.order ?? 0;
                            const top = getCenterY(roundIndex, matchIndex) - matchHeight / 2;
                            const displayA = match.displayA;
                            const displayB = match.displayB;
                            const hasTeamA = Boolean(displayA);
                            const hasTeamB = Boolean(displayB);
                            const canSelect =
                              bracketState === "draft" &&
                              swapMode === "select" &&
                              Boolean(onSelectSwap) &&
                              selectableRegistrationIds.length > 0 &&
                              round.roundIndex === 0;
                            const isFinalRound = roundIndex === roundCount - 1;
                            const sideAWon = Boolean(match.rawSides?.[0]?.isWinner);
                            const sideBWon = Boolean(match.rawSides?.[1]?.isWinner);

                            const renderSide = (
                              side: BracketSide | undefined,
                              sideKey: "A" | "B",
                              hasOpponent: boolean,
                              displayId?: string
                            ) => {
                              const contestantId = side?.contestantId;
                              const isPlaceholder =
                                contestantId?.startsWith("bye-") ||
                                contestantId?.startsWith("empty-") ||
                                contestantId?.startsWith("pending-");
                              const currentId = isPlaceholder ? "" : contestantId ?? "";

                              if (canSelect) {
                                const effectiveId = displayId ?? currentId;
                                const currentRegistration =
                                  effectiveId && registrationMap.has(effectiveId)
                                    ? registrationMap.get(effectiveId)
                                    : undefined;
                                const currentLabel = effectiveId
                                  ? formatTeamName(currentRegistration, teamNameOnly)
                                  : "";
                                const currentSeedLabel = effectiveId
                                  ? labelByRegistration.get(effectiveId)
                                  : undefined;
                                const currentExistsInOptions =
                                  effectiveId &&
                                  selectableRegistrationIds.includes(effectiveId);
                                return (
                                  <div className="simple-bracket-side">
                                    <select
                                      disabled={Boolean(disableSwap)}
                                      value={effectiveId || ""}
                                      onChange={(event) => {
                                        const value = event.target.value;
                                        if (!value) return;
                                        onSelectSwap?.(
                                          match.matchId ?? "",
                                          sideKey,
                                          value
                                        );
                                      }}
                                    >
                                      <option value="" disabled>
                                        Seleccionar
                                      </option>
                                      <option value="__BYE__">Bye</option>
                                      {effectiveId && !currentExistsInOptions ? (
                                        <option value={effectiveId}>
                                          {currentSeedLabel
                                            ? `${currentSeedLabel} - ${currentLabel}`
                                            : currentLabel}
                                        </option>
                                      ) : null}
                                      {selectableRegistrationIds.map((id) => {
                                        const registration = registrationMap.get(id);
                                        const label = formatTeamName(registration, teamNameOnly);
                                        const seedLabel = labelByRegistration.get(id);
                                        const isOccupied =
                                          occupiedRegistrationIds.has(id) &&
                                          id !== currentId;
                                        return (
                                          <option key={id} value={id}>
                                            {seedLabel
                                              ? `${seedLabel} - ${label}`
                                              : label}
                                            {isOccupied ? " (ocupado)" : ""}
                                          </option>
                                        );
                                      })}
                                    </select>
                                  </div>
                                );
                              }

                              if (displayId) {
                                const registration = registrationMap.get(displayId);
                                const label = formatTeamName(registration, teamNameOnly);
                                const seedLabel = labelByRegistration.get(displayId);
                                const isWinner =
                                  sideKey === "A" ? sideAWon : sideBWon;
                                const isLoser =
                                  (sideKey === "A" ? sideBWon : sideAWon) &&
                                  !isWinner;
                                const sideClass = [
                                  "simple-bracket-side",
                                  isWinner ? "winner" : null,
                                  isLoser ? "loser" : null,
                                ]
                                  .filter(Boolean)
                                  .join(" ");
                                const badge =
                                  isFinalRound && (sideKey === "A" ? sideAWon : sideBWon)
                                    ? "Campeon"
                                    : isFinalRound && (sideKey === "A" ? sideBWon : sideAWon)
                                      ? "2do lugar"
                                      : null;
                                return (
                                  <div className={sideClass}>
                                    <span className="simple-bracket-side-label">
                                      {seedLabel ? `${seedLabel} ` : ""}
                                      {label}
                                    </span>
                                    {badge && (
                                      <span
                                        className={`simple-bracket-side-badge${
                                          badge === "Campeon" ? "" : " runner"
                                        }`}
                                      >
                                        {badge}
                                      </span>
                                    )}
                                  </div>
                                );
                              }

                              if (round.roundIndex === 0) {
                                return (
                                  <div className="simple-bracket-side">
                                    {hasOpponent ? "Bye" : "Disponible"}
                                  </div>
                                );
                              }

                              return (
                                <div className="simple-bracket-side">Por definir</div>
                              );
                            };

                            return (
                              <div
                                key={match.matchId ?? match.order}
                                className="simple-bracket-match"
                                style={{ top, height: matchHeight }}
                              >
                                <div className="simple-bracket-meta">
                                  {match.matchStatus ?? round.name}
                                </div>
                                {renderSide(
                                  match.rawSides ? match.rawSides[0] : undefined,
                                  "A",
                                  hasTeamB,
                                  displayA
                                )}
                                {renderSide(
                                  match.rawSides ? match.rawSides[1] : undefined,
                                  "B",
                                  hasTeamA,
                                  displayB
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                    {renderBronze()}
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </div>
    </>
  );
};

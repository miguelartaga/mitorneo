export type Sponsor = {
    id?: string;
    name?: string | null;
    imageUrl: string;
    linkUrl?: string | null;
};

export type Club = {
    id: string;
    name: string;
    address?: string | null;
    courtsCount?: number | null;
};

export type Category = {
    id: string;
    name: string;
    abbreviation: string;
    sport?: { id: string; name: string } | null;
};

export type TournamentCategory = {
    categoryId: string;
    price: string;
    secondaryPrice: string;
    siblingPrice: string;
    drawType?: string | null;
    category: Category;
};

export type Player = {
    id: string;
    firstName: string;
    lastName: string;
    city?: string | null;
    country?: string | null;
    photoUrl?: string | null;
};

export type Registration = {
    id: string;
    categoryId: string;
    playerId: string;
    partnerId?: string | null;
    partnerTwoId?: string | null;
    teamName?: string | null;
    groupName?: string | null;
    rankingNumber?: number | null;
    player: Player;
    partner?: Player | null;
    partnerTwo?: Player | null;
    createdAt: string;
};

export type Match = {
    id: string;
    categoryId: string;
    groupName?: string | null;
    stage: string;
    isBronzeMatch?: boolean | null;
    roundNumber?: number | null;
    orderHint?: number | null;
    createdAt?: string | null;
    scheduledDate?: string | null;
    startTime?: string | null;
    courtNumber?: number | null;
    club?: Club | null;
    games?: unknown;
    liveState?: {
        isLive?: boolean;
        pointScore?: { A?: string | null; B?: string | null };
        activeSet?: number | null;
        bonusByPlayer?: Record<string, { double?: number; triple?: number }>;
    } | null;
    winnerSide?: "A" | "B" | null;
    outcomeType?: string | null;
    outcomeSide?: "A" | "B" | null;
    teamAId?: string | null;
    teamBId?: string | null;
    teamA?: Registration | null;
    teamB?: Registration | null;
    category?: Category | null;
};

export type PlayoffSlotPublic = {
    categoryId: string;
    position: number;
    entrantId?: string | null;
};

export type Prize = {
    id: string;
    categoryId: string;
    placeFrom: number;
    placeTo?: number | null;
    amount?: string | null;
    prizeText?: string | null;
    category?: Category | null;
};

export type TournamentPublicData = {
    id: string;
    name: string;
    description?: string | null;
    photoUrl?: string | null;
    address?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    registrationDeadline?: string | null;
    rulesText?: string | null;
    liveStreamTitle?: string | null;
    liveStreamUrl?: string | null;
    liveStreams?: { title?: string | null; url?: string | null }[];
    rankingEnabled?: boolean;
    playDays: string[];
    schedulePublished?: boolean;
    groupsPublished?: boolean;
    playoffsPublished?: boolean;
    sport?: { id: string; name: string } | null;
    league?: { id: string; name: string; photoUrl?: string | null } | null;
    owner?: { name?: string | null; email?: string | null } | null;
    clubs: Club[];
    sponsors: Sponsor[];
    categories: TournamentCategory[];
    registrations: Registration[];
    matches: Match[];
    playoffSlots?: PlayoffSlotPublic[];
    prizes: Prize[];
    groupPoints?: {
        winPoints: number;
        winWithoutGameLossPoints: number;
        lossPoints: number;
        lossWithGameWinPoints: number;
        tiebreakerOrder?: unknown;
    } | null;
};

export type ParticipantRow = {
    id: string;
    player: Player;
    category: Category;
    teamName: string | null;
    location: string;
    createdAt: string;
};

-- CreateTable
CREATE TABLE "LeaguePermission" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaguePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentPermission" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentPermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeaguePermission_leagueId_userId_key" ON "LeaguePermission"("leagueId", "userId");

-- CreateIndex
CREATE INDEX "LeaguePermission_leagueId_idx" ON "LeaguePermission"("leagueId");

-- CreateIndex
CREATE INDEX "LeaguePermission_userId_idx" ON "LeaguePermission"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentPermission_tournamentId_userId_key" ON "TournamentPermission"("tournamentId", "userId");

-- CreateIndex
CREATE INDEX "TournamentPermission_tournamentId_idx" ON "TournamentPermission"("tournamentId");

-- CreateIndex
CREATE INDEX "TournamentPermission_userId_idx" ON "TournamentPermission"("userId");

-- AddForeignKey
ALTER TABLE "LeaguePermission" ADD CONSTRAINT "LeaguePermission_leagueId_fkey"
    FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaguePermission" ADD CONSTRAINT "LeaguePermission_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentPermission" ADD CONSTRAINT "TournamentPermission_tournamentId_fkey"
    FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentPermission" ADD CONSTRAINT "TournamentPermission_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

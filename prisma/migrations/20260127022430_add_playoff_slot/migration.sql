-- CreateEnum
CREATE TYPE "PlayoffStatus" AS ENUM ('DRAFT', 'LOCKED', 'PUBLISHED');

-- AlterTable
ALTER TABLE "TournamentCategory" ADD COLUMN     "playoffStatus" "PlayoffStatus" NOT NULL DEFAULT 'DRAFT';

-- CreateTable
CREATE TABLE "PlayoffSlot" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "bracketId" TEXT,
    "position" INTEGER NOT NULL,
    "entrantId" TEXT,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayoffSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayoffSlot_entrantId_idx" ON "PlayoffSlot"("entrantId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayoffSlot_tournamentId_categoryId_position_key" ON "PlayoffSlot"("tournamentId", "categoryId", "position");

-- AddForeignKey
ALTER TABLE "PlayoffSlot" ADD CONSTRAINT "PlayoffSlot_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayoffSlot" ADD CONSTRAINT "PlayoffSlot_tournamentId_categoryId_fkey" FOREIGN KEY ("tournamentId", "categoryId") REFERENCES "TournamentCategory"("tournamentId", "categoryId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayoffSlot" ADD CONSTRAINT "PlayoffSlot_entrantId_fkey" FOREIGN KEY ("entrantId") REFERENCES "TournamentRegistration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

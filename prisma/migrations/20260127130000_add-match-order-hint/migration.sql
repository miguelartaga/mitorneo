-- Add orderHint to TournamentMatch for stable bracket ordering
ALTER TABLE "TournamentMatch" ADD COLUMN "orderHint" INTEGER;


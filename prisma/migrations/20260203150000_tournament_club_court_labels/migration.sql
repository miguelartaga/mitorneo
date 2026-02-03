-- Add custom court labels per club
ALTER TABLE "TournamentClub" ADD COLUMN "courtLabels" JSONB;

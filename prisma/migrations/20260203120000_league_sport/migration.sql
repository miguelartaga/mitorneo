-- Add sport relation to League and backfill existing data.
ALTER TABLE "League" ADD COLUMN "sportId" TEXT;

UPDATE "League"
SET "sportId" = (
  SELECT "id"
  FROM "Sport"
  ORDER BY "createdAt" ASC
  LIMIT 1
)
WHERE "sportId" IS NULL;

ALTER TABLE "League" ALTER COLUMN "sportId" SET NOT NULL;

ALTER TABLE "League"
ADD CONSTRAINT "League_sportId_fkey"
FOREIGN KEY ("sportId") REFERENCES "Sport"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "League_sportId_idx" ON "League"("sportId");

-- Add location fields for tournaments
ALTER TABLE "Tournament" ADD COLUMN "countryCode" TEXT;
ALTER TABLE "Tournament" ADD COLUMN "countryName" TEXT;
ALTER TABLE "Tournament" ADD COLUMN "regionCode" TEXT;
ALTER TABLE "Tournament" ADD COLUMN "regionName" TEXT;
ALTER TABLE "Tournament" ADD COLUMN "cityName" TEXT;

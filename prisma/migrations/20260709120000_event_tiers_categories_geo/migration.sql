-- AlterEnum : renommage des catégories en français, avec remap des données existantes
BEGIN;
CREATE TYPE "EventCategory_new" AS ENUM ('RENCONTRE', 'ATELIER', 'CONFERENCE', 'SOIREE', 'VOYAGE', 'SPORT', 'SOLIDAIRE', 'AUTRE');
ALTER TABLE "events" ALTER COLUMN "category" DROP DEFAULT;
ALTER TABLE "events" ALTER COLUMN "category" TYPE TEXT USING ("category"::text);
UPDATE "events" SET "category" = CASE "category"
  WHEN 'SOCIAL' THEN 'SOIREE'
  WHEN 'WORKSHOP' THEN 'ATELIER'
  WHEN 'PARTY' THEN 'SOIREE'
  WHEN 'TRIP' THEN 'VOYAGE'
  WHEN 'OTHER' THEN 'AUTRE'
  ELSE "category"
END;
ALTER TABLE "events" ALTER COLUMN "category" TYPE "EventCategory_new" USING ("category"::"EventCategory_new");
ALTER TYPE "EventCategory" RENAME TO "EventCategory_old";
ALTER TYPE "EventCategory_new" RENAME TO "EventCategory";
DROP TYPE "EventCategory_old";
ALTER TABLE "events" ALTER COLUMN "category" SET DEFAULT 'AUTRE';
COMMIT;

-- AlterTable : géolocalisation
ALTER TABLE "events" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- CreateTable : tarifs de billets dynamiques
CREATE TABLE "event_ticket_tiers" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_ticket_tiers_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "event_ticket_tiers" ADD CONSTRAINT "event_ticket_tiers_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DataMigration : tarifs par défaut pour les événements existants
-- (Standard = prix actuel, VIP = prix x2 quand l'événement est payant)
INSERT INTO "event_ticket_tiers" ("id", "eventId", "name", "price", "order", "createdAt", "updatedAt")
SELECT 'tier_' || substr(md5(random()::text || clock_timestamp()::text || "id"), 1, 20), "id", 'Standard', "price", 0, now(), now()
FROM "events";

INSERT INTO "event_ticket_tiers" ("id", "eventId", "name", "price", "order", "createdAt", "updatedAt")
SELECT 'tier_' || substr(md5(random()::text || clock_timestamp()::text || "id"), 1, 20), "id", 'VIP', "price" * 2, 1, now(), now()
FROM "events"
WHERE "price" > 0;

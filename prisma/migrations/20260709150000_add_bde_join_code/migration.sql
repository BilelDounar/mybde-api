-- AlterTable : code d'invitation a 6 chiffres, partage par les admins pour
-- laisser un etudiant rejoindre le BDE sans connaitre son identifiant interne.
ALTER TABLE "bde" ADD COLUMN "joinCode" TEXT;

-- DataMigration : code aleatoire pour les BDE existants (risque de collision
-- negligeable vu le faible nombre de lignes en base).
UPDATE "bde" SET "joinCode" = lpad(floor(random() * 1000000)::text, 6, '0');

ALTER TABLE "bde" ALTER COLUMN "joinCode" SET NOT NULL;

CREATE UNIQUE INDEX "bde_joinCode_key" ON "bde"("joinCode");

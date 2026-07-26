-- CreateEnum
CREATE TYPE "Theme" AS ENUM ('LIGHT', 'DARK', 'SYSTEM');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'fr',
ADD COLUMN     "theme" "Theme" NOT NULL DEFAULT 'LIGHT';

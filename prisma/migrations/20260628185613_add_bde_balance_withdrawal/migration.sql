-- AlterTable
ALTER TABLE "bde" ADD COLUMN     "balance" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "bde_withdrawals" (
    "id" TEXT NOT NULL,
    "bdeId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "fee" DOUBLE PRECISION NOT NULL,
    "netAmount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bde_withdrawals_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "bde_withdrawals" ADD CONSTRAINT "bde_withdrawals_bdeId_fkey" FOREIGN KEY ("bdeId") REFERENCES "bde"("id") ON DELETE CASCADE ON UPDATE CASCADE;

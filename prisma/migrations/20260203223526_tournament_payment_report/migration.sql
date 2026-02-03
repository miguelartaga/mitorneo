-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "paymentReportedAmount" DECIMAL(10,2),
ADD COLUMN     "paymentReportedAt" TIMESTAMP(3),
ADD COLUMN     "paymentReportedById" TEXT,
ADD COLUMN     "paymentReportedNote" TEXT;

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_paymentReportedById_fkey" FOREIGN KEY ("paymentReportedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "expiryDate" TIMESTAMP(3),
ADD COLUMN     "renewalDate" TIMESTAMP(3),
ADD COLUMN     "status" TEXT DEFAULT 'active';

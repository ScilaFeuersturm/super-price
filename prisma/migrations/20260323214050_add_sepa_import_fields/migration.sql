-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "sepaStoreId" TEXT;

-- AlterTable
ALTER TABLE "StoreChain" ADD COLUMN     "sepaBanderaId" TEXT,
ADD COLUMN     "sepaComercioId" TEXT;

-- CreateTable
CREATE TABLE "ImportRun" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "importedDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Store_sepaStoreId_idx" ON "Store"("sepaStoreId");

-- CreateIndex
CREATE INDEX "StoreChain_sepaComercioId_sepaBanderaId_idx" ON "StoreChain"("sepaComercioId", "sepaBanderaId");

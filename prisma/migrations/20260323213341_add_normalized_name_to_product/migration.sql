-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "normalizedName" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "Product_normalizedName_idx" ON "Product"("normalizedName");

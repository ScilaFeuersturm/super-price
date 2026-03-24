/*
  Warnings:

  - A unique constraint covering the columns `[normalizedKey]` on the table `Product` will be added. If there are existing duplicate values, this will fail.
  - Made the column `normalizedKey` on table `Product` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "normalizedKey" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Product_normalizedKey_key" ON "Product"("normalizedKey");

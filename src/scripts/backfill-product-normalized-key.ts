import { prisma } from "../lib/prisma.js";
import { buildProductKey } from "../utils/product-key.js";

async function main() {
  const products = await prisma.product.findMany();

  console.log(`Productos encontrados: ${products.length}`);

  for (const product of products) {
    const normalizedKey = buildProductKey({
      description: product.name,
      brand: product.brand,
      unit: product.unit
    });

    await prisma.product.update({
      where: { id: product.id },
      data: { normalizedKey }
    });
  }

  console.log("Backfill terminado");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
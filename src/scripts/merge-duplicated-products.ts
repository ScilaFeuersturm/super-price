import { prisma } from "../lib/prisma.js";

type ProductRow = {
  id: string;
  name: string;
  brand: string | null;
  unit: string | null;
  normalizedKey: string;
  createdAt: Date;
};

async function main() {
  const products = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
      brand: true,
      unit: true,
      normalizedKey: true,
      createdAt: true
    }
  });

  const groups = new Map<string, ProductRow[]>();

  for (const product of products) {
    const key = product.normalizedKey;
    const existing = groups.get(key) ?? [];
    existing.push(product);
    groups.set(key, existing);
  }

  const duplicates = Array.from(groups.entries()).filter(([, items]) => items.length > 1);

  console.log(`Grupos duplicados encontrados: ${duplicates.length}`);

  for (const [key, items] of duplicates) {
    const sorted = [...items].sort((a, b) => {
      if (a.createdAt < b.createdAt) return -1;
      if (a.createdAt > b.createdAt) return 1;
      return a.id.localeCompare(b.id);
    });

    const winner = sorted[0];
    const losers = sorted.slice(1);

    console.log(`\nFusionando key: ${key}`);
    console.log(`Ganador: ${winner.id} | ${winner.name}`);

    for (const loser of losers) {
      console.log(`- Moviendo prices de ${loser.id} -> ${winner.id}`);

      await prisma.price.updateMany({
        where: {
          productId: loser.id
        },
        data: {
          productId: winner.id
        }
      });

      await prisma.product.delete({
        where: {
          id: loser.id
        }
      });
    }
  }

  console.log("\nFusión terminada");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
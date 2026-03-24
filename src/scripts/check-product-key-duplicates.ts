import { prisma } from "../lib/prisma.js";

async function main() {
  const products = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
      brand: true,
      unit: true,
      normalizedKey: true
    }
  });

  const map = new Map<string, typeof products>();

  for (const product of products) {
    const key = product.normalizedKey;
    const existing = map.get(key) ?? [];
    existing.push(product);
    map.set(key, existing);
  }

  const duplicates = Array.from(map.entries()).filter(([, items]) => items.length > 1);

  console.log(`Claves duplicadas: ${duplicates.length}`);

  for (const [key, items] of duplicates.slice(0, 20)) {
    console.log(`\nKEY: ${key}`);
    for (const item of items) {
      console.log(`- ${item.id} | ${item.name} | ${item.brand ?? ""} | ${item.unit ?? ""}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
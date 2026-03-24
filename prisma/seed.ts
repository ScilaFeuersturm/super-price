import { PrismaClient } from "@prisma/client";
import { normalizeText } from "../src/utils/normalize.js";

const prisma = new PrismaClient();

async function main() {
  await prisma.price.deleteMany();
  await prisma.product.deleteMany();
  await prisma.store.deleteMany();
  await prisma.storeChain.deleteMany();

  const coto = await prisma.storeChain.create({
    data: {
      name: "Coto",
      stores: {
        create: [
          {
            name: "Coto Caballito",
            city: "Buenos Aires",
            province: "Buenos Aires"
          }
        ]
      }
    },
    include: { stores: true }
  });

  const carrefour = await prisma.storeChain.create({
    data: {
      name: "Carrefour",
      stores: {
        create: [
          {
            name: "Carrefour Almagro",
            city: "Buenos Aires",
            province: "Buenos Aires"
          }
        ]
      }
    },
    include: { stores: true }
  });

  const yerba = await prisma.product.create({
    data: {
      name: "Yerba Mate",
      normalizedName: normalizeText("Yerba Mate"),
      brand: "Playadito",
      category: "Almacén",
      unit: "1kg"
    }
  });

  const azucar = await prisma.product.create({
    data: {
      name: "Azúcar",
      normalizedName: normalizeText("Azúcar"),
      brand: "Ledesma",
      category: "Almacén",
      unit: "1kg"
    }
  });

  const leche = await prisma.product.create({
    data: {
      name: "Leche",
      normalizedName: normalizeText("Leche"),
      brand: "La Serenísima",
      category: "Lácteos",
      unit: "1L"
    }
  });

  await prisma.price.createMany({
    data: [
      {
        productId: yerba.id,
        storeId: coto.stores[0].id,
        amount: 3500,
        capturedAt: new Date()
      },
      {
        productId: azucar.id,
        storeId: coto.stores[0].id,
        amount: 1200,
        capturedAt: new Date()
      },
      {
        productId: leche.id,
        storeId: coto.stores[0].id,
        amount: 1500,
        capturedAt: new Date()
      },
      {
        productId: yerba.id,
        storeId: carrefour.stores[0].id,
        amount: 3400,
        capturedAt: new Date()
      },
      {
        productId: azucar.id,
        storeId: carrefour.stores[0].id,
        amount: 1350,
        capturedAt: new Date()
      },
      {
        productId: leche.id,
        storeId: carrefour.stores[0].id,
        amount: 1450,
        capturedAt: new Date()
      }
    ]
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
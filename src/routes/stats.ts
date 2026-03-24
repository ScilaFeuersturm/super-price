import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";

export async function statsRoutes(app: FastifyInstance) {
  app.get(
    "/",
    {
      schema: {
        tags: ["Stats"],
        summary: "Resumen del dataset cargado",
        description:
          "Devuelve métricas del estado actual de la base de datos: cadenas, sucursales, productos, precios e imports ejecutados.",
        response: {
          200: {
            type: "object",
            properties: {
              chains: {
                type: "integer",
                description: "Cantidad total de cadenas cargadas"
              },
              stores: {
                type: "integer",
                description: "Cantidad total de sucursales"
              },
              products: {
                type: "integer",
                description: "Cantidad total de productos únicos"
              },
              prices: {
                type: "integer",
                description: "Cantidad total de registros de precios"
              },
              imports: {
                type: "integer",
                description: "Cantidad total de ejecuciones de importación"
              }
            }
          }
        }
      }
    },
    async () => {
      const [chains, stores, products, prices, imports] = await Promise.all([
        prisma.storeChain.count(),
        prisma.store.count(),
        prisma.product.count(),
        prisma.price.count(),
        prisma.importRun.count()
      ]);

      return {
        chains,
        stores,
        products,
        prices,
        imports
      };
    }
  );
}
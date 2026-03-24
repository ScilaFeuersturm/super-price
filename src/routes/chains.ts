import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

export async function chainRoutes(app: FastifyInstance) {
  app.get(
    "/",
    {
      schema: {
        tags: ["Chains"],
        summary: "Listar cadenas de supermercados",
        description:
          "Devuelve cadenas de supermercados con paginación. Puede filtrarse por ciudad.",
        querystring: {
          type: "object",
          properties: {
            city: {
              type: "string",
              description: "Filtra cadenas que tengan sucursales en esta ciudad"
            },
            page: {
              type: "integer",
              minimum: 1,
              default: 1
            },
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 100,
              default: 50
            }
          }
        },
        response: {
          200: {
            type: "object",
            properties: {
              page: { type: "integer" },
              limit: { type: "integer" },
              total: { type: "integer" },
              totalPages: { type: "integer" },
              count: { type: "integer" },
              chains: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    sepaComercioId: { type: "string", nullable: true },
                    sepaBanderaId: { type: "string", nullable: true },
                    storeCount: { type: "integer" }
                  }
                }
              }
            }
          }
        }
      }
    },
    async (request) => {
      const querySchema = z.object({
        city: z.string().optional(),
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().positive().max(100).default(50)
      });

      const { city, page, limit } = querySchema.parse(request.query);
      const skip = (page - 1) * limit;

      const where = city
        ? {
            stores: {
              some: {
                city: {
                  equals: city,
                  mode: "insensitive" as const
                }
              }
            }
          }
        : undefined;

      const [total, chains] = await Promise.all([
        prisma.storeChain.count({ where }),
        prisma.storeChain.findMany({
          where,
          include: {
            _count: {
              select: {
                stores: true
              }
            }
          },
          skip,
          take: limit,
          orderBy: {
            name: "asc"
          }
        })
      ]);

      return {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        count: chains.length,
        chains: chains.map((chain) => ({
          id: chain.id,
          name: chain.name,
          sepaComercioId: chain.sepaComercioId,
          sepaBanderaId: chain.sepaBanderaId,
          storeCount: chain._count.stores
        }))
      };
    }
  );
}
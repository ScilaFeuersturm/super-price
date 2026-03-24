import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

export async function storeRoutes(app: FastifyInstance) {
  app.get(
    "/",
    {
      schema: {
        tags: ["Stores"],
        summary: "Listar sucursales",
        description:
          "Devuelve sucursales paginadas. Puede filtrarse por ciudad.",
        querystring: {
          type: "object",
          properties: {
            city: {
              type: "string",
              description: "Filtra sucursales por ciudad"
            },
            page: {
              type: "integer",
              minimum: 1,
              default: 1
            },
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 200,
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
              stores: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    sepaStoreId: { type: "string", nullable: true },
                    name: { type: "string" },
                    address: { type: "string", nullable: true },
                    city: { type: "string", nullable: true },
                    province: { type: "string", nullable: true },
                    latitude: { type: "number", nullable: true },
                    longitude: { type: "number", nullable: true },
                    chain: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        sepaComercioId: { type: "string", nullable: true },
                        sepaBanderaId: { type: "string", nullable: true }
                      }
                    }
                  }
                }
              }
            }
          },
          400: {
            type: "object",
            properties: {
              message: { type: "string" },
              issues: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: true
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
        limit: z.coerce.number().int().positive().max(200).default(50)
      });

      const { city, page, limit } = querySchema.parse(request.query);
      const skip = (page - 1) * limit;

      const where = city
        ? {
            city: {
              equals: city,
              mode: "insensitive" as const
            }
          }
        : undefined;

      const [total, stores] = await Promise.all([
        prisma.store.count({ where }),
        prisma.store.findMany({
          where,
          include: {
            chain: true
          },
          skip,
          take: limit,
          orderBy: [{ city: "asc" }, { name: "asc" }]
        })
      ]);

      return {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        count: stores.length,
        stores: stores.map((store) => ({
          id: store.id,
          sepaStoreId: store.sepaStoreId,
          name: store.name,
          address: store.address,
          city: store.city,
          province: store.province,
          latitude: store.latitude,
          longitude: store.longitude,
          chain: {
            id: store.chain.id,
            name: store.chain.name,
            sepaComercioId: store.chain.sepaComercioId,
            sepaBanderaId: store.chain.sepaBanderaId
          }
        }))
      };
    }
  );

  app.get(
    "/cities",
    {
      schema: {
        tags: ["Stores"],
        summary: "Listar ciudades disponibles",
        description:
          "Devuelve la lista de ciudades únicas encontradas en las sucursales cargadas.",
        response: {
          200: {
            type: "object",
            properties: {
              count: { type: "integer" },
              cities: {
                type: "array",
                items: {
                  type: "string"
                }
              }
            }
          }
        }
      }
    },
    async () => {
      const cities = await prisma.store.findMany({
        where: {
          city: {
            not: null
          }
        },
        select: {
          city: true
        },
        distinct: ["city"],
        orderBy: {
          city: "asc"
        }
      });

      return {
        count: cities.length,
        cities: cities
          .map((item) => item.city)
          .filter((city): city is string => Boolean(city))
      };
    }
  );
}
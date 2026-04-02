import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { normalizeText } from "../utils/normalize.js";
import { scoreProductMatch } from "../utils/product-matching.js";

export async function productRoutes(app: FastifyInstance) {
  // Devuelve todos los nombres de productos para caché local en el cliente.
  // Usar limit alto (hasta 1000) y paginar hasta totalPages.
  app.get(
    "/names",
    {
      schema: {
        tags: ["Products"],
        summary: "Listar nombres de productos para caché",
        querystring: {
          type: "object",
          properties: {
            page:  { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 1000, default: 500 },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              page:       { type: "integer" },
              limit:      { type: "integer" },
              total:      { type: "integer" },
              totalPages: { type: "integer" },
              names:      { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    },
    async (request) => {
      const querySchema = z.object({
        page:  z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().positive().max(1000).default(500),
      });
      const { page, limit } = querySchema.parse(request.query);
      const skip = (page - 1) * limit;

      const [total, products] = await Promise.all([
        prisma.product.count(),
        prisma.product.findMany({
          select: { name: true },
          orderBy: { name: "asc" },
          skip,
          take: limit,
        }),
      ]);

      return {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        names: products.map((p) => p.name),
      };
    }
  );

  app.get(
    "/search",
    {
      schema: {
        tags: ["Products"],
        summary: "Buscar productos",
        querystring: {
          type: "object",
          required: ["q"],
          properties: {
            q: { type: "string", description: "Texto de búsqueda" },
            page: { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 20, default: 10 }
          }
        },
        response: {
          200: {
            type: "object",
            properties: {
              query: { type: "string" },
              normalizedQuery: { type: "string" },
              page: { type: "integer" },
              limit: { type: "integer" },
              total: { type: "integer" },
              totalPages: { type: "integer" },
              count: { type: "integer" },
              products: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    sepaProductId: { type: "string", nullable: true },
                    normalizedKey: { type: "string" },
                    name: { type: "string" },
                    normalizedName: { type: "string" },
                    brand: { type: "string", nullable: true },
                    category: { type: "string", nullable: true },
                    unit: { type: "string", nullable: true },
                    matchScore: { type: "number" }
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
        q: z.string().min(1, "La búsqueda es obligatoria"),
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().positive().max(20).default(10)
      });

      const { q, page, limit } = querySchema.parse(request.query);
      const normalizedQuery = normalizeText(q);
      const skip = (page - 1) * limit;

      const where = {
        OR: [
          {
            normalizedName: {
              contains: normalizedQuery
            }
          },
          {
            brand: {
              contains: q,
              mode: "insensitive" as const
            }
          }
        ]
      };

      const rawProducts = await prisma.product.findMany({
        where,
        take: 200
      });

      const scoredProducts = rawProducts
        .map((product) => ({
          ...product,
          matchScore: scoreProductMatch({
            requestedName: q,
            candidateName: product.name,
            candidateBrand: product.brand,
            candidateUnit: product.unit
          })
        }))
        .filter((product) => product.matchScore > 0)
        .sort((a, b) => {
          if (b.matchScore !== a.matchScore) {
            return b.matchScore - a.matchScore;
          }

          return a.name.localeCompare(b.name);
        });

      const total = scoredProducts.length;
      const products = scoredProducts.slice(skip, skip + limit);

      return {
        query: q,
        normalizedQuery,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        count: products.length,
        products
      };
    }
  );
}
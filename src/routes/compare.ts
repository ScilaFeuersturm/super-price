import { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { compareShoppingItems } from "../services/compare-service.js";

const compareSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().min(1),
        quantity: z.coerce.number().int().positive().default(1)
      })
    )
    .min(1),
  city: z.string().optional(),
  chainIds: z.array(z.string().min(1)).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  radiusKm: z.number().positive().optional(),
});

export async function compareRoutes(app: FastifyInstance) {
  app.post(
    "/",
    {
      schema: {
        tags: ["Compare"],
        summary: "Comparar una lista manual de productos",
        description:
          "Compara una lista de productos entre sucursales y devuelve la mejor opción encontrada.",
        body: {
          type: "object",
          required: ["items"],
          properties: {
            items: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                required: ["name", "quantity"],
                properties: {
                  name: { type: "string" },
                  quantity: { type: "integer", minimum: 1, default: 1 }
                }
              }
            },
            city: {
              type: "string",
              description: "Filtra por ciudad"
            },
            chainIds: {
              type: "array",
              description: "Filtra por cadenas específicas",
              items: {
                type: "string"
              }
            }
          }
        },
        response: {
          200: {
            type: "object",
            properties: {
              bestOption: {
                anyOf: [
                  { type: "null" },
                  {
                    type: "object",
                    properties: {
                      storeId: { type: "string" },
                      storeName: { type: "string" },
                      chainName: { type: "string" },
                      total: { type: "number" },
                      matchedItems: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            requestedName: { type: "string" },
                            matchedProduct: { type: "string" },
                            matchedBrand: { type: "string", nullable: true },
                            matchedUnit: { type: "string", nullable: true },
                            quantity: { type: "integer" },
                            unitPrice: { type: "number" },
                            subtotal: { type: "number" },
                            matchScore: { type: "number" }
                          }
                        }
                      },
                      missingItems: {
                        type: "array",
                        items: { type: "string" }
                      },
                      matchedCount: { type: "integer" }
                    }
                  }
                ]
              },
              options: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    storeId: { type: "string" },
                    storeName: { type: "string" },
                    chainName: { type: "string" },
                    total: { type: "number" },
                    matchedItems: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          requestedName: { type: "string" },
                          matchedProduct: { type: "string" },
                          matchedBrand: { type: "string", nullable: true },
                          matchedUnit: { type: "string", nullable: true },
                          quantity: { type: "integer" },
                          unitPrice: { type: "number" },
                          subtotal: { type: "number" },
                          matchScore: { type: "number" }
                        }
                      }
                    },
                    missingItems: {
                      type: "array",
                      items: { type: "string" }
                    },
                    matchedCount: { type: "integer" }
                  }
                }
              }
            }
          }
        }
      }
    },
    async (request) => {
      const body = compareSchema.parse(request.body);

      return compareShoppingItems({
        items: body.items,
        city: body.city,
        chainIds: body.chainIds,
        lat: body.lat,
        lng: body.lng,
        radiusKm: body.radiusKm,
      });
    }
  );

  app.post(
    "/list/:id",
    {
      schema: {
        tags: ["Compare"],
        summary: "Comparar una lista guardada",
        description:
          "Busca una lista de compras guardada por ID y la compara entre sucursales.",
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string" }
          }
        },
        body: {
          type: "object",
          properties: {
            city: {
              type: "string",
              description: "Filtra por ciudad"
            },
            chainIds: {
              type: "array",
              description: "Filtra por cadenas específicas",
              items: {
                type: "string"
              }
            }
          }
        },
        response: {
          200: {
            type: "object",
            properties: {
              bestOption: {
                anyOf: [
                  { type: "null" },
                  {
                    type: "object",
                    properties: {
                      storeId: { type: "string" },
                      storeName: { type: "string" },
                      chainName: { type: "string" },
                      total: { type: "number" },
                      matchedItems: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            requestedName: { type: "string" },
                            matchedProduct: { type: "string" },
                            matchedBrand: { type: "string", nullable: true },
                            matchedUnit: { type: "string", nullable: true },
                            quantity: { type: "integer" },
                            unitPrice: { type: "number" },
                            subtotal: { type: "number" },
                            matchScore: { type: "number" }
                          }
                        }
                      },
                      missingItems: {
                        type: "array",
                        items: { type: "string" }
                      },
                      matchedCount: { type: "integer" }
                    }
                  }
                ]
              },
              options: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    storeId: { type: "string" },
                    storeName: { type: "string" },
                    chainName: { type: "string" },
                    total: { type: "number" },
                    matchedItems: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          requestedName: { type: "string" },
                          matchedProduct: { type: "string" },
                          matchedBrand: { type: "string", nullable: true },
                          matchedUnit: { type: "string", nullable: true },
                          quantity: { type: "integer" },
                          unitPrice: { type: "number" },
                          subtotal: { type: "number" },
                          matchScore: { type: "number" }
                        }
                      }
                    },
                    missingItems: {
                      type: "array",
                      items: { type: "string" }
                    },
                    matchedCount: { type: "integer" }
                  }
                }
              }
            }
          },
          404: {
            type: "object",
            properties: {
              message: { type: "string" }
            }
          }
        }
      }
    },
    async (request, reply: FastifyReply) => {
      const paramsSchema = z.object({
        id: z.string().min(1)
      });

      const bodySchema = z.object({
        city: z.string().optional(),
        chainIds: z.array(z.string().min(1)).optional()
      });

      const { id } = paramsSchema.parse(request.params);
      const { city, chainIds } = bodySchema.parse(request.body ?? {});

      const shoppingList = await prisma.shoppingList.findUnique({
        where: { id },
        include: {
          items: true
        }
      });

      if (!shoppingList) {
        return reply.status(404).send({
          message: "Lista no encontrada"
        });
      }

      return compareShoppingItems({
        city,
        chainIds,
        items: shoppingList.items.map((item) => ({
          name: item.productName,
          quantity: item.quantity
        }))
      });
    }
  );
}
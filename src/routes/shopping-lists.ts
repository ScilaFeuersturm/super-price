import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

const createShoppingListSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio")
});

const createShoppingListItemSchema = z.object({
  productName: z.string().min(1, "El nombre del producto es obligatorio"),
  quantity: z.coerce.number().int().positive().default(1)
});

export async function shoppingListRoutes(app: FastifyInstance) {
  app.post(
    "/",
    {
      schema: {
        tags: ["Shopping Lists"],
        summary: "Crear una lista de compras",
        description: "Crea una nueva lista de compras vacía.",
        body: {
          type: "object",
          required: ["name"],
          properties: {
            name: {
              type: "string",
              description: "Nombre de la lista"
            }
          }
        },
        response: {
          201: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              createdAt: { type: "string", format: "date-time" },
              updatedAt: { type: "string", format: "date-time" }
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
    async (request, reply) => {
      const body = createShoppingListSchema.parse(request.body);

      const shoppingList = await prisma.shoppingList.create({
        data: {
          name: body.name
        }
      });

      return reply.status(201).send(shoppingList);
    }
  );

  app.get(
    "/:id",
    {
      schema: {
        tags: ["Shopping Lists"],
        summary: "Obtener una lista de compras",
        description: "Devuelve una lista de compras y sus ítems por ID.",
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: {
              type: "string",
              description: "ID de la lista"
            }
          }
        },
        response: {
          200: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              createdAt: { type: "string", format: "date-time" },
              updatedAt: { type: "string", format: "date-time" },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    shoppingListId: { type: "string" },
                    productName: { type: "string" },
                    quantity: { type: "integer" },
                    createdAt: { type: "string", format: "date-time" }
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
    async (request, reply) => {
      const paramsSchema = z.object({
        id: z.string().min(1)
      });

      const { id } = paramsSchema.parse(request.params);

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

      return shoppingList;
    }
  );

  app.post(
    "/:id/items",
    {
      schema: {
        tags: ["Shopping Lists"],
        summary: "Agregar ítem a una lista",
        description: "Agrega un producto y cantidad a una lista de compras existente.",
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: {
              type: "string",
              description: "ID de la lista"
            }
          }
        },
        body: {
          type: "object",
          required: ["productName", "quantity"],
          properties: {
            productName: {
              type: "string",
              description: "Nombre del producto"
            },
            quantity: {
              type: "integer",
              minimum: 1,
              default: 1,
              description: "Cantidad del producto"
            }
          }
        },
        response: {
          201: {
            type: "object",
            properties: {
              id: { type: "string" },
              shoppingListId: { type: "string" },
              productName: { type: "string" },
              quantity: { type: "integer" },
              createdAt: { type: "string", format: "date-time" }
            }
          },
          404: {
            type: "object",
            properties: {
              message: { type: "string" }
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
    async (request, reply) => {
      const paramsSchema = z.object({
        id: z.string().min(1)
      });

      const { id } = paramsSchema.parse(request.params);
      const body = createShoppingListItemSchema.parse(request.body);

      const shoppingList = await prisma.shoppingList.findUnique({
        where: { id }
      });

      if (!shoppingList) {
        return reply.status(404).send({
          message: "Lista no encontrada"
        });
      }

      const item = await prisma.shoppingListItem.create({
        data: {
          shoppingListId: id,
          productName: body.productName,
          quantity: body.quantity
        }
      });

      return reply.status(201).send(item);
    }
  );
}
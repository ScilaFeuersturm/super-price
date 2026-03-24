import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";

export async function healthRoutes(app: FastifyInstance) {
  app.get(
    "/",
    {
      schema: {
        tags: ["Health"],
        summary: "Estado del servicio",
        description:
          "Verifica que el backend esté activo y que la conexión a la base de datos funcione correctamente.",
        response: {
          200: {
            type: "object",
            properties: {
              ok: {
                type: "boolean",
                example: true
              },
              service: {
                type: "string",
                example: "super-price-backend"
              },
              db: {
                type: "string",
                example: "connected"
              }
            }
          }
        }
      }
    },
    async () => {
      await prisma.$queryRaw`SELECT 1`;

      return {
        ok: true,
        service: "super-price-backend",
        db: "connected"
      };
    }
  );
}
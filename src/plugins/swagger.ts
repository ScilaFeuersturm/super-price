import { FastifyInstance } from "fastify";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";

export async function registerSwagger(app: FastifyInstance) {
  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: "Super Price API",
        description: "API para comparación de precios de supermercados",
        version: "1.0.0"
      },
      servers: [
        {
          url: "http://localhost:3000",
          description: "Desarrollo local"
        }
      ],
      tags: [
        { name: "Health", description: "Estado del servicio" },
        { name: "Stats", description: "Resumen de datos importados" },
        { name: "Products", description: "Búsqueda de productos" },
        { name: "Stores", description: "Sucursales y ciudades" },
        { name: "Chains", description: "Cadenas de supermercados" },
        { name: "Shopping Lists", description: "Listas de compras" },
        { name: "Compare", description: "Comparación de precios" }
      ]
    }
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: "/docs"
  });
}
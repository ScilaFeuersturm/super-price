import Fastify from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import { healthRoutes } from "./routes/health.js";
import { shoppingListRoutes } from "./routes/shopping-lists.js";
import { compareRoutes } from "./routes/compare.js";
import { productRoutes } from "./routes/products.js";
import { storeRoutes } from "./routes/stores.js";
import { chainRoutes } from "./routes/chains.js";
import { statsRoutes } from "./routes/stats.js";
import { adminRoutes } from "./routes/admin.js";
import { registerSwagger } from "./plugins/swagger.js";



export async function buildApp() {
  const app = Fastify({
    logger: true
  });

  await app.register(cors, {
    origin: true
  });

  await registerSwagger(app);


  await app.register(compareRoutes, {
     prefix: "/compare" 
    });
  
    await app.register(productRoutes, {
       prefix: "/products" 
    });
await app.register(storeRoutes, 
  { prefix: "/stores"
   });

await app.register(chainRoutes, { 
  prefix: "/chains" 
});
   
await app.register(statsRoutes, {
   prefix: "/stats" 
  });


  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        message: "Datos inválidos",
        issues: error.issues
      });
    }

    app.log.error(error);

    return reply.status(500).send({
      message: "Internal server error"
    });
  });

  await app.register(healthRoutes, { prefix: "/health" });
  await app.register(adminRoutes, { prefix: "/admin" });
  await app.register(shoppingListRoutes, { prefix: "/shopping-lists" });

  return app;
}
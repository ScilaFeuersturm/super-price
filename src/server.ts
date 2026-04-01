import cron from "node-cron";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { runAutoImport } from "./scripts/import-auto.js";

async function checkDatabaseStatus(app: FastifyInstance): Promise<void> {
  const productCount = await prisma.product.count();

  if (productCount === 0) {
    app.log.warn(
      "La base de datos está vacía. Ejecutá manualmente: npm run import:auto"
    );
    return;
  }

  const lastImport = await prisma.importRun.findFirst({
    orderBy: { createdAt: "desc" },
  });

  if (lastImport) {
    const ageDays = Math.floor(
      (Date.now() - lastImport.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (ageDays > 7) {
      app.log.warn(
        `La última importación fue hace ${ageDays} días. Los precios pueden estar desactualizados.`
      );
    } else {
      app.log.info(
        `Última importación SEPA: hace ${ageDays} día(s). Productos cargados: ${productCount}.`
      );
    }
  }
}

function scheduleDailyImport(app: FastifyInstance): void {
  // 06:00 UTC = 03:00 Argentina (UTC-3)
  cron.schedule("0 6 * * *", async () => {
    app.log.info("Iniciando importación SEPA programada...");
    try {
      await runAutoImport();
      app.log.info("Importación SEPA programada completada.");
    } catch (error) {
      app.log.error({ error }, "Error en la importación SEPA programada.");
    }
  });

  app.log.info("Importación SEPA programada diariamente a las 06:00 UTC (03:00 Argentina).");
}

async function start() {
  try {
    const app = await buildApp();

    await app.listen({
      port: env.PORT,
      host: "0.0.0.0",
    });

    app.log.info(`Server running on port ${env.PORT}`);

    await checkDatabaseStatus(app);
    scheduleDailyImport(app);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

start();

import { buildApp } from "./app.js";
import { env } from "./config/env.js";

async function start() {
  try {
    const app = await buildApp();

    await app.listen({
      port: env.PORT,
      host: "0.0.0.0"
    });

    app.log.info(`Server running on port ${env.PORT}`);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

start();
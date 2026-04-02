import { FastifyInstance } from "fastify";
import { runAutoImport } from "../scripts/import-auto.js";

export async function adminRoutes(app: FastifyInstance) {
  app.post("/import", async (_request, reply) => {
    // Dispara el import en background y responde inmediatamente
    reply.send({ ok: true, message: "Import iniciado. Revisá los logs del servidor." });
    try {
      await runAutoImport();
      app.log.info("[admin] Import manual completado.");
    } catch (err) {
      app.log.error({ err }, "[admin] Error en import manual.");
    }
  });
}

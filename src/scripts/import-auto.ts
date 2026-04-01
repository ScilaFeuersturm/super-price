import fs from "node:fs";
import https from "node:https";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../lib/prisma.js";
import { processWeeklyZip } from "./lib/sepa-importer.js";

const CKAN_API =
  "https://datos.produccion.gob.ar/api/3/action/package_show?id=sepa-precios";

// Índice 0 = domingo, igual que Date.getDay()
const DAY_NAMES = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

type CkanResource = {
  name: string;
  url: string;
  format: string;
};

type CkanResponse = {
  success: boolean;
  result: {
    resources: CkanResource[];
  };
};

async function fetchCkanResources(): Promise<CkanResource[]> {
  return new Promise((resolve, reject) => {
    https
      .get(CKAN_API, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data) as CkanResponse;
            if (!parsed.success) {
              reject(new Error("CKAN API devolvió success=false"));
              return;
            }
            resolve(parsed.result.resources);
          } catch (err) {
            reject(err);
          }
        });
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

function removeDiacritics(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function findTodayResource(resources: CkanResource[]): CkanResource | null {
  const todayName = DAY_NAMES[new Date().getDay()];
  return (
    resources.find(
      (r) => removeDiacritics(r.name).includes(todayName) && r.format === "ZIP"
    ) ?? null
  );
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);

    function request(currentUrl: string, redirectCount = 0): void {
      if (redirectCount > 5) {
        reject(new Error("Demasiados redirects"));
        return;
      }

      const parsedUrl = new URL(currentUrl);
      const protocol = parsedUrl.protocol === "https:" ? https : http;

      protocol
        .get(currentUrl, (res) => {
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            res.resume();
            request(res.headers.location, redirectCount + 1);
            return;
          }

          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} al descargar ${currentUrl}`));
            return;
          }

          const totalBytes = parseInt(res.headers["content-length"] ?? "0", 10);
          let downloadedBytes = 0;
          let lastLoggedPercent = 0;

          res.on("data", (chunk: Buffer) => {
            downloadedBytes += chunk.length;
            if (totalBytes > 0) {
              const percent = Math.floor((downloadedBytes / totalBytes) * 100);
              if (percent >= lastLoggedPercent + 10) {
                console.log(
                  `  Descargando... ${percent}% (${Math.round(downloadedBytes / 1024 / 1024)} MB)`
                );
                lastLoggedPercent = percent;
              }
            }
          });

          res.pipe(file);
          file.on("finish", () => file.close(() => resolve()));
          res.on("error", (err) => {
            file.close();
            fs.unlink(destPath, () => {});
            reject(err);
          });
        })
        .on("error", (err) => {
          file.close();
          fs.unlink(destPath, () => {});
          reject(err);
        });
    }

    request(url);
  });
}

export async function runAutoImport(): Promise<void> {
  const todayName = DAY_NAMES[new Date().getDay()];
  console.log(`[import-auto] Iniciando importación automática SEPA (${todayName})...`);

  // Evitar importar más de una vez por día
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const alreadyImported = await prisma.importRun.findFirst({
    where: {
      source: "SEPA auto import",
      createdAt: { gte: startOfToday },
    },
  });

  if (alreadyImported) {
    console.log("[import-auto] Ya se importó hoy. Saltando.");
    return;
  }

  // Obtener metadata de CKAN
  console.log("[import-auto] Consultando API de datos.produccion.gob.ar...");
  const resources = await fetchCkanResources();
  const resource = findTodayResource(resources);

  if (!resource) {
    throw new Error(
      `[import-auto] No se encontró recurso ZIP para el día: ${todayName}. Recursos disponibles: ${resources.map((r) => r.name).join(", ")}`
    );
  }

  console.log(`[import-auto] Recurso encontrado: ${resource.name}`);

  // Descargar a archivo temporal
  const tmpPath = path.join(os.tmpdir(), `sepa-${Date.now()}.zip`);
  console.log(`[import-auto] Descargando a ${tmpPath}...`);
  await downloadFile(resource.url, tmpPath);
  console.log("[import-auto] Descarga completa.");

  // Importar y limpiar
  try {
    const result = await processWeeklyZip(tmpPath);

    await prisma.importRun.create({
      data: {
        source: "SEPA auto import",
        importedDate: new Date(),
        notes: `recurso=${resource.name}; paquetes=${result.packagesDetected}; stores=${result.storesImported}; productos=${result.productsUpserted}; precios=${result.pricesImported}`,
      },
    });

    console.log(`[import-auto] Importación completada.`);
    console.log(`  Paquetes: ${result.packagesDetected}`);
    console.log(`  Stores:   ${result.storesImported}`);
    console.log(`  Productos:${result.productsUpserted}`);
    console.log(`  Precios:  ${result.pricesImported}`);
  } finally {
    fs.unlink(tmpPath, (err) => {
      if (err) console.error("[import-auto] Error borrando archivo temporal:", err.message);
    });
  }
}

// Punto de entrada cuando se ejecuta directamente: tsx src/scripts/import-auto.ts
const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirectRun) {
  runAutoImport()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

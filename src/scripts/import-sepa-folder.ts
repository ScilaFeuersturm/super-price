import fs from "node:fs";
import path from "node:path";
import { prisma } from "../lib/prisma.js";
import { processWeeklyZip } from "./lib/sepa-importer.js";

async function main() {
  const folderPath = process.argv[2];

  if (!folderPath) {
    throw new Error("Tenés que pasar la carpeta. Ej: npm run import:sepa:folder -- ./data");
  }

  const absoluteFolderPath = path.resolve(folderPath);

  if (!fs.existsSync(absoluteFolderPath)) {
    throw new Error(`No existe la carpeta: ${absoluteFolderPath}`);
  }

  const zipFiles = fs
    .readdirSync(absoluteFolderPath)
    .filter((file) => file.toLowerCase().endsWith(".zip"))
    .filter((file) => file.toLowerCase().startsWith("sepa_"))
    .sort();

  if (zipFiles.length === 0) {
    throw new Error("No se encontraron archivos .zip que empiecen con sepa_");
  }

  console.log(`Archivos detectados: ${zipFiles.length}`);

  let totalPackages = 0;
  let totalStores = 0;
  let totalProducts = 0;
  let totalPrices = 0;

  for (const zipFile of zipFiles) {
    const fullPath = path.join(absoluteFolderPath, zipFile);
    const result = await processWeeklyZip(fullPath);

    console.log(`${zipFile}: paquetes válidos detectados ${result.packagesDetected}`);

    totalPackages += result.packagesDetected;
    totalStores += result.storesImported;
    totalProducts += result.productsUpserted;
    totalPrices += result.pricesImported;
  }

  await prisma.importRun.create({
    data: {
      source: "SEPA weekly folder import",
      importedDate: new Date(),
      notes: `archivos=${zipFiles.length}; paquetes=${totalPackages}; stores=${totalStores}; productsUpserted=${totalProducts}; prices=${totalPrices}`,
    },
  });

  console.log("\nImportación semanal terminada");
  console.log(`Stores procesadas: ${totalStores}`);
  console.log(`Productos upsertados: ${totalProducts}`);
  console.log(`Precios insertados: ${totalPrices}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

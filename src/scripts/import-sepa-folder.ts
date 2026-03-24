import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { prisma } from "../lib/prisma.js";
import { parsePipeCsv } from "../utils/parse-pipe-csv.js";
import { normalizeText } from "../utils/normalize.js";
import { buildProductKey } from "../utils/product-key.js";

type ComercioRow = {
  id_comercio: string;
  id_bandera: string;
  comercio_bandera_nombre: string;
};

type SucursalRow = {
  id_comercio: string;
  id_bandera: string;
  id_sucursal: string;
  sucursales_nombre: string;
  sucursales_calle: string;
  sucursales_numero: string;
  sucursales_latitud: string;
  sucursales_longitud: string;
  sucursales_localidad: string;
  sucursales_provincia: string;
};

type ProductoRow = {
  id_comercio: string;
  id_bandera: string;
  id_sucursal: string;
  id_producto: string;
  productos_descripcion: string;
  productos_marca: string;
  productos_cantidad_presentacion: string;
  productos_unidad_medida_presentacion: string;
  productos_precio_lista: string;
};

type ParsedSepaPackage = {
  comercioRows: ComercioRow[];
  sucursalRows: SucursalRow[];
  productoRows: ProductoRow[];
  sourceName: string;
  sourceDate: Date;
};

function toFloat(value?: string | null): number | null {
  if (!value) return null;
  const normalized = value.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildUnit(
  quantity?: string | null,
  unit?: string | null
): string | null {
  const q = quantity?.trim() ?? "";
  const u = unit?.trim() ?? "";
  const value = `${q}${u}`.trim();
  return value.length > 0 ? value : null;
}

function parseDateFromPath(filePath: string): Date {
  const match = filePath.match(/(\d{4}-\d{2}-\d{2})/);

  if (match) {
    const parsed = new Date(`${match[1]}T00:00:00.000Z`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date();
}

function getCsvEntry(zip: AdmZip, exactFileName: string) {
  return zip.getEntries().find((entry) => {
    if (entry.isDirectory) return false;
    return path.basename(entry.entryName).toLowerCase() === exactFileName.toLowerCase();
  });
}

function parseInnerSepaZip(
  zip: AdmZip,
  sourceName: string,
  sourceDate: Date
): ParsedSepaPackage | null {
  const comercioEntry = getCsvEntry(zip, "comercio.csv");
  const sucursalesEntry = getCsvEntry(zip, "sucursales.csv");
  const productosEntry = getCsvEntry(zip, "productos.csv");

  if (!comercioEntry || !sucursalesEntry || !productosEntry) {
    console.log(`Paquete descartado por CSV faltante: ${sourceName}`);
    console.log(
      "Entradas:",
      zip.getEntries().map((entry) => entry.entryName)
    );
    return null;
  }

  const comercioRows = parsePipeCsv<ComercioRow>(
    zip.readAsText(comercioEntry, "utf8")
  );

  const sucursalRows = parsePipeCsv<SucursalRow>(
    zip.readAsText(sucursalesEntry, "utf8")
  );

  const productoRows = parsePipeCsv<ProductoRow>(
    zip.readAsText(productosEntry, "utf8")
  );

  return {
    comercioRows,
    sucursalRows,
    productoRows,
    sourceName,
    sourceDate
  };
}

async function processWeeklyZip(
  zipPath: string
): Promise<{
  packagesDetected: number;
  storesImported: number;
  productsUpserted: number;
  pricesImported: number;
}> {
  const absoluteZipPath = path.resolve(zipPath);
  const sourceDate = parseDateFromPath(zipPath);
  const weeklyZip = new AdmZip(absoluteZipPath);

  const nestedZipEntries = weeklyZip.getEntries().filter((entry) => {
    if (entry.isDirectory) return false;
    return entry.entryName.toLowerCase().endsWith(".zip");
  });

  console.log(
    `Sub-zips detectados dentro de ${path.basename(zipPath)}: ${nestedZipEntries.length}`
  );

  let packagesDetected = 0;
  let storesImported = 0;
  let productsUpserted = 0;
  let pricesImported = 0;

  for (const entry of nestedZipEntries) {
    try {
      const nestedZipBuffer = entry.getData();
      const nestedZip = new AdmZip(nestedZipBuffer);

      const parsed = parseInnerSepaZip(
        nestedZip,
        `${path.basename(zipPath)}::${entry.entryName}`,
        sourceDate
      );

      if (!parsed) {
        continue;
      }

      packagesDetected++;

      const result = await importPackage(parsed);

      storesImported += result.storesImported;
      productsUpserted += result.productsUpserted;
      pricesImported += result.pricesImported;
    } catch (error) {
      console.log(`Error procesando sub-zip: ${entry.entryName}`);
      console.error(error);
    }
  }

  return {
    packagesDetected,
    storesImported,
    productsUpserted,
    pricesImported
  };
}

async function importPackage(
  pkg: ParsedSepaPackage
): Promise<{
  sourceName: string;
  storesImported: number;
  productsUpserted: number;
  pricesImported: number;
}> {
  const { comercioRows, sucursalRows, productoRows, sourceName, sourceDate } = pkg;

  const validComercioRows = comercioRows.filter(
    (row) => row.id_comercio && row.id_bandera
  );

  const validSucursalRows = sucursalRows.filter(
    (row) =>
      row.id_comercio &&
      row.id_bandera &&
      row.id_sucursal &&
      row.sucursales_nombre
  );

  const validProductoRows = productoRows.filter(
    (row) =>
      row.id_comercio &&
      row.id_bandera &&
      row.id_sucursal &&
      row.id_producto &&
      row.productos_descripcion
  );

  const comercioMap = new Map<string, ComercioRow>(
    validComercioRows.map((row) => [`${row.id_comercio}-${row.id_bandera}`, row])
  );

  const storeMap = new Map<string, string>();
  let productsUpserted = 0;
  let pricesImported = 0;

  console.log(`\nProcesando paquete: ${sourceName}`);
  console.log(`Sucursales crudas: ${sucursalRows.length}`);
  console.log(`Productos crudos: ${productoRows.length}`);
  console.log(`Sucursales válidas: ${validSucursalRows.length}`);
  console.log(`Productos válidos: ${validProductoRows.length}`);

  for (const sucursal of validSucursalRows) {
    const comercioKey = `${sucursal.id_comercio}-${sucursal.id_bandera}`;
    const comercio = comercioMap.get(comercioKey);

    const chain = await prisma.storeChain.upsert({
      where: {
        id: `sepa-chain-${comercioKey}`
      },
      update: {
        name: comercio?.comercio_bandera_nombre ?? `Bandera ${comercioKey}`,
        sepaComercioId: sucursal.id_comercio,
        sepaBanderaId: sucursal.id_bandera
      },
      create: {
        id: `sepa-chain-${comercioKey}`,
        name: comercio?.comercio_bandera_nombre ?? `Bandera ${comercioKey}`,
        sepaComercioId: sucursal.id_comercio,
        sepaBanderaId: sucursal.id_bandera
      }
    });

    const address = [sucursal.sucursales_calle, sucursal.sucursales_numero]
      .filter(Boolean)
      .join(" ");

    const store = await prisma.store.upsert({
      where: {
        id: `sepa-store-${sucursal.id_sucursal}`
      },
      update: {
        chainId: chain.id,
        sepaStoreId: sucursal.id_sucursal,
        name: sucursal.sucursales_nombre,
        address,
        city: sucursal.sucursales_localidad,
        province: sucursal.sucursales_provincia,
        latitude: toFloat(sucursal.sucursales_latitud),
        longitude: toFloat(sucursal.sucursales_longitud)
      },
      create: {
        id: `sepa-store-${sucursal.id_sucursal}`,
        chainId: chain.id,
        sepaStoreId: sucursal.id_sucursal,
        name: sucursal.sucursales_nombre,
        address,
        city: sucursal.sucursales_localidad,
        province: sucursal.sucursales_provincia,
        latitude: toFloat(sucursal.sucursales_latitud),
        longitude: toFloat(sucursal.sucursales_longitud)
      }
    });

    storeMap.set(sucursal.id_sucursal, store.id);
  }

  for (const row of validProductoRows) {
    const storeId = storeMap.get(row.id_sucursal);
    if (!storeId) continue;

    const amount = Number((row.productos_precio_lista || "").replace(",", "."));
    if (!Number.isFinite(amount)) continue;

    const unit = buildUnit(
      row.productos_cantidad_presentacion,
      row.productos_unidad_medida_presentacion
    );

    const normalizedKey = buildProductKey({
      description: row.productos_descripcion,
      brand: row.productos_marca || null,
      unit
    });

    let product;

    if (row.id_producto) {
      product = await prisma.product.upsert({
        where: {
          sepaProductId: row.id_producto
        },
        update: {
          name: row.productos_descripcion,
          normalizedName: normalizeText(row.productos_descripcion),
          brand: row.productos_marca || null,
          unit,
          normalizedKey
        },
        create: {
          sepaProductId: row.id_producto,
          name: row.productos_descripcion,
          normalizedName: normalizeText(row.productos_descripcion),
          brand: row.productos_marca || null,
          unit,
          normalizedKey
        }
      });
    } else {
      product = await prisma.product.create({
        data: {
          name: row.productos_descripcion,
          normalizedName: normalizeText(row.productos_descripcion),
          brand: row.productos_marca || null,
          unit,
          normalizedKey
        }
      });
    }

    productsUpserted++;

    await prisma.price.create({
      data: {
        productId: product.id,
        storeId,
        amount,
        capturedAt: sourceDate
      }
    });

    pricesImported++;
  }

  return {
    sourceName,
    storesImported: storeMap.size,
    productsUpserted,
    pricesImported
  };
}

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

    if (global.gc) {
      global.gc();
    }
  }

  console.log(`Paquetes totales detectados: ${totalPackages}`);

  await prisma.importRun.create({
    data: {
      source: "SEPA weekly folder import",
      importedDate: new Date(),
      notes: `archivos=${zipFiles.length}; paquetes=${totalPackages}; stores=${totalStores}; productsUpserted=${totalProducts}; prices=${totalPrices}`
    }
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
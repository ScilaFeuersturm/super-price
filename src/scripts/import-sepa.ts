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

function getEntryIgnoreCase(zip: AdmZip, fileName: string) {
  const normalizedTarget = fileName.toLowerCase();

  return zip
    .getEntries()
    .find((entry) => path.basename(entry.entryName).toLowerCase() === normalizedTarget);
}

function parseSepaZip(zip: AdmZip, sourceName: string): ParsedSepaPackage | null {
  const comercioEntry = getEntryIgnoreCase(zip, "comercio.csv");
  const sucursalesEntry = getEntryIgnoreCase(zip, "sucursales.csv");
  const productosEntry = getEntryIgnoreCase(zip, "productos.csv");

  if (!comercioEntry || !sucursalesEntry || !productosEntry) {
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
    sourceName
  };
}

function collectSepaPackages(zip: AdmZip, sourceName: string): ParsedSepaPackage[] {
  const directPackage = parseSepaZip(zip, sourceName);

  if (directPackage) {
    return [directPackage];
  }

  const nestedZipEntries = zip
    .getEntries()
    .filter((entry) => !entry.isDirectory && entry.entryName.toLowerCase().endsWith(".zip"));

  const packages: ParsedSepaPackage[] = [];

  for (const entry of nestedZipEntries) {
    const nestedZipBuffer = entry.getData();
    const nestedZip = new AdmZip(nestedZipBuffer);
    const parsed = parseSepaZip(nestedZip, entry.entryName);

    if (parsed) {
      packages.push(parsed);
    }
  }

  return packages;
}

async function importPackage(
  pkg: ParsedSepaPackage,
  targetCity: string
): Promise<{
  sourceName: string;
  storesImported: number;
  productsImported: number;
}> {
  const { comercioRows, sucursalRows, productoRows, sourceName } = pkg;

  const sucursalesFiltradas = sucursalRows.filter((row: SucursalRow) => {
    return normalizeText(row.sucursales_localidad || "") === normalizeText(targetCity);
  });

  const allowedStoreIds = new Set(
    sucursalesFiltradas.map((row: SucursalRow) => row.id_sucursal)
  );

  const productosFiltrados = productoRows.filter((row: ProductoRow) =>
    allowedStoreIds.has(row.id_sucursal)
  );

  const comercioMap = new Map<string, ComercioRow>(
    comercioRows.map((row: ComercioRow) => [
      `${row.id_comercio}-${row.id_bandera}`,
      row
    ])
  );

  console.log(`\nProcesando paquete: ${sourceName}`);
  console.log(`Sucursales filtradas: ${sucursalesFiltradas.length}`);
  console.log(`Productos filtrados: ${productosFiltrados.length}`);

  const storeMap = new Map<string, string>();

  for (const sucursal of sucursalesFiltradas) {
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

  const importedStoreIds = Array.from(storeMap.values());

  if (importedStoreIds.length > 0) {
    await prisma.price.deleteMany({
      where: {
        storeId: {
          in: importedStoreIds
        }
      }
    });
  }

  let importedPriceCount = 0;

  for (const row of productosFiltrados) {
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

const product = await prisma.product.upsert({
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

    await prisma.price.create({
      data: {
        productId: product.id,
        storeId,
        amount,
        capturedAt: new Date()
      }
    });

    importedPriceCount++;
  }

  return {
    sourceName,
    storesImported: importedStoreIds.length,
    productsImported: importedPriceCount
  };
}

async function main() {
  const zipPath = process.argv[2];

  if (!zipPath) {
    throw new Error(
      "Tenés que pasar la ruta al zip. Ej: npm run import:sepa -- ./data/sepa_viernes.zip"
    );
  }

  const absoluteZipPath = path.resolve(zipPath);

  if (!fs.existsSync(absoluteZipPath)) {
    throw new Error(`No existe el archivo: ${absoluteZipPath}`);
  }

  const rootZip = new AdmZip(absoluteZipPath);
  const packages = collectSepaPackages(rootZip, path.basename(absoluteZipPath));

  if (packages.length === 0) {
    throw new Error(
      "No se encontraron paquetes SEPA válidos. El zip no contiene comercio.csv, sucursales.csv y productos.csv, ni zips internos que los contengan."
    );
  }

  const targetCity = "Buenos Aires";

  console.log(`Paquetes detectados: ${packages.length}`);

  let totalStores = 0;
  let totalProducts = 0;

  for (const pkg of packages) {
    const result = await importPackage(pkg, targetCity);
    totalStores += result.storesImported;
    totalProducts += result.productsImported;
  }

  await prisma.importRun.create({
    data: {
      source: "SEPA zip import",
      importedDate: new Date(),
      notes: `Ciudad=${targetCity}; paquetes=${packages.length}; sucursales=${totalStores}; precios=${totalProducts}`
    }
  });

  console.log("\nImportación terminada");
  console.log(`Total sucursales importadas: ${totalStores}`);
  console.log(`Total precios importados: ${totalProducts}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
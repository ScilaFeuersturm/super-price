import path from "node:path";
import AdmZip from "adm-zip";
import { prisma } from "../../lib/prisma.js";
import { parsePipeCsv } from "../../utils/parse-pipe-csv.js";
import { normalizeText } from "../../utils/normalize.js";
import { buildProductKey } from "../../utils/product-key.js";

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

export type WeeklyZipResult = {
  packagesDetected: number;
  storesImported: number;
  productsUpserted: number;
  pricesImported: number;
};

function toFloat(value?: string | null): number | null {
  if (!value) return null;
  const normalized = value.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildUnit(quantity?: string | null, unit?: string | null): string | null {
  const q = quantity?.trim() ?? "";
  const u = unit?.trim() ?? "";
  const value = `${q}${u}`.trim();
  return value.length > 0 ? value : null;
}

export function parseDateFromPath(filePath: string): Date {
  const match = filePath.match(/(\d{4}-\d{2}-\d{2})/);
  if (match) {
    const parsed = new Date(`${match[1]}T00:00:00.000Z`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
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
    return null;
  }

  return {
    comercioRows: parsePipeCsv<ComercioRow>(zip.readAsText(comercioEntry, "utf8")),
    sucursalRows: parsePipeCsv<SucursalRow>(zip.readAsText(sucursalesEntry, "utf8")),
    productoRows: parsePipeCsv<ProductoRow>(zip.readAsText(productosEntry, "utf8")),
    sourceName,
    sourceDate,
  };
}

type ProductData = {
  sepaProductId: string | null;
  name: string;
  normalizedName: string;
  brand: string | null;
  unit: string | null;
  normalizedKey: string;
};

// Estrategia sin errores de constraint:
// 1. Si tiene sepaProductId → buscar primero, actualizar si existe
// 2. Si no existe → upsert por normalizedKey (fusiona productos con misma descripción)
async function upsertProduct(data: ProductData): Promise<{ id: string }> {
  const { sepaProductId, name, normalizedName, brand, unit, normalizedKey } = data;
  const fields = { name, normalizedName, brand, unit };

  if (sepaProductId) {
    const existing = await prisma.product.findUnique({
      where: { sepaProductId },
      select: { id: true },
    });
    if (existing) {
      await prisma.product.update({
        where: { id: existing.id },
        data: { ...fields, normalizedKey },
      });
      return existing;
    }
  }

  // No encontrado por sepaProductId → upsert por normalizedKey
  return prisma.product.upsert({
    where: { normalizedKey },
    update: fields,
    create: { normalizedKey, ...fields },
    select: { id: true },
  });
}

async function importPackage(pkg: ParsedSepaPackage): Promise<{
  sourceName: string;
  storesImported: number;
  productsUpserted: number;
  pricesImported: number;
}> {
  const { comercioRows, sucursalRows, productoRows, sourceName, sourceDate } = pkg;

  const validComercioRows = comercioRows.filter((row) => row.id_comercio && row.id_bandera);
  const validSucursalRows = sucursalRows.filter(
    (row) => row.id_comercio && row.id_bandera && row.id_sucursal && row.sucursales_nombre
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
  console.log(
    `Sucursales válidas: ${validSucursalRows.length} | Productos válidos: ${validProductoRows.length}`
  );

  for (const sucursal of validSucursalRows) {
    const comercioKey = `${sucursal.id_comercio}-${sucursal.id_bandera}`;
    const comercio = comercioMap.get(comercioKey);

    const chain = await prisma.storeChain.upsert({
      where: { id: `sepa-chain-${comercioKey}` },
      update: {
        name: comercio?.comercio_bandera_nombre ?? `Bandera ${comercioKey}`,
        sepaComercioId: sucursal.id_comercio,
        sepaBanderaId: sucursal.id_bandera,
      },
      create: {
        id: `sepa-chain-${comercioKey}`,
        name: comercio?.comercio_bandera_nombre ?? `Bandera ${comercioKey}`,
        sepaComercioId: sucursal.id_comercio,
        sepaBanderaId: sucursal.id_bandera,
      },
    });

    const address = [sucursal.sucursales_calle, sucursal.sucursales_numero]
      .filter(Boolean)
      .join(" ");

    const store = await prisma.store.upsert({
      where: { id: `sepa-store-${sucursal.id_sucursal}` },
      update: {
        chainId: chain.id,
        sepaStoreId: sucursal.id_sucursal,
        name: sucursal.sucursales_nombre,
        address,
        city: sucursal.sucursales_localidad,
        province: sucursal.sucursales_provincia,
        latitude: toFloat(sucursal.sucursales_latitud),
        longitude: toFloat(sucursal.sucursales_longitud),
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
        longitude: toFloat(sucursal.sucursales_longitud),
      },
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
      unit,
    });

    const product = await upsertProduct({
      sepaProductId: row.id_producto || null,
      name: row.productos_descripcion,
      normalizedName: normalizeText(row.productos_descripcion),
      brand: row.productos_marca || null,
      unit,
      normalizedKey,
    });

    productsUpserted++;

    await prisma.price.create({
      data: {
        productId: product.id,
        storeId,
        amount,
        capturedAt: sourceDate,
      },
    });

    pricesImported++;
  }

  return {
    sourceName,
    storesImported: storeMap.size,
    productsUpserted,
    pricesImported,
  };
}

export async function processWeeklyZip(zipPath: string): Promise<WeeklyZipResult> {
  const sourceDate = parseDateFromPath(zipPath);
  const weeklyZip = new AdmZip(zipPath);

  const nestedZipEntries = weeklyZip
    .getEntries()
    .filter((entry) => !entry.isDirectory && entry.entryName.toLowerCase().endsWith(".zip"));

  console.log(`Sub-zips detectados dentro de ${path.basename(zipPath)}: ${nestedZipEntries.length}`);

  let packagesDetected = 0;
  let storesImported = 0;
  let productsUpserted = 0;
  let pricesImported = 0;

  for (const entry of nestedZipEntries) {
    try {
      const nestedZip = new AdmZip(entry.getData());
      const parsed = parseInnerSepaZip(
        nestedZip,
        `${path.basename(zipPath)}::${entry.entryName}`,
        sourceDate
      );

      if (!parsed) continue;
      packagesDetected++;

      const result = await importPackage(parsed);
      storesImported += result.storesImported;
      productsUpserted += result.productsUpserted;
      pricesImported += result.pricesImported;
    } catch (error) {
      console.error(`Error procesando sub-zip ${entry.entryName}:`, error);
    }

    if (global.gc) global.gc();
  }

  return { packagesDetected, storesImported, productsUpserted, pricesImported };
}

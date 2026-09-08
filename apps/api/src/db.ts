import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  NUTRIENT_CATALOG,
  sampleProduct,
  type ProductRecord
} from "@industrial-label/core";

type SqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...values: unknown[]): unknown[];
    get(...values: unknown[]): unknown;
    run(...values: unknown[]): unknown;
  };
};

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const dataDir = process.env.DATA_DIR || join(workspaceRoot, "data");
const dbPath = join(dataDir, "labels.db");

mkdirSync(dataDir, { recursive: true });

const { DatabaseSync } = await import("node:sqlite");
const db = new DatabaseSync(dbPath) as SqliteDatabase;

db.exec(`
CREATE TABLE IF NOT EXISTS products (
  sku TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

seed();

export function listProducts(): ProductRecord[] {
  return db
    .prepare("SELECT payload FROM products ORDER BY sku")
    .all()
    .map((row) =>
      hydrateProduct(JSON.parse((row as { payload: string }).payload) as ProductRecord)
    );
}

export function getProduct(sku: string): ProductRecord | undefined {
  const row = db
    .prepare("SELECT payload FROM products WHERE sku = ?")
    .get(sku) as { payload: string } | undefined;

  return row ? hydrateProduct(JSON.parse(row.payload) as ProductRecord) : undefined;
}

export function upsertProduct(product: ProductRecord): ProductRecord {
  db.prepare(
    `INSERT INTO products (sku, payload, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(sku) DO UPDATE SET payload = excluded.payload, updated_at = CURRENT_TIMESTAMP`
  ).run(product.sku, JSON.stringify(product));

  return product;
}

function seed(): void {
  const existing = db
    .prepare("SELECT payload FROM products WHERE sku = ?")
    .get(sampleProduct.sku) as { payload: string } | undefined;

  if (!existing) {
    upsertProduct(sampleProduct);
    return;
  }

  const hydrated = hydrateProduct(JSON.parse(existing.payload) as ProductRecord);
  upsertProduct(hydrated);
}

function hydrateProduct(product: ProductRecord): ProductRecord {
  const rows = product.nutrition.rows.map((row) => {
    const catalogItem = NUTRIENT_CATALOG.find((item) => item.id === row.id);

    if (!catalogItem) {
      return row;
    }

    return {
      ...row,
      label: {
        ...row.label,
        ...catalogItem.label
      },
      indent: row.indent ?? catalogItem.indent
    };
  });

  if (product.sku === sampleProduct.sku) {
    const existingIds = new Set(rows.map((row) => row.id));

    for (const sampleRow of sampleProduct.nutrition.rows) {
      if (!existingIds.has(sampleRow.id)) {
        rows.push(sampleRow);
      }
    }
  }

  return {
    ...product,
    metadata: {
      ...product.metadata,
      status: String(product.metadata?.status ?? ""),
      attachments: Array.isArray(product.metadata?.attachments)
        ? product.metadata.attachments
        : []
    },
    nutrition: {
      ...product.nutrition,
      baseQuantity: product.nutrition.baseQuantity ?? "100",
      baseUnit: product.nutrition.baseUnit ?? "g",
      rows
    }
  };
}

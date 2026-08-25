import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import cors from "@fastify/cors";
import Fastify from "fastify";
import {
  composeLabel,
  exportBarTenderXml,
  exportProductCsv,
  exportProductJson,
  generateZpl,
  OFFICIAL_COMBINATIONS,
  SUPPORTED_LANGUAGES,
  type LabelSpec,
  type LanguageCode,
  type ProductRecord
} from "@industrial-label/core";
import { getProduct, listProducts, upsertProduct } from "./db.js";

const execFileAsync = promisify(execFile);
const workspaceRoot = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  "..",
  ".."
);
const printJobsDir = join(workspaceRoot, "data", "print-jobs");
const powershellPath =
  "C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";

const app = Fastify({
  logger: true,
  bodyLimit: 50 * 1024 * 1024
});

await app.register(cors, {
  origin: true
});

app.get("/health", async () => ({
  ok: true,
  service: "industrial-label-api",
  timestamp: new Date().toISOString()
}));

app.get("/languages", async () => ({
  languages: SUPPORTED_LANGUAGES,
  officialCombinations: OFFICIAL_COMBINATIONS
}));

app.get("/products", async () => ({
  products: listProducts()
}));

app.get<{ Params: { sku: string } }>("/products/:sku", async (request, reply) => {
  const product = getProduct(request.params.sku);

  if (!product) {
    return reply.code(404).send({ error: "Product not found" });
  }

  return { product };
});

app.post<{ Body: ProductRecord }>("/products", async (request) => ({
  product: upsertProduct(request.body)
}));

app.post<{ Body: LayoutRequest }>("/layout", async (request) => {
  const product = resolveProduct(request.body);
  const layout = composeLabel({
    product,
    languages: request.body.languages,
    label: request.body.label
  });

  return { layout };
});

app.post<{ Body: LayoutRequest }>("/export/zpl", async (request) => {
  const product = resolveProduct(request.body);
  const layout = composeLabel({
    product,
    languages: request.body.languages,
    label: request.body.label
  });

  return {
    fileName: `${product.sku}-${layout.languages.join("-")}.zpl`,
    contentType: "application/zpl",
    zpl: generateZpl(layout),
    layout
  };
});

app.post<{ Body: LayoutRequest }>("/export/btxml", async (request) => {
  const product = resolveProduct(request.body);
  const layout = composeLabel({
    product,
    languages: request.body.languages,
    label: request.body.label
  });

  return {
    fileName: `${product.sku}-${layout.languages.join("-")}.btxml`,
    contentType: "application/xml",
    btxml: exportBarTenderXml(product, layout),
    layout
  };
});

app.post<{ Body: LayoutRequest }>("/export/json", async (request) => {
  const product = resolveProduct(request.body);

  return {
    fileName: `${product.sku}.json`,
    contentType: "application/json",
    json: exportProductJson(product)
  };
});

app.post<{ Body: LayoutRequest }>("/export/csv", async (request) => {
  const product = resolveProduct(request.body);

  return {
    fileName: `${product.sku}.csv`,
    contentType: "text/csv",
    csv: exportProductCsv(product)
  };
});

app.post<{ Body: LayoutRequest & { printer?: { name?: string }; dryRun?: boolean } }>(
  "/print/zebra",
  async (request) => {
    const product = resolveProduct(request.body);
    const layout = composeLabel({
      product,
      languages: request.body.languages,
      label: request.body.label
    });
    const zpl = generateZpl(layout);
    const printerName =
      request.body.printer?.name ?? "ZDesigner ZT610-203dpi ZPL";

    if (request.body.dryRun !== false) {
      return {
        queued: false,
        dryRun: true,
        reason:
          "Dry run: ZPL generado sin enviarse a la impresora. Envie dryRun=false para imprimir.",
        printer: printerName,
        zpl
      };
    }

    if (process.platform !== "win32") {
      return {
        queued: false,
        dryRun: false,
        reason:
          "Impresion RAW requiere Windows con la Zebra instalada. En Railway se genera ZPL, pero la impresion fisica debe hacerse desde el equipo conectado a la impresora.",
        printer: printerName,
        zpl
      };
    }

    mkdirSync(printJobsDir, { recursive: true });
    const jobFile = join(
      printJobsDir,
      `${product.sku}-${layout.languages.join("-")}-${Date.now()}.zpl`
    );
    writeFileSync(jobFile, zpl, "utf8");

    const scriptPath = join(
      workspaceRoot,
      "apps",
      "api",
      "scripts",
      "send-raw-zpl.ps1"
    );

    const { stdout, stderr } = await execFileAsync(
      powershellPath,
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        "-PrinterName",
        printerName,
        "-FilePath",
        jobFile
      ],
      { timeout: 30000 }
    );

    return {
      queued: true,
      dryRun: false,
      printer: printerName,
      jobFile,
      stdout,
      stderr,
      zpl
    };
  }
);

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";

await app.listen({ port, host });

type LayoutRequest = {
  sku?: string;
  product?: ProductRecord;
  languages: LanguageCode[];
  label: LabelSpec;
};

function resolveProduct(request: LayoutRequest): ProductRecord {
  if (request.product) {
    return request.product;
  }

  if (request.sku) {
    const product = getProduct(request.sku);

    if (product) {
      return product;
    }
  }

  throw new Error("Request must include product or existing sku.");
}

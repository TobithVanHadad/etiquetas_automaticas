import type { LayoutResult, ProductRecord } from "./types.js";

export function exportProductJson(product: ProductRecord): string {
  return JSON.stringify(product, null, 2);
}

export function exportBarTenderXml(product: ProductRecord, layout: LayoutResult): string {
  const xmlPayload = escapeXml(JSON.stringify({ product, layout }, null, 2));
  const substrings = [
    ["sku", product.sku],
    ["name", product.name],
    ["languages", layout.languages.join("-")],
    ["layout_strategy", layout.strategy.id],
    ["overflow", String(layout.overflow)]
  ]
    .map(
      ([name, value]) =>
        `      <NamedSubString Name="${escapeXml(name)}"><Value>${escapeXml(value)}</Value></NamedSubString>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="utf-8"?>
<XMLScript Version="2.0">
  <Command Name="IndustrialDynamicLabel">
    <Print>
      <Format CloseAtEndOfJob="true">IndustrialDynamicLabel.btw</Format>
${substrings}
      <NamedSubString Name="semantic_payload"><Value>${xmlPayload}</Value></NamedSubString>
    </Print>
  </Command>
</XMLScript>`;
}

export function exportProductCsv(product: ProductRecord): string {
  const rows = [
    ["sku", "language", "section", "value", "per100g", "perServing", "riPercent"],
    [product.sku, "", "name", product.name, "", "", ""],
    [product.sku, "", "gtin", product.gtin ?? "", "", "", ""],
    [product.sku, "", "brand", product.brand ?? "", "", "", ""],
    [product.sku, "", "netWeight", product.netWeight ?? "", "", "", ""],
    [
      product.sku,
      "",
      "nutrition.baseQuantity",
      product.nutrition.baseQuantity ?? "100",
      "",
      "",
      ""
    ],
    [
      product.sku,
      "",
      "nutrition.baseUnit",
      product.nutrition.baseUnit ?? "g",
      "",
      "",
      ""
    ],
    ...Object.entries(product.languages).flatMap(([language, content]) =>
      Object.entries(content ?? {})
        .filter(([, value]) => typeof value === "string")
        .map(([section, value]) => [
          product.sku,
          language,
          section,
          value as string,
          "",
          "",
          ""
        ])
    ),
    ...product.nutrition.rows.flatMap((row) =>
      Object.entries(row.label).map(([language, label]) => [
        product.sku,
        language,
        `nutrition.${row.id}`,
        label,
        row.per100g,
        row.perServing ?? "",
        row.riPercent ?? ""
      ])
    )
  ];

  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

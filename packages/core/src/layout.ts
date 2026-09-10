import { isOfficialCombination, SECTION_LABELS } from "./languages.js";
import {
  clampToIndustrialMinimum,
  getMinimumTextHeightMm,
  MIN_ARIAL_POINT_SIZE,
  measureTextHeightMm,
  MIN_TEXT_HEIGHT_MM
} from "./measurement.js";
import {
  flowRichTextIntoRegions,
  measureRichTextHeightMm,
  richTextLineToMarkedText,
  stripRichTextMarkers
} from "./rich-text.js";
import type {
  LabelSpec,
  LanguageCode,
  LayoutElement,
  LayoutOptions,
  LayoutResult,
  LayoutStrategy,
  ProductLanguageContent,
  ProductRecord,
  TableCell,
  TableElement
} from "./types.js";

const OFFICIAL_COLUMN_COUNTS: Record<string, number> = {
  "DE-ES": 2,
  "DE-ES-FR": 3,
  "DE-ES-FR-NL": 2,
  "DE-ES-FR-NL-EN": 3
};

export function composeLabel(options: LayoutOptions): LayoutResult {
  const label = normalizeLabelSpec(options.label);
  const languages = normalizeLanguages(options.languages, options.product);
  const attempts = createStrategyAttempts(languages, label);
  let best: LayoutResult | undefined;

  for (const strategy of attempts) {
    const candidate = buildLayoutCandidate(options.product, languages, label, strategy);

    if (!candidate.overflow) {
      return candidate;
    }

    if (
      !best ||
      candidate.metrics.overflowAreaMm2 < best.metrics.overflowAreaMm2
    ) {
      best = candidate;
    }
  }

  if (!best) {
    throw new Error("No layout strategy could be generated.");
  }

  const minimumFontMm = getMinimumTextHeightMm(best.label.fontFamily);

  return {
    ...best,
    warnings: [
      ...best.warnings,
      best.label.fontFamily === "arial"
        ? `Contenido excede la etiqueta usando el minimo Arial de ${MIN_ARIAL_POINT_SIZE} pt.`
        : `Contenido excede la etiqueta usando el minimo industrial de ${minimumFontMm} mm.`
    ]
  };
}

function normalizeLabelSpec(label: LabelSpec): Required<LabelSpec> {
  return {
    widthMm: label.widthMm || 100,
    heightMm: label.heightMm || 150,
    dpi: label.dpi || 203,
    marginMm: label.marginMm ?? 4,
    fontFamily: label.fontFamily ?? "zebra-native",
    zplFontRegular: label.zplFontRegular ?? "Z:NS20WGL4.FNT",
    zplFontBold: label.zplFontBold ?? "Z:NS25WGL4.FNT",
    visualPreset: label.visualPreset ?? "crevel-current",
    headerTextScalePercent: label.headerTextScalePercent ?? 100,
    bodyTextScalePercent: label.bodyTextScalePercent ?? 100,
    nutritionTableWidthPercent: label.nutritionTableWidthPercent ?? 64,
    nutritionTableAlign: label.nutritionTableAlign ?? "right",
    nutritionValueColumnPercent: label.nutritionValueColumnPercent ?? 25,
    nutritionLabelColumnPercent: label.nutritionLabelColumnPercent ?? 58,
    nutritionTableBottomOffsetMm: label.nutritionTableBottomOffsetMm ?? 0,
    nutritionTableRowPaddingMm: label.nutritionTableRowPaddingMm ?? 0.55,
    nutritionTableFontScalePercent: label.nutritionTableFontScalePercent ?? 100,
    nutritionShowServing: label.nutritionShowServing ?? false,
    nutritionShowRiPercent: label.nutritionShowRiPercent ?? false
  };
}

function normalizeLanguages(
  languages: LanguageCode[],
  product: ProductRecord
): LanguageCode[] {
  const unique = [...new Set(languages)];
  const available = unique.filter((language) => product.languages[language]);

  if (available.length) {
    return available;
  }

  const firstAvailable = Object.keys(product.languages)[0] as LanguageCode | undefined;
  return firstAvailable ? [firstAvailable] : ["EN"];
}

function createStrategyAttempts(
  languages: LanguageCode[],
  label: Required<LabelSpec>
): LayoutStrategy[] {
  const official = isOfficialCombination(languages);
  const key = languages.join("-");
  const preferredColumns =
    OFFICIAL_COLUMN_COUNTS[key] ?? chooseColumns(languages.length, label.widthMm);
  const columnVariants = uniqueNumbers([
    preferredColumns,
    preferredColumns + 1,
    preferredColumns - 1,
    Math.ceil(Math.sqrt(languages.length)),
    languages.length >= 6 ? 4 : preferredColumns
  ]).filter((columns) => columns >= 1 && columns <= Math.min(4, languages.length));

  const margins = uniqueNumbers([
    label.marginMm,
    Math.min(label.marginMm, 3),
    2
  ]).filter((margin) => margin >= 2);
  const minimumFontMm = getMinimumTextHeightMm(label.fontFamily);
  const bodyFontScale = clampPercent(label.bodyTextScalePercent, 75, 180) / 100;
  const tableFontScale =
    clampPercent(label.nutritionTableFontScalePercent, 75, 180) / 100;
  const usesIndustrialFonts = label.fontFamily !== "arial";
  const preferredBodyBaseMm =
    usesIndustrialFonts ? MIN_TEXT_HEIGHT_MM * 2.15 : minimumFontMm + 0.28;
  const preferredBodyFontMm = clampToIndustrialMinimum(
    preferredBodyBaseMm * bodyFontScale,
    minimumFontMm
  );
  const preferredTableFontMm =
    (usesIndustrialFonts ? MIN_TEXT_HEIGHT_MM * 1.85 : minimumFontMm) *
    tableFontScale;
  const bodyFonts =
    usesIndustrialFonts
      ? uniqueNumbers(
          [
            preferredBodyFontMm,
            preferredBodyFontMm * 0.94,
            preferredBodyFontMm * 0.88,
            2.25 * bodyFontScale,
            2 * bodyFontScale,
            1.8 * bodyFontScale,
            1.6 * bodyFontScale,
            1.4 * bodyFontScale,
            minimumFontMm
          ].map((fontMm) => clampToIndustrialMinimum(fontMm, minimumFontMm))
        )
      : uniqueNumbers([
          preferredBodyFontMm,
          preferredBodyFontMm * 0.94,
          minimumFontMm + 0.12,
          minimumFontMm
        ]).map((fontMm) => clampToIndustrialMinimum(fontMm, minimumFontMm));
  const tableFonts =
    usesIndustrialFonts
      ? [
          preferredTableFontMm,
          2 * tableFontScale,
          1.8 * tableFontScale,
          1.6 * tableFontScale,
          1.4 * tableFontScale,
          MIN_TEXT_HEIGHT_MM
        ]
      : [minimumFontMm + 0.18, minimumFontMm + 0.08, minimumFontMm];
  const spacings = isCompactVisualPreset(label)
    ? [0.75, 0.5, 0.3]
    : [1.8, 1.2, 0.75];
  const attempts: LayoutStrategy[] = [];

  for (const columns of columnVariants) {
    for (const marginMm of margins) {
      for (const bodyFontMm of bodyFonts) {
        for (const tableFontMm of tableFonts) {
          for (const spacingMm of spacings) {
            attempts.push({
              id: `${key || "free"}-${columns}c-${marginMm}m-${bodyFontMm}f-${spacingMm}s`,
              description: official
                ? `Combinacion oficial ${key} con ${columns} columnas`
                : `Combinacion libre ${key} con ${columns} columnas`,
              columns,
              marginMm,
              bodyFontMm: clampToIndustrialMinimum(bodyFontMm, minimumFontMm),
              tableFontMm: clampToIndustrialMinimum(tableFontMm, minimumFontMm),
              spacingMm,
              official
            });
          }
        }
      }
    }
  }

  return attempts.sort((left, right) => {
    const leftScore = strategyScore(
      left,
      preferredColumns,
      preferredBodyFontMm,
      preferredTableFontMm
    );
    const rightScore = strategyScore(
      right,
      preferredColumns,
      preferredBodyFontMm,
      preferredTableFontMm
    );
    return leftScore - rightScore;
  });
}

function isCompactVisualPreset(label: Pick<Required<LabelSpec>, "visualPreset">): boolean {
  return (
    label.visualPreset === "crevel-current" ||
    label.visualPreset === "poblano-import"
  );
}

function strategyScore(
  strategy: LayoutStrategy,
  preferredColumns: number,
  preferredBodyFontMm: number,
  preferredTableFontMm: number
): number {
  return (
    Math.abs(strategy.columns - preferredColumns) * 10 +
    Math.abs(strategy.bodyFontMm - preferredBodyFontMm) * 3 +
    Math.abs(strategy.tableFontMm - preferredTableFontMm) * 2 +
    (4 - strategy.marginMm) +
    (1.8 - strategy.spacingMm)
  );
}

function chooseColumns(languageCount: number, widthMm: number): number {
  if (languageCount <= 1) {
    return 1;
  }

  if (languageCount === 2) {
    return 2;
  }

  if (languageCount === 3 && widthMm >= 92) {
    return 3;
  }

  if (languageCount <= 5) {
    return widthMm >= 95 ? 3 : 2;
  }

  return widthMm >= 110 ? 4 : 3;
}

function createHeaderText(
  product: ProductRecord,
  languages: LanguageCode[],
  primaryContent?: ProductLanguageContent
): string {
  const netWeight = normalizeHeaderTitle(product.netWeight ?? "");
  const selectedLanguageTitles = languages
    .map((language) => product.languages[language]?.name)
    .filter((value): value is string => Boolean(value?.trim()));
  const baseTitle = selectedLanguageTitles.length
    ? combineHeaderTitles(selectedLanguageTitles, netWeight)
    : normalizeHeaderTitle(product.name || primaryContent?.name || "");

  if (!baseTitle) {
    return netWeight ? `${netWeight} e` : "";
  }

  if (!netWeight || headerContainsNetWeight(baseTitle, netWeight)) {
    return baseTitle;
  }

  return `${baseTitle} - ${netWeight} e`;
}

function combineHeaderTitles(titles: string[], netWeight: string): string {
  const uniqueTitles = titles.reduce<string[]>((accumulator, title) => {
    const cleanTitle = stripHeaderNetWeight(title, netWeight);
    const normalized = normalizeHeaderTitle(cleanTitle).toLowerCase();
    const exists = accumulator.some(
      (candidate) => normalizeHeaderTitle(candidate).toLowerCase() === normalized
    );

    if (cleanTitle && !exists) {
      accumulator.push(cleanTitle);
    }

    return accumulator;
  }, []);

  return normalizeHeaderTitle(uniqueTitles.join(" / "));
}

function normalizeHeaderTitle(value: string): string {
  return value
    .replace(/\s*\n+\s*/g, " / ")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

function stripHeaderNetWeight(title: string, netWeight: string): string {
  const cleanTitle = normalizeHeaderTitle(title);

  if (!netWeight) {
    return cleanTitle;
  }

  const match = netWeight.match(/^(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l)$/i);

  if (!match) {
    return normalizeHeaderTitle(
      cleanTitle.replace(
        new RegExp(`${escapeRegExp(netWeight)}\\s*(?:e|℮)?`, "i"),
        ""
      )
    );
  }

  const [, quantity, unit] = match;
  const weightPattern = new RegExp(
    `\\s*[-–]?\\s*${escapeRegExp(quantity)}\\s*${escapeRegExp(unit)}\\s*(?:e|℮)?\\s*$`,
    "i"
  );

  return normalizeHeaderTitle(cleanTitle.replace(weightPattern, ""));
}

function headerContainsNetWeight(title: string, netWeight: string): boolean {
  const match = netWeight.match(/^(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l)$/i);

  if (!match) {
    return title.toLowerCase().includes(netWeight.toLowerCase());
  }

  const [, quantity, unit] = match;
  const pattern = new RegExp(
    `\\b${escapeRegExp(quantity)}\\s*${escapeRegExp(unit)}\\s*(?:e|℮)?\\b`,
    "i"
  );

  return pattern.test(title);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildLayoutCandidate(
  product: ProductRecord,
  languages: LanguageCode[],
  label: Required<LabelSpec>,
  strategy: LayoutStrategy
): LayoutResult {
  const elements: LayoutElement[] = [];
  const warnings: string[] = [];
  const contentWidth = label.widthMm - strategy.marginMm * 2;
  const nutritionWidthMm = getNutritionTableWidthMm(label, contentWidth);
  const minimumFontMm = getMinimumTextHeightMm(label.fontFamily);
  const compactPreset = isCompactVisualPreset(label);
  const primaryLanguage = languages[0] ?? "EN";
  const primaryContent = product.languages[primaryLanguage];
  const headerText = createHeaderText(product, languages, primaryContent);
  const headerScale = clampPercent(label.headerTextScalePercent, 75, 180) / 100;
  const headerFontMm = Math.max(
    (compactPreset ? 2.25 : 2.15) * headerScale,
    minimumFontMm
  );
  const headerLineHeight = compactPreset ? 0.98 : 1.08;
  const skuText = product.sku?.trim() ? `SKU: ${product.sku.trim()}` : "";
  const skuFontMm = Math.max(minimumFontMm, headerFontMm * 0.58);
  const skuHeightMm = skuText
    ? measureRichTextHeightMm(skuText, contentWidth, skuFontMm, 1) + 0.12
    : 0;
  const headerYMm = strategy.marginMm + (skuText ? skuHeightMm + 0.2 : 0);
  const measuredHeaderHeightMm =
    measureRichTextHeightMm(headerText, contentWidth, headerFontMm, headerLineHeight) +
    0.45;
  const headerHeightMm = Math.max(
    compactPreset ? 4.3 : 6.2,
    Math.min(label.heightMm * 0.16, measuredHeaderHeightMm)
  );
  const headerBlockHeightMm = skuHeightMm + (skuText ? 0.2 : 0) + headerHeightMm;
  const nutritionHeightMm = calculateNutritionHeight(
    product,
    languages,
    strategy,
    nutritionWidthMm,
    label
  );
  const bodyTopMm = strategy.marginMm + headerBlockHeightMm;
  const tableTopMm =
    label.heightMm -
    strategy.marginMm -
    nutritionHeightMm -
    Math.max(0, label.nutritionTableBottomOffsetMm);
  const nutritionXMm = getNutritionTableXMm(
    label,
    strategy.marginMm,
    contentWidth,
    nutritionWidthMm
  );
  const bodyBottomMm = tableTopMm - strategy.spacingMm;
  let overflow = false;
  let overflowAreaMm2 = 0;

  if (skuText) {
    elements.push({
      kind: "text",
      id: "header-sku",
      role: "sku",
      xMm: strategy.marginMm,
      yMm: strategy.marginMm,
      widthMm: contentWidth,
      heightMm: skuHeightMm,
      fontMm: skuFontMm,
      lineHeight: 1,
      weight: "bold",
      text: skuText
    });
  }

  elements.push({
    kind: "text",
    id: "header-product-name",
    role: "product-name",
    xMm: strategy.marginMm,
    yMm: headerYMm,
    widthMm: contentWidth,
    heightMm: headerHeightMm,
    fontMm: headerFontMm,
    lineHeight: headerLineHeight,
    weight: "bold",
    text: headerText
  });

  if (!compactPreset) {
    elements.push({
      kind: "line",
      id: "header-divider",
      role: "divider",
      xMm: strategy.marginMm,
      yMm: strategy.marginMm + headerBlockHeightMm - 1,
      widthMm: contentWidth,
      heightMm: 0,
      thicknessMm: 0.25,
      direction: "horizontal"
    });
  }

  if (compactPreset) {
    const compactText = createCompactMultilingualBodyText(product, languages);
    const compactFlow = createCompactBodyFlowElements({
      text: compactText,
      marginMm: strategy.marginMm,
      contentWidthMm: contentWidth,
      bodyTopMm,
      tableTopMm,
      tableXMm: nutritionXMm,
      tableWidthMm: nutritionWidthMm,
      tableHeightMm: nutritionHeightMm,
      fontMm: strategy.bodyFontMm,
      spacingMm: strategy.spacingMm
    });

    if (compactFlow.overflow) {
      overflow = true;
      overflowAreaMm2 += compactFlow.overflowAreaMm2;
    }

    elements.push(...compactFlow.elements);
  } else {
    const columns = createColumns(strategy, label, bodyTopMm, bodyBottomMm);

    languages.forEach((language, index) => {
      const column = columns.reduce((bestColumn, candidateColumn) =>
        candidateColumn.cursorY < bestColumn.cursorY ? candidateColumn : bestColumn
      );
      const content = product.languages[language] ?? {};
      const block = createLanguageBlock(
        product,
        language,
        content,
        column.x,
        column.cursorY,
        column.width,
        strategy,
        label
      );
      const blockBottom = block.yMm + block.heightMm;

      if (blockBottom > bodyBottomMm) {
        overflow = true;
        overflowAreaMm2 += (blockBottom - bodyBottomMm) * column.width;
        block.elements.forEach((element) => {
          element.overflow = true;
        });
      }

      elements.push(...block.elements);

      if (index < languages.length - 1) {
        elements.push({
          kind: "line",
          id: `language-separator-${language}-${index}`,
          role: "language-separator",
          xMm: column.x,
          yMm: blockBottom + strategy.spacingMm / 2,
          widthMm: column.width,
          heightMm: 0,
          thicknessMm: 0.15,
          direction: "horizontal",
          overflow: blockBottom > bodyBottomMm
        });
      }

      column.cursorY = blockBottom + strategy.spacingMm;
    });
  }

  const table = createNutritionTableElement(
    product,
    languages,
    nutritionXMm,
    tableTopMm,
    nutritionWidthMm,
    strategy,
    label
  );

  if (tableTopMm < bodyTopMm) {
    overflow = true;
    overflowAreaMm2 += (bodyTopMm - tableTopMm) * contentWidth;
    table.overflow = true;
  }

  elements.push(table);

  const usedTextHeights = elements.flatMap((element) => {
    if (element.kind === "text") {
      return [element.fontMm];
    }

    if (element.kind === "table") {
      return [element.fontMm];
    }

    return [];
  });
  const usedMinTextHeightMm = Math.min(...usedTextHeights, Number.POSITIVE_INFINITY);

  if (usedMinTextHeightMm < minimumFontMm) {
    warnings.push(
      label.fontFamily === "arial"
        ? `Violacion critica: Arial por debajo de ${MIN_ARIAL_POINT_SIZE} pt.`
        : "Violacion critica: texto por debajo de 1.2 mm."
    );
    overflow = true;
  }

  if (strategy.bodyFontMm === minimumFontMm) {
    warnings.push(
      label.fontFamily === "arial"
        ? `El motor llego al minimo Arial de ${MIN_ARIAL_POINT_SIZE} pt.`
        : "El motor llego al minimo industrial de texto: 1.2 mm."
    );
  }

  if (overflow) {
    warnings.push(
      "Overflow detectado: reduzca contenido, aumente etiqueta o divida idiomas."
    );
  }

  return {
    label,
    languages,
    strategy,
    elements,
    overflow,
    warnings,
    metrics: {
      minTextHeightMm: minimumFontMm,
      usedMinTextHeightMm,
      overflowAreaMm2,
      elementCount: elements.length
    }
  };
}

function createCompactBodyFlowElements({
  text,
  marginMm,
  contentWidthMm,
  bodyTopMm,
  tableTopMm,
  tableXMm,
  tableWidthMm,
  tableHeightMm,
  fontMm,
  spacingMm
}: {
  text: string;
  marginMm: number;
  contentWidthMm: number;
  bodyTopMm: number;
  tableTopMm: number;
  tableXMm: number;
  tableWidthMm: number;
  tableHeightMm: number;
  fontMm: number;
  spacingMm: number;
}): { elements: LayoutElement[]; overflow: boolean; overflowAreaMm2: number } {
  const lineHeight = 1.12;
  const lineAdvanceMm = fontMm * lineHeight;
  const topHeightMm = Math.max(0, tableTopMm - spacingMm - bodyTopMm);
  const gapMm = Math.max(1, spacingMm);
  const contentRightMm = marginMm + contentWidthMm;
  const tableRightMm = tableXMm + tableWidthMm;
  const leftSideWidthMm = Math.max(0, tableXMm - marginMm - gapMm);
  const rightSideWidthMm = Math.max(0, contentRightMm - tableRightMm - gapMm);
  const sideRegions = [
    {
      id: "language-compact-body-side-left",
      xMm: marginMm,
      yMm: tableTopMm,
      widthMm: leftSideWidthMm,
      maxLines: Math.max(0, Math.floor(tableHeightMm / lineAdvanceMm))
    },
    {
      id: "language-compact-body-side-right",
      xMm: tableRightMm + gapMm,
      yMm: tableTopMm,
      widthMm: rightSideWidthMm,
      maxLines: Math.max(0, Math.floor(tableHeightMm / lineAdvanceMm))
    }
  ]
    .filter(
      (region) =>
        region.maxLines > 0 &&
        region.widthMm >= Math.max(10, fontMm * 7.5)
    )
    .sort((left, right) => right.widthMm - left.widthMm);
  const regions = [
    {
      id: "language-compact-body-main",
      xMm: marginMm,
      yMm: bodyTopMm,
      widthMm: contentWidthMm,
      maxLines: Math.max(0, Math.floor(topHeightMm / lineAdvanceMm))
    },
    ...sideRegions
  ];
  const flow = flowRichTextIntoRegions(
    text,
    regions.map((region) => ({
      widthMm: region.widthMm,
      maxLines: region.maxLines
    })),
    fontMm
  );
  const elements = flow.regions.flatMap((lines, index) => {
    if (!lines.length) {
      return [];
    }

    const region = regions[index];
    const elementHeightMm = lines.length * lineAdvanceMm;

    return [
      {
        kind: "text" as const,
        id: region.id,
        role: "language-body",
        xMm: region.xMm,
        yMm: region.yMm,
        widthMm: region.widthMm,
        heightMm: elementHeightMm,
        fontMm,
        lineHeight,
        text: lines.map(richTextLineToMarkedText).join("\n"),
        overflow: flow.overflow && index === flow.regions.length - 1
      }
    ];
  });

  if (!elements.length && text.trim()) {
    return {
      elements: [
        {
          kind: "text",
          id: "language-compact-body-main",
          role: "language-body",
          xMm: marginMm,
          yMm: bodyTopMm,
          widthMm: contentWidthMm,
          heightMm: lineAdvanceMm,
          fontMm,
          lineHeight,
          text,
          overflow: true
        }
      ],
      overflow: true,
      overflowAreaMm2: contentWidthMm * lineAdvanceMm
    };
  }

  return {
    elements,
    overflow: flow.overflow,
    overflowAreaMm2: flow.overflow ? Math.max(1, contentWidthMm * lineAdvanceMm) : 0
  };
}

function createColumns(
  strategy: LayoutStrategy,
  label: Required<LabelSpec>,
  bodyTopMm: number,
  bodyBottomMm: number
): Array<{ x: number; width: number; cursorY: number }> {
  const gutterMm = strategy.spacingMm;
  const totalGutter = (strategy.columns - 1) * gutterMm;
  const contentWidth = label.widthMm - strategy.marginMm * 2;
  const columnWidth = (contentWidth - totalGutter) / strategy.columns;

  return Array.from({ length: strategy.columns }, (_, index) => ({
    x: strategy.marginMm + index * (columnWidth + gutterMm),
    width: columnWidth,
    cursorY: bodyTopMm + Math.max(0, bodyBottomMm - bodyTopMm) * 0
  }));
}

type CompactSectionKey =
  | "ingredients"
  | "warnings"
  | "conservation"
  | "origin"
  | "importer";

const COMPACT_SECTION_ORDER: CompactSectionKey[] = [
  "ingredients",
  "warnings",
  "conservation",
  "origin",
  "importer"
];

function createCompactMultilingualBodyText(
  product: ProductRecord,
  languages: LanguageCode[]
): string {
  const sectionRows = COMPACT_SECTION_ORDER.map((sectionKey) =>
    createCompactSectionRow(product, languages, sectionKey)
  ).filter(Boolean);
  const customRows = createCompactCustomSectionRows(product, languages);

  return [...sectionRows, ...customRows].join("\n");
}

function createCompactSectionRow(
  product: ProductRecord,
  languages: LanguageCode[],
  sectionKey: CompactSectionKey
): string {
  return languages
    .map((language) => {
      const content = product.languages[language] ?? {};
      const value =
        sectionKey === "origin"
          ? content.origin || product.countryOfOrigin
          : content[sectionKey];

      if (!value?.trim()) {
        return "";
      }

      return `**(${language}) ${SECTION_LABELS[language][sectionKey]}:** ${value.trim()}`;
    })
    .filter(Boolean)
    .join(" / ");
}

function createCompactCustomSectionRows(
  product: ProductRecord,
  languages: LanguageCode[]
): string[] {
  const maxCustomSections = Math.max(
    0,
    ...languages.map(
      (language) => product.languages[language]?.customSections?.length ?? 0
    )
  );

  return Array.from({ length: maxCustomSections }, (_, index) =>
    languages
      .map((language) => {
        const section = product.languages[language]?.customSections?.[index];

        if (!section?.body?.trim() && !section?.title?.trim()) {
          return "";
        }

        const title = section.title?.trim();
        const body = section.body?.trim();

        if (title && body) {
          return `**(${language}) ${title}:** ${body}`;
        }

        return `**(${language})** ${body || title}`;
      })
      .filter(Boolean)
      .join(" / ")
  ).filter(Boolean);
}

function createLanguageBlock(
  product: ProductRecord,
  language: LanguageCode,
  content: ProductLanguageContent,
  xMm: number,
  yMm: number,
  widthMm: number,
  strategy: LayoutStrategy,
  label: Required<LabelSpec>
): { yMm: number; heightMm: number; elements: LayoutElement[] } {
  const compactPreset = isCompactVisualPreset(label);
  const bodyText = createLanguageBodyText(product, language, content, compactPreset);
  const bodyLineHeight = compactPreset ? 1.05 : 1.2;
  const bodyHeight = measureRichTextHeightMm(
    bodyText,
    widthMm,
    strategy.bodyFontMm,
    bodyLineHeight
  );

  if (compactPreset) {
    return {
      yMm,
      heightMm: bodyHeight,
      elements: [
        {
          kind: "text",
          id: `language-${language}-body`,
          role: "language-body",
          language,
          xMm,
          yMm,
          widthMm,
          heightMm: bodyHeight,
          fontMm: strategy.bodyFontMm,
          lineHeight: bodyLineHeight,
          text: bodyText
        }
      ]
    };
  }

  const headingText = `(${language})`;
  const headingHeight = measureTextHeightMm(
    stripRichTextMarkers(headingText),
    widthMm,
    strategy.bodyFontMm,
    1.15
  );
  const bodyY = yMm + headingHeight + 0.25;
  const blockHeight = headingHeight + 0.25 + bodyHeight;

  return {
    yMm,
    heightMm: blockHeight,
    elements: [
      {
        kind: "text",
        id: `language-${language}-heading`,
        role: "language-heading",
        language,
        xMm,
        yMm,
        widthMm,
        heightMm: headingHeight,
        fontMm: strategy.bodyFontMm,
        lineHeight: 1.15,
        weight: "bold",
        text: headingText
      },
      {
        kind: "text",
        id: `language-${language}-body`,
        role: "language-body",
        language,
        xMm,
        yMm: bodyY,
        widthMm,
        heightMm: bodyHeight,
        fontMm: strategy.bodyFontMm,
        lineHeight: bodyLineHeight,
        text: bodyText
      }
    ]
  };
}

function createLanguageBodyText(
  product: ProductRecord,
  language: LanguageCode,
  content: ProductLanguageContent,
  inlineLanguageHeading = false
): string {
  const labels = SECTION_LABELS[language];

  if (inlineLanguageHeading) {
    const bodyParts: string[] = [];

    if (content.ingredients?.trim()) {
      bodyParts.push(`**(${language}) ${labels.ingredients}:** ${content.ingredients}`);
    } else {
      bodyParts.push(`**(${language})**`);
    }

    [
      content.warnings,
      content.conservation,
      content.origin || product.countryOfOrigin,
      content.importer,
      ...(content.customSections ?? []).map((section) =>
        section.body?.trim() ? section.body : section.title
      )
    ].forEach((value) => {
      if (value?.trim()) {
        bodyParts.push(value.trim());
      }
    });

    return bodyParts.join(" ");
  }

  const sections = [
    content.ingredients
      ? { title: labels.ingredients, body: content.ingredients }
      : undefined,
    content.warnings ? { title: labels.warnings, body: content.warnings } : undefined,
    content.conservation
      ? { title: labels.conservation, body: content.conservation }
      : undefined,
    content.origin || product.countryOfOrigin
      ? { title: labels.origin, body: content.origin || product.countryOfOrigin }
      : undefined,
    content.importer ? { title: labels.importer, body: content.importer } : undefined,
    ...(content.customSections ?? []).map(
      (section) => ({ title: section.title, body: section.body })
    )
  ]
    .filter(Boolean)
    .map((section) => section as { title: string; body: string });

  if (!sections.length) return "";

  return sections
    .map((section) => `**${section.title}:** ${section.body}`)
    .join("\n");
}

function calculateNutritionHeight(
  product: ProductRecord,
  languages: LanguageCode[],
  strategy: LayoutStrategy,
  widthMm: number,
  label: Required<LabelSpec>
): number {
  return (
    createNutritionRowHeights(product, languages, strategy, widthMm, label).reduce(
      (total, height) => total + height,
      0
    ) + 0.8
  );
}

function createNutritionTableElement(
  product: ProductRecord,
  languages: LanguageCode[],
  xMm: number,
  yMm: number,
  widthMm: number,
  strategy: LayoutStrategy,
  label: Required<LabelSpec>
): TableElement {
  const primaryLanguage = languages[0] ?? "EN";
  const hasServing = shouldShowServingColumn(product, label);
  const hasRi = shouldShowRiColumn(product, label);
  const baseMeasure = formatBaseMeasure(product.nutrition);
  const columnFractions = getNutritionColumnFractions(hasServing, hasRi, label);
  const headerText = formatNutritionHeaderText(product, languages, baseMeasure);
  const header: TableCell[] = [
    {
      text: headerText,
      align: "center",
      weight: "bold",
      colSpan: columnFractions.length
    }
  ];
  const subHeader: TableCell[] = [
    { text: "", weight: "bold" },
    { text: baseMeasure, align: "right", weight: "bold" }
  ];

  if (hasServing) {
    subHeader.push({
      text: product.nutrition.servingSize
        ? product.nutrition.servingSize
        : servingHeader(primaryLanguage),
      align: "right",
      weight: "bold"
    });
  }

  if (hasRi) {
    subHeader.push({ text: "%RI", align: "right", weight: "bold" });
  }

  const cells: TableCell[][] = [
    header,
    ...(hasServing || hasRi ? [subHeader] : []),
    ...product.nutrition.rows.map((row) => {
      const valueCells: TableCell[] = [
        {
          text: `${row.indent ? "- " : ""}${combineNutrientLabels(row, languages)}`,
          align: "left"
        },
        { text: row.per100g, align: "right" }
      ];

      if (hasServing) {
        valueCells.push({ text: row.perServing ?? "-", align: "right" });
      }

      if (hasRi) {
        valueCells.push({ text: row.riPercent ?? "-", align: "right" });
      }

      return valueCells;
    })
  ];
  const rowHeightsMm = createNutritionRowHeights(
    product,
    languages,
    strategy,
    widthMm,
    label
  );
  const rowHeightMm = Math.max(3.1, strategy.tableFontMm * 2.1);

  return {
    kind: "table" as const,
    id: "nutrition-table",
    role: "nutrition",
    xMm,
    yMm,
    widthMm,
    heightMm: rowHeightsMm.reduce((total, height) => total + height, 0),
    cells,
    columnFractions,
    rowHeightMm,
    rowHeightsMm,
    fontMm: strategy.tableFontMm
  };
}

function createNutritionRowHeights(
  product: ProductRecord,
  languages: LanguageCode[],
  strategy: LayoutStrategy,
  widthMm: number,
  label: Required<LabelSpec>
): number[] {
  const hasServing = shouldShowServingColumn(product, label);
  const hasRi = shouldShowRiColumn(product, label);
  const columnFractions = getNutritionColumnFractions(hasServing, hasRi, label);
  const columnWidths = columnFractions.map((fraction) =>
    Math.max(2, widthMm * fraction - 1.6)
  );
  const baseMeasure = formatBaseMeasure(product.nutrition);
  const headerText = formatNutritionHeaderText(product, languages, baseMeasure);
  const lineHeight = isCompactVisualPreset(label) ? 1.08 : 1.02;
  const rowPaddingMm = clampMm(label.nutritionTableRowPaddingMm, 0.2, 2);
  const headerHeight = Math.max(
    isCompactVisualPreset(label) ? 4.2 : 4.8,
    measureRichTextHeightMm(
      headerText,
      widthMm - 1.6,
      strategy.tableFontMm,
      isCompactVisualPreset(label) ? 1 : 1.05
    ) + rowPaddingMm
  );
  const rowHeights = [headerHeight];

  if (hasServing || hasRi) {
    const primaryLanguage = languages[0] ?? "EN";
    const subHeaderTexts = [
      "",
      baseMeasure,
      ...(hasServing
        ? [product.nutrition.servingSize || servingHeader(primaryLanguage)]
        : []),
      ...(hasRi ? ["%RI"] : [])
    ];
    const subHeaderHeight = measureRowHeightMm(
      subHeaderTexts,
      columnWidths,
      strategy.tableFontMm,
      lineHeight
    );

    rowHeights.push(
      Math.max(
        isCompactVisualPreset(label) ? 2.35 : 2.65,
        subHeaderHeight
      ) + rowPaddingMm
    );
  }

  product.nutrition.rows.forEach((row) => {
    const rowTexts = [
      `${row.indent ? "- " : ""}${combineNutrientLabels(row, languages)}`,
      row.per100g,
      ...(hasServing ? [row.perServing ?? "-"] : []),
      ...(hasRi ? [row.riPercent ?? "-"] : [])
    ];
    const rowTextHeight = measureRowHeightMm(
      rowTexts,
      columnWidths,
      strategy.tableFontMm,
      lineHeight
    );

    rowHeights.push(
      Math.max(isCompactVisualPreset(label) ? 2.25 : 2.45, rowTextHeight) +
        rowPaddingMm
    );
  });

  return rowHeights;
}

function measureRowHeightMm(
  texts: string[],
  columnWidthsMm: number[],
  fontMm: number,
  lineHeight: number
): number {
  return texts.reduce((height, text, index) => {
    const measured = measureRichTextHeightMm(
      text,
      columnWidthsMm[index] ?? columnWidthsMm[0] ?? 10,
      fontMm,
      lineHeight
    );

    return Math.max(height, measured);
  }, 0);
}

function getNutritionColumnFractions(
  hasServing: boolean,
  hasRi: boolean,
  label: Required<LabelSpec>
): number[] {
  const labelFraction =
    clampPercent(label.nutritionLabelColumnPercent, 45, hasServing || hasRi ? 72 : 82) /
    100;

  if (hasServing && hasRi) {
    const riFraction = 0.06;
    const remaining = Math.max(0.18, 1 - labelFraction - riFraction);
    return [labelFraction, remaining * 0.53, remaining * 0.47, riFraction];
  }

  if (hasServing) {
    const remaining = Math.max(0.2, 1 - labelFraction);
    return [labelFraction, remaining * 0.55, remaining * 0.45];
  }

  if (hasRi) {
    const riFraction = 0.1;
    const remaining = Math.max(0.16, 1 - labelFraction - riFraction);
    return [labelFraction, remaining, riFraction];
  }

  const valueFraction = clampPercent(label.nutritionValueColumnPercent, 18, 42) / 100;
  return [1 - valueFraction, valueFraction];
}

function shouldShowServingColumn(
  product: ProductRecord,
  label: Required<LabelSpec>
): boolean {
  return Boolean(
    label.nutritionShowServing &&
      product.nutrition.rows.some((row) => row.perServing?.trim())
  );
}

function shouldShowRiColumn(
  product: ProductRecord,
  label: Required<LabelSpec>
): boolean {
  return Boolean(
    label.nutritionShowRiPercent &&
      product.nutrition.rows.some((row) => row.riPercent?.trim())
  );
}

function getNutritionTableWidthMm(
  label: Required<LabelSpec>,
  contentWidthMm: number
): number {
  if (label.nutritionTableAlign === "full") {
    return contentWidthMm;
  }

  return (
    contentWidthMm *
    (clampPercent(label.nutritionTableWidthPercent, 48, 100) / 100)
  );
}

function getNutritionTableXMm(
  label: Required<LabelSpec>,
  marginMm: number,
  contentWidthMm: number,
  tableWidthMm: number
): number {
  const extraWidth = Math.max(0, contentWidthMm - tableWidthMm);

  if (label.nutritionTableAlign === "center") {
    return marginMm + extraWidth / 2;
  }

  if (label.nutritionTableAlign === "right") {
    return marginMm + extraWidth;
  }

  return marginMm;
}

function clampPercent(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function clampMm(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function formatBaseMeasure(nutrition: ProductRecord["nutrition"]): string {
  return `${nutrition.baseQuantity || "100"} ${nutrition.baseUnit || "g"}`;
}

function combineNutritionTitles(languages: LanguageCode[]): string {
  return languages
    .map((language) => nutritionTitle(language))
    .filter(Boolean)
    .join(" / ");
}

function combineValuesPerLabels(
  languages: LanguageCode[],
  baseMeasure: string
): string {
  return languages
    .map((language) => valuesPerLabel(language, baseMeasure))
    .filter(Boolean)
    .join(" / ");
}

function formatNutritionHeaderText(
  product: ProductRecord,
  languages: LanguageCode[],
  baseMeasure: string
): string {
  const customHeaders = product.nutrition.headerTextByLanguage ?? {};
  const headerByLanguage = languages
    .map((language) => {
      const override = customHeaders[language]?.trim();

      if (override) {
        return override;
      }

      return `${nutritionTitle(language)} ${valuesPerLabel(language, baseMeasure)}`;
    })
    .filter(Boolean);

  if (headerByLanguage.length) {
    return headerByLanguage.join(" / ");
  }

  return `${combineNutritionTitles(languages)}\n${combineValuesPerLabels(
    languages,
    baseMeasure
  )}`;
}

function combineNutrientLabels(
  row: ProductRecord["nutrition"]["rows"][number],
  languages: LanguageCode[]
): string {
  return languages
    .map((language) => row.label[language] ?? row.label.EN)
    .filter(Boolean)
    .join(" / ");
}

function nutritionTitle(language: LanguageCode): string {
  const overrides: Partial<Record<LanguageCode, string>> = {
    DE: "Nährwertangaben",
    ES: "Información nutricional",
    EN: "Nutrition information",
    FR: "Déclaration nutritionnelle",
    NL: "Voedingswaarde",
    IT: "Dichiarazione nutrizionale",
    PT: "Informação nutricional"
  };

  return overrides[language] ?? SECTION_LABELS[language].nutrition;
}

function valuesPerLabel(language: LanguageCode, baseMeasure: string): string {
  const templates: Partial<Record<LanguageCode, string>> = {
    DE: `Werte je ${baseMeasure}`,
    ES: `Valores por ${baseMeasure}`,
    EN: `Values per ${baseMeasure}`,
    FR: `Valeurs pour ${baseMeasure}`,
    NL: `Waarden per ${baseMeasure}`,
    IT: `Valori per ${baseMeasure}`,
    DA: `Værdier pr. ${baseMeasure}`,
    NO: `Verdier per ${baseMeasure}`,
    FI: `Arvot per ${baseMeasure}`,
    EL: `Τιμές ανά ${baseMeasure}`,
    SV: `Värden per ${baseMeasure}`,
    PL: `Wartości w ${baseMeasure}`,
    SL: `Vrednosti na ${baseMeasure}`,
    CS: `Hodnoty na ${baseMeasure}`,
    HU: `Értékek ${baseMeasure}`,
    SK: `Hodnoty na ${baseMeasure}`,
    RO: `Valori per ${baseMeasure}`,
    PT: `Valores por ${baseMeasure}`,
    HR: `Vrijednosti na ${baseMeasure}`,
    ET: `Väärtused ${baseMeasure} kohta`
  };

  return templates[language] ?? `Values per ${baseMeasure}`;
}

function servingHeader(language: LanguageCode): string {
  const labels: Partial<Record<LanguageCode, string>> = {
    DE: "Portion",
    ES: "Porción",
    EN: "Serving",
    FR: "Portion",
    NL: "Portie",
    IT: "Porzione",
    PT: "Porção"
  };

  return labels[language] ?? "Serving";
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values.map((value) => Number(value.toFixed(2))))];
}

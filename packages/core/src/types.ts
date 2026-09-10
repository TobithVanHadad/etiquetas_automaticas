export type LanguageCode =
  | "DE"
  | "ES"
  | "FR"
  | "NL"
  | "EN"
  | "IT"
  | "DA"
  | "NO"
  | "FI"
  | "EL"
  | "SV"
  | "PL"
  | "SL"
  | "CS"
  | "HU"
  | "SK"
  | "RO"
  | "PT"
  | "HR"
  | "ET";

export type SectionKey =
  | "name"
  | "ingredients"
  | "nutrition"
  | "warnings"
  | "conservation"
  | "origin"
  | "importer";

export interface LanguageDefinition {
  code: LanguageCode;
  name: string;
  nativeName: string;
}

export interface ProductLanguageContent {
  name?: string;
  ingredients?: string;
  warnings?: string;
  conservation?: string;
  origin?: string;
  importer?: string;
  customSections?: Array<{
    title: string;
    body: string;
  }>;
}

export interface NutritionRow {
  id: string;
  label: Partial<Record<LanguageCode, string>> & { EN: string };
  per100g: string;
  perServing?: string;
  riPercent?: string;
  indent?: boolean;
}

export interface NutritionTable {
  servingSize?: string;
  baseQuantity?: string;
  baseUnit?: "g" | "ml" | "kg" | "l";
  headerTextByLanguage?: Partial<Record<LanguageCode, string>>;
  rows: NutritionRow[];
}

export interface LabelAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  lastModified: number;
  uploadedAt: string;
  dataUrl: string;
}

export type ProductMetadataValue =
  | string
  | number
  | boolean
  | null
  | LabelAttachment[]
  | Record<string, unknown>;

export interface ProductRecord {
  sku: string;
  name: string;
  gtin?: string;
  brand?: string;
  netWeight?: string;
  countryOfOrigin?: string;
  languages: Partial<Record<LanguageCode, ProductLanguageContent>>;
  nutrition: NutritionTable;
  metadata?: Record<string, ProductMetadataValue>;
}

export interface LabelSpec {
  widthMm: number;
  heightMm: number;
  dpi: number;
  marginMm?: number;
  fontFamily?: "zebra" | "zebra-native" | "arial";
  zplFontRegular?: string;
  zplFontBold?: string;
  visualPreset?: "crevel-current" | "industrial-plain" | "poblano-import";
  headerTextScalePercent?: number;
  bodyTextScalePercent?: number;
  nutritionTableWidthPercent?: number;
  nutritionTableAlign?: "left" | "center" | "right" | "full";
  nutritionValueColumnPercent?: number;
  nutritionLabelColumnPercent?: number;
  nutritionTableBottomOffsetMm?: number;
  nutritionTableRowPaddingMm?: number;
  nutritionTableFontScalePercent?: number;
  nutritionShowServing?: boolean;
  nutritionShowRiPercent?: boolean;
}

export interface LayoutOptions {
  product: ProductRecord;
  languages: LanguageCode[];
  label: LabelSpec;
}

export interface LayoutStrategy {
  id: string;
  description: string;
  columns: number;
  marginMm: number;
  bodyFontMm: number;
  tableFontMm: number;
  spacingMm: number;
  official: boolean;
}

interface LayoutElementBase {
  id: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  role: string;
  overflow?: boolean;
}

export interface TextElement extends LayoutElementBase {
  kind: "text";
  text: string;
  fontMm: number;
  lineHeight: number;
  language?: LanguageCode;
  weight?: "regular" | "bold";
  align?: "left" | "center" | "right";
}

export interface LineElement extends LayoutElementBase {
  kind: "line";
  thicknessMm: number;
  direction: "horizontal" | "vertical";
}

export interface BoxElement extends LayoutElementBase {
  kind: "box";
  thicknessMm: number;
}

export interface QrElement extends LayoutElementBase {
  kind: "qr";
  data: string;
}

export interface BarcodeElement extends LayoutElementBase {
  kind: "barcode";
  data: string;
  symbology: "GS1-128" | "CODE128";
}

export interface TableCell {
  text: string;
  colSpan?: number;
  align?: "left" | "center" | "right";
  fontMm?: number;
  weight?: "regular" | "bold";
}

export interface TableElement extends LayoutElementBase {
  kind: "table";
  cells: TableCell[][];
  columnFractions: number[];
  rowHeightMm: number;
  rowHeightsMm?: number[];
  fontMm: number;
}

export type LayoutElement =
  | TextElement
  | LineElement
  | BoxElement
  | QrElement
  | BarcodeElement
  | TableElement;

export interface LayoutResult {
  label: Required<LabelSpec>;
  languages: LanguageCode[];
  strategy: LayoutStrategy;
  elements: LayoutElement[];
  overflow: boolean;
  warnings: string[];
  metrics: {
    minTextHeightMm: number;
    usedMinTextHeightMm: number;
    overflowAreaMm2: number;
    elementCount: number;
  };
}

"use client";

import {
  AlertTriangle,
  Bold,
  Database,
  Download,
  Eraser,
  FileCode2,
  Languages,
  Minus,
  Paperclip,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Send,
  Table2,
  Trash2,
  X,
  Upload
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  composeLabel,
  generateZpl,
  mmToDots,
  NUTRIENT_CATALOG,
  OFFICIAL_COMBINATIONS,
  sampleProduct,
  SECTION_LABELS,
  SUPPORTED_LANGUAGES,
  type LabelSpec,
  type LabelAttachment,
  type LanguageCode,
  type NutritionRow,
  type ProductLanguageContent,
  type ProductRecord
} from "@industrial-label/core";
import { LabelPreview } from "./label-preview";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const LOCAL_PRINT_BRIDGE_URL = "http://127.0.0.1:4000";
const LABEL_ATTACHMENT_ACCEPT =
  ".pdf,.nlbl,.btw,image/png,image/jpeg,image/webp,image/gif";
const MAX_LABEL_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const MAX_LABEL_ATTACHMENTS_TOTAL_BYTES = 45 * 1024 * 1024;
const PRINTER_PROFILES = [
  {
    id: "zt610-203",
    label: "ZT610 203 DPI",
    printerName: "ZDesigner ZT610-203dpi ZPL",
    dpi: 203
  },
  {
    id: "zt610-300",
    label: "ZT610 300 DPI",
    printerName: "ZDesigner ZT610-300dpi ZPL",
    dpi: 300
  }
] as const;
const DEFAULT_PRINTER_PROFILE_ID = "zt610-203";

type PrinterProfileId = (typeof PRINTER_PROFILES)[number]["id"];
type PrinterProfile = (typeof PRINTER_PROFILES)[number];

type WorkbenchNotice = {
  tone: "success" | "error" | "info";
  message: string;
};

type PrintPayload = {
  queued?: boolean;
  dryRun?: boolean;
  reason?: string;
  error?: string;
  printer?: string;
  zpl?: string;
  source?: string;
  [key: string]: unknown;
};

type RawImportResult = {
  detected: string[];
  missing: string[];
  warnings: string[];
};

const PRODUCT_METADATA_FIELDS = [
  "status",
  "notes",
  "files",
  "customer",
  "format"
] as const;

type ProductMetadataField = (typeof PRODUCT_METADATA_FIELDS)[number];

export function IndustrialLabelWorkbench() {
  const [product, setProduct] = useState<ProductRecord>(
    withDefaultProductMetadata(sampleProduct)
  );
  const [products, setProducts] = useState<ProductRecord[]>([
    withDefaultProductMetadata(sampleProduct)
  ]);
  const [languages, setLanguages] = useState<LanguageCode[]>([
    "DE",
    "ES",
    "FR",
    "NL",
    "EN"
  ]);
  const [activeLanguage, setActiveLanguage] = useState<LanguageCode>("DE");
  const [label, setLabel] = useState<Required<LabelSpec>>({
    widthMm: 100,
    heightMm: 150,
    dpi: 203,
    marginMm: 4,
    fontFamily: "zebra",
    zplFontRegular: "E:ARIAL.TTF",
    zplFontBold: "E:ARIALBD.TTF",
    visualPreset: "crevel-current",
    headerTextScalePercent: 100,
    bodyTextScalePercent: 100,
    nutritionTableWidthPercent: 64,
    nutritionTableAlign: "right",
    nutritionValueColumnPercent: 25,
    nutritionLabelColumnPercent: 58,
    nutritionTableBottomOffsetMm: 0,
    nutritionTableRowPaddingMm: 0.55,
    nutritionTableFontScalePercent: 100,
    nutritionShowServing: false,
    nutritionShowRiPercent: false
  });
  const [zoom, setZoom] = useState(1);
  const [exportText, setExportText] = useState("");
  const [rawText, setRawText] = useState("");
  const rawTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [previewSelection, setPreviewSelection] = useState("");
  const [rawImportResult, setRawImportResult] = useState<RawImportResult | null>(
    null
  );
  const [notice, setNotice] = useState<WorkbenchNotice | null>(null);
  const [apiStatus, setApiStatus] = useState<"checking" | "online" | "offline">(
    "checking"
  );
  const [selectedNutrient, setSelectedNutrient] = useState("vitamin_d");
  const [printerProfileId, setPrinterProfileId] = useState<PrinterProfileId>(
    DEFAULT_PRINTER_PROFILE_ID
  );
  const selectedPrinterProfile =
    PRINTER_PROFILES.find((profile) => profile.id === printerProfileId) ??
    PRINTER_PROFILES[0];

  useEffect(() => {
    fetch(`${API_URL}/products`)
      .then((response) => response.json())
      .then((payload: { products?: ProductRecord[] }) => {
        if (payload.products?.length) {
          const hydratedProducts = payload.products.map(withDefaultProductMetadata);
          setProducts(hydratedProducts);
          setProduct(hydratedProducts[0]);
          applySavedLabelSettings(hydratedProducts[0]);
        }
        setApiStatus("online");
      })
      .catch(() => setApiStatus("offline"));
  }, []);

  const layout = useMemo(
    () =>
      composeLabel({
        product,
        languages,
        label
      }),
    [product, languages, label]
  );

  const selectedContent = product.languages[activeLanguage] ?? {};
  const labelAttachments = useMemo(() => getLabelAttachments(product), [product]);
  const nutritionBaseMeasure = `${product.nutrition.baseQuantity || "100"} ${
    product.nutrition.baseUnit || "g"
  }`;
  const nutritionEditorGridTemplate = `minmax(0,1fr) 94px${
    label.nutritionShowServing ? " 94px" : ""
  }${label.nutritionShowRiPercent ? " 62px" : ""} 34px`;
  const validationIssues = useMemo(
    () => getProductValidationIssues(product, languages),
    [product, languages]
  );
  const previewDots = useMemo(
    () => ({
      width: mmToDots(label.widthMm, label.dpi),
      height: mmToDots(label.heightMm, label.dpi)
    }),
    [label.widthMm, label.heightMm, label.dpi]
  );

  function updateProduct(next: Partial<ProductRecord>) {
    setProduct((current) => ({
      ...current,
      ...next
    }));
  }

  function applySavedLabelSettings(productToApply: ProductRecord) {
    const saved = readProductLabelSettings(productToApply);

    if (saved.label) {
      setLabel((current) => ({
        ...current,
        ...saved.label
      }));
    }

    if (saved.printerProfileId) {
      setPrinterProfileId(saved.printerProfileId);
    } else if (saved.label?.dpi) {
      setPrinterProfileId(getPrinterProfileIdForDpi(saved.label.dpi));
    }
  }

  function updateProductMetadata(field: ProductMetadataField, value: string) {
    setProduct((current) =>
      withDefaultProductMetadata({
        ...current,
        metadata: {
          ...current.metadata,
          [field]: value
        }
      })
    );
  }

  function updateLanguageContent(
    language: LanguageCode,
    field: keyof NonNullable<ProductRecord["languages"][LanguageCode]>,
    value: string
  ) {
    setProduct((current) => ({
      ...current,
      languages: {
        ...current.languages,
        [language]: {
          ...current.languages[language],
          [field]: value
        }
      }
    }));
  }

  function addCustomSection(language: LanguageCode) {
    setProduct((current) => {
      const content = current.languages[language] ?? {};

      return {
        ...current,
        languages: {
          ...current.languages,
          [language]: {
            ...content,
            customSections: [
              ...(content.customSections ?? []),
              { title: "Leyenda", body: "" }
            ]
          }
        }
      };
    });
  }

  function updateCustomSection(
    language: LanguageCode,
    index: number,
    nextSection: Partial<{ title: string; body: string }>
  ) {
    setProduct((current) => {
      const content = current.languages[language] ?? {};
      const customSections = [...(content.customSections ?? [])];
      const currentSection = customSections[index] ?? { title: "", body: "" };
      customSections[index] = { ...currentSection, ...nextSection };

      return {
        ...current,
        languages: {
          ...current.languages,
          [language]: {
            ...content,
            customSections
          }
        }
      };
    });
  }

  function removeCustomSection(language: LanguageCode, index: number) {
    setProduct((current) => {
      const content = current.languages[language] ?? {};

      return {
        ...current,
        languages: {
          ...current.languages,
          [language]: {
            ...content,
            customSections: (content.customSections ?? []).filter(
              (_, sectionIndex) => sectionIndex !== index
            )
          }
        }
      };
    });
  }

  function toggleLanguage(language: LanguageCode) {
    setLanguages((current) => {
      if (current.includes(language)) {
        const next = current.filter((item) => item !== language);
        return next.length ? next : current;
      }

      return [...current, language];
    });
    setActiveLanguage(language);
  }

  async function persistProduct(
    productToSave: ProductRecord,
    successMessage = "Producto guardado."
  ) {
    try {
      const response = await fetch(`${API_URL}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          cleanProduct(
            withProductLabelSettings(productToSave, label, selectedPrinterProfile)
          )
        )
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = (await response.json()) as { product: ProductRecord };
      const hydrated = withDefaultProductMetadata(payload.product);
      setProduct(hydrated);
      setProducts((current) => upsertLocalProduct(current, hydrated));
      setApiStatus("online");
      setNotice({ tone: "success", message: successMessage });
      return hydrated;
    } catch (error) {
      setApiStatus("offline");
      setNotice({
        tone: "error",
        message: `No se pudo guardar en el servidor: ${String(error)}`
      });
      throw error;
    }
  }

  async function persistProductsBatch(productsToSave: ProductRecord[]) {
    for (const item of productsToSave) {
      const response = await fetch(`${API_URL}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          cleanProduct(withProductLabelSettings(item, label, selectedPrinterProfile))
        )
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
    }

    setApiStatus("online");
  }

  async function saveProduct() {
    await persistProduct(product);
  }

  async function exportFromApi(kind: "zpl" | "btxml" | "json" | "csv") {
    try {
      const response = await fetch(`${API_URL}/export/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: cleanProduct(product), languages, label })
      });
      const payload = await response.json();
      setExportText(payload[kind] ?? "");
      setApiStatus("online");
    } catch {
      setApiStatus("offline");
      setExportText(
        kind === "zpl" ? generateZpl(layout) : JSON.stringify(product, null, 2)
      );
    }
  }

  function downloadZplFile() {
    const zpl = generateZpl(layout);
    const fileName = createDownloadFileName(product, languages, "zpl");

    downloadTextFile(fileName, zpl, "application/zpl;charset=utf-8");
    setExportText(zpl);
    setNotice({
      tone: "success",
      message: `ZPL descargado: ${fileName}`
    });
  }

  function downloadWindowsPrintScript() {
    const zpl = generateZpl(layout);
    const zplFileName = createDownloadFileName(product, languages, "zpl");
    const scriptFileName = createDownloadFileName(product, languages, "ps1");
    const script = createWindowsZplPrintScript({
      zpl,
      zplFileName,
      printerName: selectedPrinterProfile.printerName
    });

    downloadTextFile(scriptFileName, script, "text/plain;charset=utf-8");
    setExportText(script);
    setNotice({
      tone: "success",
      message: `Script Windows descargado: ${scriptFileName}`
    });
  }

  async function printTestLabel() {
    const confirmed = window.confirm(
      `Enviar una etiqueta de prueba a ${selectedPrinterProfile.printerName}?`
    );

    if (!confirmed) {
      return;
    }

    setNotice({
      tone: "info",
      message: `Enviando etiqueta a ${selectedPrinterProfile.printerName}...`
    });

    const fallbackZpl = generateZpl(layout);

    try {
      let payload = await sendCurrentPrintJob(API_URL);

      if (
        !payload.queued &&
        isCloudPrintUnavailable(payload) &&
        !isLocalApiUrl(API_URL)
      ) {
        setNotice({
          tone: "info",
          message:
            "Railway genero el ZPL, pero la impresion fisica requiere el equipo conectado. Intentando puente local en 127.0.0.1:4000..."
        });

        try {
          const localPayload = await sendCurrentPrintJob(LOCAL_PRINT_BRIDGE_URL);
          payload = {
            ...localPayload,
            cloudReason: payload.reason
          };
        } catch (localError) {
          setExportText(
            JSON.stringify(
              {
                queued: false,
                printer: selectedPrinterProfile.printerName,
                reason:
                  "No se encontro el puente local de impresion en 127.0.0.1:4000. Abra la API en la computadora conectada a la Zebra o use el ZPL generado.",
                localError: String(localError),
                cloudReason: payload.reason,
                zpl: fallbackZpl
              },
              null,
              2
            )
          );
          setNotice({
            tone: "error",
            message:
              "No se pudo mandar fisicamente a la Zebra porque no hay puente local activo en esta computadora. Deje el ZPL listo en el panel de exportacion."
          });
          setApiStatus("online");
          return;
        }
      }

      setExportText(JSON.stringify(payload, null, 2));
      setApiStatus("online");

      setNotice({
        tone: payload.queued ? "success" : "error",
        message: payload.queued
          ? `Etiqueta enviada a ${payload.printer ?? selectedPrinterProfile.printerName}.`
          : payload.reason ??
            "La API genero ZPL, pero no confirmo que se haya enviado a la impresora."
      });
    } catch (error) {
      setApiStatus("offline");
      setExportText(
        JSON.stringify(
          {
            queued: false,
            printer: selectedPrinterProfile.printerName,
            error: String(error),
            zpl: fallbackZpl
          },
          null,
          2
        )
      );
      setNotice({
        tone: "error",
        message: `No se pudo contactar el servicio de impresion: ${String(error)}`
      });
    }
  }

  async function sendCurrentPrintJob(apiUrl: string): Promise<PrintPayload> {
    const response = await fetch(`${apiUrl}/print/zebra`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product: cleanProduct(product),
        languages,
        label,
        printer: { name: selectedPrinterProfile.printerName },
        dryRun: false
      })
    });
    const payloadText = await response.text();
    const payload = parsePrintPayload(payloadText);

    if (!response.ok) {
      throw new Error(
        payload.reason || payload.error || `HTTP ${response.status}`
      );
    }

    return {
      ...payload,
      source: apiUrl
    };
  }

  function updateNutritionRow(index: number, next: Partial<NutritionRow>) {
    setProduct((current) => {
      const rows = [...current.nutrition.rows];
      rows[index] = {
        ...rows[index],
        ...next
      };

      return {
        ...current,
        nutrition: {
          ...current.nutrition,
          rows
        }
      };
    });
  }

  function updateNutritionLabel(index: number, language: LanguageCode, value: string) {
    setProduct((current) => {
      const rows = [...current.nutrition.rows];
      rows[index] = {
        ...rows[index],
        label: {
          ...rows[index].label,
          [language]: value
        }
      };

      return {
        ...current,
        nutrition: {
          ...current.nutrition,
          rows
        }
      };
    });
  }

  function addNutritionRow() {
    const item =
      NUTRIENT_CATALOG.find((nutrient) => nutrient.id === selectedNutrient) ??
      NUTRIENT_CATALOG[0];
    const existingIds = new Set(product.nutrition.rows.map((row) => row.id));
    const id = existingIds.has(item.id)
      ? `${item.id}_${Date.now().toString(36)}`
      : item.id;

    setProduct((current) => ({
      ...current,
      nutrition: {
        ...current.nutrition,
        rows: [
          ...current.nutrition.rows,
          {
            id,
            label: item.label,
            per100g: "",
            perServing: "",
            riPercent: "",
            indent: item.indent
          }
        ]
      }
    }));
  }

  function removeNutritionRow(index: number) {
    setProduct((current) => ({
      ...current,
      nutrition: {
        ...current.nutrition,
        rows: current.nutrition.rows.filter((_, rowIndex) => rowIndex !== index)
      }
    }));
  }

  async function attachLabelFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);

    if (!files.length) {
      setNotice({ tone: "info", message: "No se seleccionaron archivos." });
      return;
    }

    const invalid = files.find((file) => !isAllowedLabelAttachment(file));

    if (invalid) {
      setNotice({
        tone: "error",
        message: `Archivo no permitido: ${invalid.name}. Use PDF, imagen, .nlbl o .btw.`
      });
      return;
    }

    const tooLarge = files.find((file) => file.size > MAX_LABEL_ATTACHMENT_BYTES);

    if (tooLarge) {
      setNotice({
        tone: "error",
        message: `Archivo demasiado grande: ${tooLarge.name}. Maximo 15 MB por archivo.`
      });
      return;
    }

    const nextTotalSize =
      getLabelAttachments(product).reduce(
        (total, attachment) => total + attachment.size,
        0
      ) + files.reduce((total, file) => total + file.size, 0);

    if (nextTotalSize > MAX_LABEL_ATTACHMENTS_TOTAL_BYTES) {
      setNotice({
        tone: "error",
        message:
          "Los archivos adjuntos superan 45 MB en total. Quite alguno o use archivos mas ligeros."
      });
      return;
    }

    try {
      const attachments = await Promise.all(files.map(fileToLabelAttachment));
      let nextProduct = setLabelAttachments(product, [
        ...getLabelAttachments(product),
        ...attachments
      ]);
      const referenceFormat = createReferenceFormatName(attachments);

      if (referenceFormat && !getProductMetadata(nextProduct, "format").trim()) {
        nextProduct = setProductMetadata(nextProduct, "format", referenceFormat);
      }

      setProduct(nextProduct);
      setProducts((current) => upsertLocalProduct(current, nextProduct));
      await persistProduct(
        nextProduct,
        referenceFormat
          ? `${attachments.length} archivo(s) cargado(s). Formato visual guardado: ${referenceFormat}.`
          : `${attachments.length} archivo(s) de etiqueta cargado(s).`
      );
    } catch (error) {
      setNotice({
        tone: "error",
        message: `No se pudieron cargar los archivos: ${String(error)}`
      });
    }
  }

  async function removeLabelAttachment(id: string) {
    const nextProduct = setLabelAttachments(
      product,
      getLabelAttachments(product).filter((attachment) => attachment.id !== id)
    );

    setProduct(nextProduct);
    setProducts((current) => upsertLocalProduct(current, nextProduct));

    try {
      await persistProduct(nextProduct, "Archivo de etiqueta quitado.");
    } catch {
      // persistProduct already reports the failure.
    }
  }

  async function importTableFile(file: File) {
    try {
      const text = await file.text();
      const rows = parseDelimited(text);

      if (rows.length < 2) {
        setNotice({
          tone: "error",
          message: "El archivo de datos no tiene filas suficientes para importar."
        });
        return;
      }

      const header = rows[0].map((cell) => cell.trim());
      const importedBySku = new Map(
        products.map((item) => {
          const hydrated = withDefaultProductMetadata(item);
          return [hydrated.sku, hydrated] as const;
        })
      );
      let selectedProduct = withDefaultProductMetadata(product);

      rows.slice(1).forEach((row) => {
        const record = Object.fromEntries(
          header.map((key, index) => [key, row[index] ?? ""])
        );
        const sku = readImportField(record, "sku").trim() || selectedProduct.sku;
        const base =
          importedBySku.get(sku) ?? createImportedProductBase(sku, selectedProduct);
        const imported = applyImportRow(base, record);
        const next = preserveManualImportMetadata(base, imported, record);

        if (next.sku !== base.sku) {
          importedBySku.delete(base.sku);
        }

        importedBySku.set(next.sku, next);
        selectedProduct = next;
      });

      const importedProducts = [...importedBySku.values()].sort((left, right) =>
        left.sku.localeCompare(right.sku)
      );

      setProduct(selectedProduct);
      setProducts(importedProducts);
      try {
        await persistProductsBatch(importedProducts);
        setNotice({
          tone: "success",
          message: `Datos importados y guardados: ${rows.length - 1} fila(s). Los archivos y notas existentes se conservaron.`
        });
      } catch (error) {
        setApiStatus("offline");
        setNotice({
          tone: "error",
          message: `Datos importados localmente, pero no se pudieron guardar en el servidor: ${String(error)}`
        });
      }
    } catch (error) {
      setNotice({
        tone: "error",
        message: `No se pudo importar el archivo de datos: ${String(error)}`
      });
    }
  }

  async function applyRawText(saveAfterDetect = false) {
    const result = parseRawLabelText(rawText, product, languages);
    setRawImportResult({
      detected: result.detected,
      missing: result.missing,
      warnings: result.warnings
    });

    if (!rawText.trim()) {
      setNotice({
        tone: "error",
        message: "Pegue texto crudo de una etiqueta antes de detectar campos."
      });
      return;
    }

    const nextProduct = withDefaultProductMetadata(result.product);
    setProduct(nextProduct);
    setProducts((current) => upsertLocalProduct(current, nextProduct));
    setLanguages(result.languages);
    setActiveLanguage(result.languages[0] ?? activeLanguage);
    const hasServingValues = nextProduct.nutrition.rows.some((row) =>
      row.perServing?.trim()
    );
    setLabel((current) => ({
      ...current,
      ...result.suggestedLabel,
      nutritionShowServing:
        result.suggestedLabel?.nutritionShowServing ?? hasServingValues,
      nutritionShowRiPercent: false
    }));
    setNotice({
      tone: result.missing.length ? "error" : "success",
      message: result.missing.length
        ? "Texto detectado con campos faltantes marcados en rojo."
        : "Texto detectado y etiqueta generada."
    });

    if (saveAfterDetect && !result.missing.length) {
      await persistProduct(nextProduct, "Texto detectado y producto guardado.");
    }
  }

  function toggleRawTextBold() {
    const textarea = rawTextareaRef.current;

    if (!textarea) {
      setRawText((current) => `**${current}**`);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = rawText.slice(start, end);
    const before = rawText.slice(0, start);
    const after = rawText.slice(end);
    const next = selected
      ? `${before}**${selected}**${after}`
      : `${before}****${after}`;

    setRawText(next);

    requestAnimationFrame(() => {
      textarea.focus();
      if (selected) {
        textarea.setSelectionRange(start + 2, end + 2);
      } else {
        textarea.setSelectionRange(start + 2, start + 2);
      }
    });
  }

  function removeRawTextBold() {
    const textarea = rawTextareaRef.current;

    if (!textarea) {
      setRawText((current) => current.replace(/\*\*/g, ""));
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const result = removeBoldFromEditorValue(rawText, start, end);

    setRawText(result.value);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(result.start, result.end);
    });
  }

  function applyPreviewSelectionBold() {
    const selection = previewSelection.trim();

    if (!selection) {
      return;
    }

    const result = boldSelectionInProduct(product, selection);

    if (!result.changed) {
      setNotice({
        tone: "error",
        message:
          "No encontre ese texto exacto en los campos editables. Pruebe seleccionando una palabra o frase mas corta."
      });
      return;
    }

    setProduct(result.product);
    setProducts((current) => upsertLocalProduct(current, result.product));
    setPreviewSelection("");
    setNotice({
      tone: "success",
      message: `Negrita aplicada a "${truncatePreviewSelection(selection)}".`
    });
  }

  function removePreviewSelectionBold() {
    const selection = previewSelection.trim();

    if (!selection) {
      return;
    }

    const result = removeBoldSelectionInProduct(product, selection);

    if (!result.changed) {
      setNotice({
        tone: "error",
        message:
          "No encontre esa seleccion marcada en negrita. Seleccione una palabra que ya este en negrita."
      });
      return;
    }

    setProduct(result.product);
    setProducts((current) => upsertLocalProduct(current, result.product));
    setPreviewSelection("");
    setNotice({
      tone: "success",
      message: `Negrita quitada de "${truncatePreviewSelection(selection)}".`
    });
  }

  return (
    <main className="min-h-screen bg-[#f4f6f5] text-zinc-950 xl:h-screen xl:overflow-hidden">
      <div className="grid min-h-screen grid-cols-1 xl:h-screen xl:grid-cols-[340px_minmax(560px,1fr)_460px]">
        <aside className="border-b border-zinc-200 bg-white p-4 xl:h-screen xl:overflow-y-auto xl:border-b-0 xl:border-r">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold tracking-normal">
                Motor de etiquetas
              </h1>
              <p className="text-xs text-zinc-500">
                {selectedPrinterProfile.label}
              </p>
            </div>
            <span
              className={[
                "rounded px-2 py-1 text-xs font-medium",
                apiStatus === "online"
                  ? "bg-emerald-100 text-emerald-800"
                  : apiStatus === "offline"
                    ? "bg-amber-100 text-amber-900"
                    : "bg-zinc-100 text-zinc-700"
              ].join(" ")}
            >
              {apiStatus}
            </span>
          </div>

          {notice ? (
            <div
              className={[
                "mb-4 rounded border px-3 py-2 text-xs",
                notice.tone === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : notice.tone === "error"
                    ? "border-red-200 bg-red-50 text-red-900"
                    : "border-zinc-200 bg-zinc-50 text-zinc-800"
              ].join(" ")}
            >
              {notice.message}
            </div>
          ) : null}

          {validationIssues.length ? (
            <div className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900">
              <div className="font-semibold">Campos faltantes</div>
              <div className="mt-1 space-y-0.5">
                {validationIssues.slice(0, 6).map((issue) => (
                  <div key={issue}>{issue}</div>
                ))}
                {validationIssues.length > 6 ? (
                  <div>{validationIssues.length - 6} mas...</div>
                ) : null}
              </div>
            </div>
          ) : null}

          <section className="space-y-3 border-t border-zinc-200 py-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Database size={16} />
              Catalogo
            </div>
            <select
              value={product.sku}
              onChange={(event) => {
                const next = products.find((item) => item.sku === event.target.value);
                if (next) {
                  const hydrated = withDefaultProductMetadata(next);
                  setProduct(hydrated);
                  applySavedLabelSettings(hydrated);
                }
              }}
              className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
            >
              {products.map((item) => (
                <option key={item.sku} value={item.sku}>
                  {item.sku} - {item.name}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <label className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold hover:border-emerald-700 hover:bg-emerald-50">
                <Upload size={16} />
                Importar
                <input
                  type="file"
                  accept=".csv,.tsv,.txt"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void importTableFile(file);
                      event.currentTarget.value = "";
                    }
                  }}
                />
              </label>
              <ActionButton onClick={() => exportFromApi("csv")} icon={<Download size={16} />}>
                CSV
              </ActionButton>
            </div>
          </section>

          <section className="space-y-3 border-t border-zinc-200 py-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <FileCode2 size={16} />
              Raw text
            </div>
            <div className="overflow-hidden rounded border border-zinc-300 bg-white">
              <div className="flex items-center justify-end border-b border-zinc-200 bg-zinc-50 px-1 py-1">
                <button
                  type="button"
                  onClick={toggleRawTextBold}
                  className="inline-flex h-7 w-7 items-center justify-center rounded text-zinc-700 hover:bg-white hover:text-emerald-800"
                  title="Negrita"
                  aria-label="Negrita"
                >
                  <Bold size={15} />
                </button>
                <button
                  type="button"
                  onClick={removeRawTextBold}
                  className="inline-flex h-7 w-7 items-center justify-center rounded text-zinc-700 hover:bg-white hover:text-emerald-800"
                  title="Quitar negrita"
                  aria-label="Quitar negrita"
                >
                  <Eraser size={15} />
                </button>
              </div>
              <textarea
                ref={rawTextareaRef}
                value={rawText}
                onChange={(event) => setRawText(event.target.value)}
                className="h-36 w-full resize-none px-2 py-1.5 font-mono text-xs outline-none"
                placeholder="Pegue aqui el texto crudo de una etiqueta."
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <ActionButton onClick={() => void applyRawText()} icon={<RefreshCw size={16} />}>
                Detectar
              </ActionButton>
              <ActionButton
                onClick={() => void applyRawText(true)}
                icon={<Save size={16} />}
              >
                Guardar
              </ActionButton>
              <ActionButton
                onClick={() => {
                  setRawText("");
                  setRawImportResult(null);
                }}
                icon={<X size={16} />}
              >
                Limpiar
              </ActionButton>
            </div>
            {rawImportResult ? (
              <div
                className={[
                  "rounded border px-3 py-2 text-xs",
                  rawImportResult.missing.length
                    ? "border-red-300 bg-red-50 text-red-900"
                    : "border-emerald-200 bg-emerald-50 text-emerald-900"
                ].join(" ")}
              >
                <div className="font-semibold">
                  {rawImportResult.missing.length
                    ? "Faltantes detectados"
                    : "Campos detectados"}
                </div>
                {rawImportResult.detected.length ? (
                  <div className="mt-1 text-zinc-700">
                    {rawImportResult.detected.join(", ")}
                  </div>
                ) : null}
                {rawImportResult.missing.length ? (
                  <div className="mt-1 space-y-0.5">
                    {rawImportResult.missing.map((item) => (
                      <div key={item}>{item}</div>
                    ))}
                  </div>
                ) : null}
                {rawImportResult.warnings.length ? (
                  <div className="mt-1 space-y-0.5 text-amber-800">
                    {rawImportResult.warnings.map((item) => (
                      <div key={item}>{item}</div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="space-y-3 border-t border-zinc-200 py-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Database size={16} />
              Producto
            </div>
            <Field label="SKU">
              <input
                value={product.sku}
                onChange={(event) => updateProduct({ sku: event.target.value })}
                className={[
                  "w-full rounded border px-2 py-1.5 text-sm",
                  product.sku.trim()
                    ? "border-zinc-300"
                    : "border-red-300 bg-red-50 text-red-900"
                ].join(" ")}
              />
            </Field>
            <Field label="Nombre base">
              <textarea
                value={product.name}
                onChange={(event) => updateProduct({ name: event.target.value })}
                className={[
                  "h-16 w-full resize-none rounded border px-2 py-1.5 text-sm",
                  product.name.trim()
                    ? "border-zinc-300"
                    : "border-red-300 bg-red-50 text-red-900"
                ].join(" ")}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="GTIN opcional">
                <input
                  value={product.gtin ?? ""}
                  placeholder="Vacio si no aplica"
                  onChange={(event) =>
                    updateProduct({ gtin: event.target.value || undefined })
                  }
                  className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </Field>
              <Field label="Peso neto">
                <input
                  value={product.netWeight ?? ""}
                  onChange={(event) =>
                    updateProduct({ netWeight: event.target.value })
                  }
                  className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Cliente">
                <input
                  value={getProductMetadata(product, "customer")}
                  placeholder="Poblano, Penisi..."
                  onChange={(event) =>
                    updateProductMetadata("customer", event.target.value)
                  }
                  className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                />
              </Field>
              <Field label="Formato/catalogo">
                <input
                  value={getProductMetadata(product, "format")}
                  placeholder="Crevel, Poblano..."
                  onChange={(event) =>
                    updateProductMetadata("format", event.target.value)
                  }
                  className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                />
              </Field>
            </div>
            <Field label="Estatus">
              <input
                value={getProductMetadata(product, "status")}
                onChange={(event) =>
                  updateProductMetadata("status", event.target.value)
                }
                className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm"
              />
            </Field>
            <Field label="Notas etiqueta">
              <textarea
                value={getProductMetadata(product, "notes")}
                onChange={(event) =>
                  updateProductMetadata("notes", event.target.value)
                }
                className="h-16 w-full resize-none rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm"
              />
            </Field>
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-zinc-600">
                  Archivos etiqueta
                </span>
                <span className="text-[11px] text-zinc-500">
                  PDF, imagen, .nlbl, .btw
                </span>
              </div>
              <label className="flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded border border-dashed border-zinc-300 bg-white px-3 py-2 text-sm font-semibold hover:border-emerald-700 hover:bg-emerald-50">
                <Paperclip size={15} />
                Adjuntar archivos
                <input
                  type="file"
                  multiple
                  accept={LABEL_ATTACHMENT_ACCEPT}
                  className="hidden"
                  onChange={(event) => {
                    void attachLabelFiles(event.target.files);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              {labelAttachments.length ? (
                <div className="mt-2 max-h-36 space-y-1 overflow-auto rounded border border-zinc-200 bg-zinc-50 p-2">
                  {labelAttachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded bg-white px-2 py-1 text-xs"
                    >
                      <a
                        href={attachment.dataUrl}
                        download={attachment.name}
                        className="min-w-0 truncate font-medium text-zinc-800 hover:text-emerald-800"
                        title={attachment.name}
                      >
                        {attachment.name}
                      </a>
                      <span className="text-zinc-500">
                        {formatBytes(attachment.size)}
                      </span>
                      <button
                        type="button"
                        onClick={() => void removeLabelAttachment(attachment.id)}
                        className="inline-flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:bg-red-50 hover:text-red-700"
                        title="Quitar archivo"
                        aria-label="Quitar archivo"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs text-zinc-500">
                  Sin archivos adjuntos.
                </div>
              )}
            </div>
          </section>

          <section className="space-y-3 border-t border-zinc-200 py-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Languages size={16} />
              Idiomas
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {SUPPORTED_LANGUAGES.map((language) => (
                <button
                  key={language.code}
                  type="button"
                  onClick={() => toggleLanguage(language.code)}
                  className={[
                    "rounded border px-2 py-1.5 text-xs font-semibold",
                    languages.includes(language.code)
                      ? "border-emerald-700 bg-emerald-50 text-emerald-900"
                      : "border-zinc-300 bg-white text-zinc-600"
                  ].join(" ")}
                  title={language.nativeName}
                >
                  {language.code}
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              {OFFICIAL_COMBINATIONS.map((combination) => (
                <button
                  key={combination.join("-")}
                  type="button"
                  onClick={() => {
                    setLanguages(combination);
                    setActiveLanguage(combination[0]);
                  }}
                  className="mr-1 rounded border border-zinc-300 bg-zinc-50 px-2 py-1 text-xs hover:border-emerald-700"
                >
                  {combination.join("-")}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3 border-t border-zinc-200 py-4">
            <div className="text-sm font-semibold">Etiqueta</div>
            <div className="grid grid-cols-2 gap-2">
              <NumberField
                label="Ancho mm"
                value={label.widthMm}
                onChange={(widthMm) =>
                  setLabel((current) => ({ ...current, widthMm }))
                }
              />
              <NumberField
                label="Alto mm"
                value={label.heightMm}
                onChange={(heightMm) =>
                  setLabel((current) => ({ ...current, heightMm }))
                }
              />
              <Field label="Perfil Zebra">
                <select
                  value={printerProfileId}
                  onChange={(event) => {
                    const nextProfile =
                      PRINTER_PROFILES.find(
                        (profile) => profile.id === event.target.value
                      ) ?? PRINTER_PROFILES[0];
                    setPrinterProfileId(nextProfile.id);
                    setLabel((current) => ({
                      ...current,
                      dpi: nextProfile.dpi
                    }));
                  }}
                  className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
                >
                  {PRINTER_PROFILES.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.label}
                    </option>
                  ))}
                </select>
              </Field>
              <NumberField
                label="Margen mm"
                value={label.marginMm}
                onChange={(marginMm) =>
                  setLabel((current) => ({ ...current, marginMm }))
                }
              />
            </div>
            <Field label="Fuente ZPL">
              <select
                value={label.fontFamily}
                onChange={(event) =>
                  setLabel((current) => ({
                    ...current,
                    fontFamily: event.target.value as "zebra" | "arial"
                  }))
                }
                className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
              >
                <option value="zebra">Zebra interna</option>
                <option value="arial">Arial descargada</option>
              </select>
            </Field>
            <Field label="Preset visual">
              <select
                value={label.visualPreset}
                onChange={(event) =>
                  setLabel((current) => ({
                    ...current,
                    visualPreset: event.target
                      .value as Required<LabelSpec>["visualPreset"]
                  }))
                }
                className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
              >
                <option value="crevel-current">Crevel actual</option>
                <option value="poblano-import">Poblano/importador</option>
                <option value="industrial-plain">Industrial plano</option>
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <PercentStepper
                label="Titulo %"
                value={label.headerTextScalePercent}
                min={75}
                max={180}
                onChange={(headerTextScalePercent) =>
                  setLabel((current) => ({
                    ...current,
                    headerTextScalePercent
                  }))
                }
              />
              <PercentStepper
                label="Texto %"
                value={label.bodyTextScalePercent}
                min={75}
                max={180}
                onChange={(bodyTextScalePercent) =>
                  setLabel((current) => ({
                    ...current,
                    bodyTextScalePercent
                  }))
                }
              />
            </div>
            {label.fontFamily === "arial" ? (
              <div className="grid grid-cols-2 gap-2">
                <Field label="Arial normal">
                  <input
                    value={label.zplFontRegular}
                    onChange={(event) =>
                      setLabel((current) => ({
                        ...current,
                        zplFontRegular: event.target.value
                      }))
                    }
                    className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
                  />
                </Field>
                <Field label="Arial bold">
                  <input
                    value={label.zplFontBold}
                    onChange={(event) =>
                      setLabel((current) => ({
                        ...current,
                        zplFontBold: event.target.value
                      }))
                    }
                    className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
                  />
                </Field>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <Field label="Ancho tabla %">
                <input
                  type="number"
                  min={48}
                  max={100}
                  value={label.nutritionTableWidthPercent}
                  onChange={(event) =>
                    setLabel((current) => ({
                      ...current,
                      nutritionTableWidthPercent: Number(event.target.value)
                    }))
                  }
                  className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </Field>
              <Field label="Nutriente %">
                <input
                  type="number"
                  min={45}
                  max={72}
                  value={label.nutritionLabelColumnPercent}
                  onChange={(event) =>
                    setLabel((current) => ({
                      ...current,
                      nutritionLabelColumnPercent: Number(event.target.value)
                    }))
                  }
                  className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Valor %">
                <input
                  type="number"
                  min={18}
                  max={42}
                  value={label.nutritionValueColumnPercent}
                  onChange={(event) =>
                    setLabel((current) => ({
                      ...current,
                      nutritionValueColumnPercent: Number(event.target.value)
                    }))
                  }
                  className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </Field>
              <Field label="Escala tabla %">
                <input
                  type="number"
                  min={75}
                  max={130}
                  value={label.nutritionTableFontScalePercent}
                  onChange={(event) =>
                    setLabel((current) => ({
                      ...current,
                      nutritionTableFontScalePercent: Number(event.target.value)
                    }))
                  }
                  className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Alto fila mm">
                <input
                  type="number"
                  min={0.2}
                  max={2}
                  step={0.05}
                  value={label.nutritionTableRowPaddingMm}
                  onChange={(event) =>
                    setLabel((current) => ({
                      ...current,
                      nutritionTableRowPaddingMm: Number(event.target.value)
                    }))
                  }
                  className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </Field>
              <Field label="Subir tabla mm">
                <input
                  type="number"
                  min={0}
                  max={40}
                  step={0.5}
                  value={label.nutritionTableBottomOffsetMm}
                  onChange={(event) =>
                    setLabel((current) => ({
                      ...current,
                      nutritionTableBottomOffsetMm: Number(event.target.value)
                    }))
                  }
                  className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </Field>
            </div>
            <Field label="Alineacion tabla">
              <select
                value={label.nutritionTableAlign}
                onChange={(event) =>
                  setLabel((current) => ({
                    ...current,
                    nutritionTableAlign: event.target.value as Required<LabelSpec>["nutritionTableAlign"]
                  }))
                }
                className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
              >
                <option value="right">Derecha</option>
                <option value="left">Izquierda</option>
                <option value="center">Centro</option>
                <option value="full">Completa</option>
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label className="flex min-h-9 items-center gap-2 rounded border border-zinc-300 bg-white px-2">
                <input
                  type="checkbox"
                  checked={label.nutritionShowServing}
                  onChange={(event) =>
                    setLabel((current) => ({
                      ...current,
                      nutritionShowServing: event.target.checked
                    }))
                  }
                />
                Porcion
              </label>
              <label className="flex min-h-9 items-center gap-2 rounded border border-zinc-300 bg-white px-2">
                <input
                  type="checkbox"
                  checked={label.nutritionShowRiPercent}
                  onChange={(event) =>
                    setLabel((current) => ({
                      ...current,
                      nutritionShowRiPercent: event.target.checked
                    }))
                  }
                />
                %RI
              </label>
            </div>
          </section>
        </aside>

        <section className="flex min-w-0 flex-col p-4 xl:h-screen xl:overflow-hidden">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">Preview industrial</h2>
              <p className="text-xs text-zinc-500">
                {layout.strategy.description} - fuente minima usada{" "}
                {layout.metrics.usedMinTextHeightMm.toFixed(2)} mm -{" "}
                {previewDots.width} x {previewDots.height} dots @ {label.dpi} DPI
              </p>
            </div>
            <div className="flex items-center gap-2">
              {previewSelection ? (
                <div className="flex max-w-72 items-center gap-1">
                  <button
                    type="button"
                    onClick={applyPreviewSelectionBold}
                    className="inline-flex min-h-8 min-w-0 items-center gap-1 rounded border border-emerald-700 bg-emerald-50 px-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
                    title={`Poner en negrita: ${previewSelection}`}
                  >
                    <Bold size={14} />
                    <span className="truncate">
                      Negrita: {truncatePreviewSelection(previewSelection)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={removePreviewSelectionBold}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-zinc-300 bg-white text-zinc-700 hover:border-emerald-700 hover:bg-emerald-50"
                    title={`Quitar negrita: ${previewSelection}`}
                    aria-label="Quitar negrita"
                  >
                    <Eraser size={14} />
                  </button>
                </div>
              ) : null}
              <IconButton
                label="Reducir zoom"
                onClick={() => setZoom((current) => Math.max(0.35, current - 0.1))}
              >
                <Minus size={16} />
              </IconButton>
              <span className="w-14 text-center text-sm tabular-nums">
                {Math.round(zoom * 100)}%
              </span>
              <IconButton
                label="Aumentar zoom"
                onClick={() => setZoom((current) => Math.min(1.8, current + 0.1))}
              >
                <Plus size={16} />
              </IconButton>
              <IconButton label="Recalcular" onClick={() => setProduct({ ...product })}>
                <RefreshCw size={16} />
              </IconButton>
            </div>
          </div>

          {layout.overflow ? (
            <div className="mb-3 flex items-start gap-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
              <AlertTriangle className="mt-0.5 shrink-0" size={16} />
              <span>{layout.warnings.join(" ")}</span>
            </div>
          ) : (
            <div className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              Layout sin overflow, respetando minimo{" "}
              {label.fontFamily === "arial" ? "Arial 6.2 pt" : "industrial 1.2 mm"}.
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-auto">
            <LabelPreview
              layout={layout}
              zoom={zoom}
              onTextSelection={setPreviewSelection}
            />
          </div>
        </section>

        <aside className="border-t border-zinc-200 bg-white p-4 xl:h-screen xl:overflow-y-auto xl:border-l xl:border-t-0">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Languages size={16} />
                Contenido por idioma
              </div>
              <select
                value={activeLanguage}
                onChange={(event) =>
                  setActiveLanguage(event.target.value as LanguageCode)
                }
                className="rounded border border-zinc-300 px-2 py-1 text-sm"
              >
                {SUPPORTED_LANGUAGES.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.code}
                  </option>
                ))}
              </select>
            </div>

            <Field label={SECTION_LABELS[activeLanguage].name}>
              <input
                value={selectedContent.name ?? ""}
                onChange={(event) =>
                  updateLanguageContent(activeLanguage, "name", event.target.value)
                }
                className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </Field>
            <TextAreaField
              label={SECTION_LABELS[activeLanguage].ingredients}
              value={selectedContent.ingredients ?? ""}
              invalid={languages.includes(activeLanguage) && !selectedContent.ingredients?.trim()}
              onChange={(value) =>
                updateLanguageContent(activeLanguage, "ingredients", value)
              }
            />
            <TextAreaField
              label={SECTION_LABELS[activeLanguage].warnings}
              value={selectedContent.warnings ?? ""}
              onChange={(value) =>
                updateLanguageContent(activeLanguage, "warnings", value)
              }
            />
            <TextAreaField
              label={SECTION_LABELS[activeLanguage].conservation}
              value={selectedContent.conservation ?? ""}
              onChange={(value) =>
                updateLanguageContent(activeLanguage, "conservation", value)
              }
            />
            <TextAreaField
              label={SECTION_LABELS[activeLanguage].origin}
              value={selectedContent.origin ?? ""}
              onChange={(value) =>
                updateLanguageContent(activeLanguage, "origin", value)
              }
            />
            <TextAreaField
              label={SECTION_LABELS[activeLanguage].importer}
              value={selectedContent.importer ?? ""}
              onChange={(value) =>
                updateLanguageContent(activeLanguage, "importer", value)
              }
            />
            <div className="rounded border border-zinc-200 bg-zinc-50 p-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-zinc-700">
                  Leyendas extra
                </span>
                <button
                  type="button"
                  onClick={() => addCustomSection(activeLanguage)}
                  className="inline-flex h-7 items-center gap-1 rounded border border-zinc-300 bg-white px-2 text-xs font-semibold hover:border-emerald-700 hover:bg-emerald-50"
                >
                  <Plus size={13} />
                  Agregar
                </button>
              </div>
              {(selectedContent.customSections ?? []).length ? (
                <div className="space-y-2">
                  {(selectedContent.customSections ?? []).map((section, index) => (
                    <div
                      key={`${section.title}-${index}`}
                      className="rounded border border-zinc-200 bg-white p-2"
                    >
                      <div className="mb-1 grid grid-cols-[1fr_auto] gap-2">
                        <input
                          value={section.title}
                          onChange={(event) =>
                            updateCustomSection(activeLanguage, index, {
                              title: event.target.value
                            })
                          }
                          className="min-w-0 rounded border border-zinc-300 px-2 py-1 text-xs font-semibold"
                        />
                        <button
                          type="button"
                          onClick={() => removeCustomSection(activeLanguage, index)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded border border-zinc-300 text-zinc-500 hover:bg-red-50 hover:text-red-700"
                          title="Quitar leyenda"
                          aria-label="Quitar leyenda"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <textarea
                        value={section.body}
                        onChange={(event) =>
                          updateCustomSection(activeLanguage, index, {
                            body: event.target.value
                          })
                        }
                        className="h-14 w-full resize-none rounded border border-zinc-300 px-2 py-1 text-xs"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded border border-dashed border-zinc-300 bg-white px-2 py-2 text-xs text-zinc-500">
                  Sin leyendas adicionales.
                </div>
              )}
            </div>
          </section>

          <section className="mt-5 space-y-3 border-t border-zinc-200 pt-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Table2 size={16} />
                Nutricional
              </div>
              <input
                value={product.nutrition.servingSize ?? ""}
                onChange={(event) =>
                  updateProduct({
                    nutrition: {
                      ...product.nutrition,
                      servingSize: event.target.value
                    }
                  })
                }
                className="w-28 rounded border border-zinc-300 px-2 py-1 text-xs"
                placeholder="Porcion"
              />
            </div>
            <div className="grid grid-cols-[1fr_86px_78px] gap-2">
              <Field label="Base">
                <input
                  value={product.nutrition.baseQuantity ?? "100"}
                  onChange={(event) =>
                    updateProduct({
                      nutrition: {
                        ...product.nutrition,
                        baseQuantity: event.target.value
                      }
                    })
                  }
                  className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </Field>
              <Field label="Unidad">
                <select
                  value={product.nutrition.baseUnit ?? "g"}
                  onChange={(event) =>
                    updateProduct({
                      nutrition: {
                        ...product.nutrition,
                        baseUnit: event.target.value as "g" | "ml" | "kg" | "l"
                      }
                    })
                  }
                  className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
                >
                  <option value="g">g</option>
                  <option value="ml">ml</option>
                  <option value="kg">kg</option>
                  <option value="l">l</option>
                </select>
              </Field>
              <Field label="Vista">
                <div className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-sm text-zinc-700">
                  {nutritionBaseMeasure}
                </div>
              </Field>
            </div>

            <div
              className="grid border border-zinc-300 bg-zinc-100 text-[11px] font-semibold text-zinc-700"
              style={{ gridTemplateColumns: nutritionEditorGridTemplate }}
            >
              <div className="px-2 py-1">Nutriente {activeLanguage}</div>
              <div className="border-l border-zinc-300 px-2 py-1 text-right">
                {nutritionBaseMeasure}
              </div>
              {label.nutritionShowServing ? (
                <div className="border-l border-zinc-300 px-2 py-1 text-right">
                  Porcion
                </div>
              ) : null}
              {label.nutritionShowRiPercent ? (
                <div className="border-l border-zinc-300 px-2 py-1 text-right">
                  %RI
                </div>
              ) : null}
              <div className="border-l border-zinc-300 px-1 py-1" />
            </div>
            <div className="max-h-72 overflow-auto border-x border-b border-zinc-300">
              {product.nutrition.rows.map((row, index) => (
                <div
                  key={`${row.id}-${index}`}
                  className="grid border-b border-zinc-200 last:border-b-0"
                  style={{ gridTemplateColumns: nutritionEditorGridTemplate }}
                >
                  <input
                    value={row.label[activeLanguage] ?? row.label.EN}
                    onChange={(event) =>
                      updateNutritionLabel(index, activeLanguage, event.target.value)
                    }
                    className="min-w-0 px-2 py-1.5 text-xs outline-none"
                  />
                  <input
                    value={row.per100g}
                    onChange={(event) =>
                      updateNutritionRow(index, { per100g: event.target.value })
                    }
                    className={[
                      "border-l px-2 py-1.5 text-right text-xs outline-none",
                      row.per100g.trim()
                        ? "border-zinc-200"
                        : "border-red-300 bg-red-50 text-red-900"
                    ].join(" ")}
                  />
                  {label.nutritionShowServing ? (
                    <input
                      value={row.perServing ?? ""}
                      onChange={(event) =>
                        updateNutritionRow(index, { perServing: event.target.value })
                      }
                      className="border-l border-zinc-200 px-2 py-1.5 text-right text-xs outline-none"
                    />
                  ) : null}
                  {label.nutritionShowRiPercent ? (
                    <input
                      value={row.riPercent ?? ""}
                      onChange={(event) =>
                        updateNutritionRow(index, { riPercent: event.target.value })
                      }
                      className="border-l border-zinc-200 px-2 py-1.5 text-right text-xs outline-none"
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => removeNutritionRow(index)}
                    className="flex items-center justify-center border-l border-zinc-200 text-zinc-500 hover:bg-red-50 hover:text-red-700"
                    title="Quitar nutriente"
                    aria-label="Quitar nutriente"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-[1fr_96px] gap-2">
              <select
                value={selectedNutrient}
                onChange={(event) => setSelectedNutrient(event.target.value)}
                className="min-w-0 rounded border border-zinc-300 px-2 py-1.5 text-sm"
              >
                {NUTRIENT_CATALOG.map((nutrient) => (
                  <option key={nutrient.id} value={nutrient.id}>
                    {nutrient.label[activeLanguage] ?? nutrient.label.EN}
                  </option>
                ))}
              </select>
              <ActionButton onClick={addNutritionRow} icon={<Plus size={16} />}>
                Anadir
              </ActionButton>
            </div>
          </section>

          <section className="mt-5 space-y-3 border-t border-zinc-200 pt-4">
            <div className="grid grid-cols-2 gap-2">
              <ActionButton onClick={saveProduct} icon={<Save size={16} />}>
                Guardar
              </ActionButton>
              <ActionButton
                onClick={() => exportFromApi("zpl")}
                icon={<Printer size={16} />}
              >
                ZPL
              </ActionButton>
              <ActionButton
                onClick={downloadZplFile}
                icon={<Download size={16} />}
              >
                Descargar ZPL
              </ActionButton>
              <ActionButton
                onClick={downloadWindowsPrintScript}
                icon={<FileCode2 size={16} />}
              >
                Script Windows
              </ActionButton>
              <ActionButton
                onClick={() => exportFromApi("btxml")}
                icon={<FileCode2 size={16} />}
              >
                BTXML
              </ActionButton>
              <ActionButton
                onClick={printTestLabel}
                icon={<Send size={16} />}
              >
                Imprimir
              </ActionButton>
            </div>

            <textarea
              value={exportText}
              onChange={(event) => setExportText(event.target.value)}
              className="h-44 w-full resize-none rounded border border-zinc-300 bg-zinc-950 p-3 font-mono text-xs text-zinc-50"
              placeholder="Las exportaciones y respuestas de impresion apareceran aqui."
            />
          </section>
        </aside>
      </div>
    </main>
  );
}

function Field({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-600">{label}</span>
      {children}
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
      />
    </Field>
  );
}

function PercentStepper({
  label,
  value,
  min,
  max,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const normalizedValue = clampPercentSetting(value, min, max);

  return (
    <Field label={label}>
      <div className="grid grid-cols-[32px_1fr_32px] overflow-hidden rounded border border-zinc-300 bg-white">
        <button
          type="button"
          onClick={() => onChange(clampPercentSetting(normalizedValue - 5, min, max))}
          className="inline-flex items-center justify-center border-r border-zinc-200 text-zinc-700 hover:bg-zinc-50"
          title={`Bajar ${label}`}
          aria-label={`Bajar ${label}`}
        >
          <Minus size={14} />
        </button>
        <input
          type="number"
          min={min}
          max={max}
          step={5}
          value={normalizedValue}
          onChange={(event) =>
            onChange(clampPercentSetting(Number(event.target.value), min, max))
          }
          className="min-w-0 px-2 py-1.5 text-center text-sm outline-none"
        />
        <button
          type="button"
          onClick={() => onChange(clampPercentSetting(normalizedValue + 5, min, max))}
          className="inline-flex items-center justify-center border-l border-zinc-200 text-zinc-700 hover:bg-zinc-50"
          title={`Subir ${label}`}
          aria-label={`Subir ${label}`}
        >
          <Plus size={14} />
        </button>
      </div>
    </Field>
  );
}

function TextAreaField({
  label,
  value,
  invalid,
  onChange
}: {
  label: string;
  value: string;
  invalid?: boolean;
  onChange: (value: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function toggleBold() {
    const textarea = textareaRef.current;

    if (!textarea) {
      onChange(`**${value}**`);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end);
    const before = value.slice(0, start);
    const after = value.slice(end);
    const next = selected
      ? `${before}**${selected}**${after}`
      : `${before}****${after}`;

    onChange(next);

    requestAnimationFrame(() => {
      textarea.focus();
      if (selected) {
        textarea.setSelectionRange(start + 2, end + 2);
      } else {
        textarea.setSelectionRange(start + 2, start + 2);
      }
    });
  }

  function removeBold() {
    const textarea = textareaRef.current;

    if (!textarea) {
      onChange(value.replace(/\*\*/g, ""));
      return;
    }

    const result = removeBoldFromEditorValue(
      value,
      textarea.selectionStart,
      textarea.selectionEnd
    );

    onChange(result.value);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(result.start, result.end);
    });
  }

  return (
    <Field label={label}>
      <div
        className={[
          "overflow-hidden rounded border bg-white",
          invalid ? "border-red-300" : "border-zinc-300"
        ].join(" ")}
      >
        <div className="flex items-center justify-end border-b border-zinc-200 bg-zinc-50 px-1 py-1">
          <button
            type="button"
            onClick={toggleBold}
            className="inline-flex h-7 w-7 items-center justify-center rounded text-zinc-700 hover:bg-white hover:text-emerald-800"
            title="Negrita"
            aria-label="Negrita"
          >
            <Bold size={15} />
          </button>
          <button
            type="button"
            onClick={removeBold}
            className="inline-flex h-7 w-7 items-center justify-center rounded text-zinc-700 hover:bg-white hover:text-emerald-800"
            title="Quitar negrita"
            aria-label="Quitar negrita"
          >
            <Eraser size={15} />
          </button>
        </div>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={[
            "h-20 w-full resize-none px-2 py-1.5 text-sm outline-none",
            invalid ? "bg-red-50 text-red-900" : ""
          ].join(" ")}
        />
      </div>
    </Field>
  );
}

function IconButton({
  label,
  children,
  onClick
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded border border-zinc-300 bg-white text-zinc-800 hover:border-emerald-700"
      title={label}
      aria-label={label}
    >
      {children}
    </button>
  );
}

function ActionButton({
  children,
  icon,
  onClick
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-9 items-center justify-center gap-2 rounded border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold hover:border-emerald-700 hover:bg-emerald-50"
    >
      {icon}
      {children}
    </button>
  );
}

function downloadTextFile(
  fileName: string,
  content: string,
  mimeType: string
) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function createDownloadFileName(
  product: ProductRecord,
  languages: LanguageCode[],
  extension: "zpl" | "ps1"
): string {
  const base = sanitizeFileName(
    [product.sku, product.name || "etiqueta", languages.join("-")]
      .filter(Boolean)
      .join("-")
  );

  return `${base || "etiqueta"}.${extension}`;
}

function sanitizeFileName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function createWindowsZplPrintScript({
  zpl,
  zplFileName,
  printerName
}: {
  zpl: string;
  zplFileName: string;
  printerName: string;
}): string {
  const zplBase64 = utf8ToBase64(zpl);
  const safePrinterName = escapePowerShellSingleQuotedString(printerName);
  const safeZplFileName = escapePowerShellSingleQuotedString(zplFileName);

  return `$ErrorActionPreference = 'Stop'
$printerName = '${safePrinterName}'
$zplFileName = '${safeZplFileName}'
$zplBase64 = @'
${zplBase64}
'@

$jobFile = Join-Path $env:TEMP $zplFileName
[System.IO.File]::WriteAllBytes($jobFile, [Convert]::FromBase64String(($zplBase64 -replace '\\s', '')))

$signature = @"
using System;
using System.IO;
using System.Runtime.InteropServices;

public class RawPrinterHelper
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA
    {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static bool SendFileToPrinter(string printerName, string fileName)
    {
        byte[] bytes = File.ReadAllBytes(fileName);
        return SendBytesToPrinter(printerName, bytes);
    }

    public static bool SendBytesToPrinter(string printerName, byte[] bytes)
    {
        IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
        IntPtr hPrinter = IntPtr.Zero;
        int dwWritten = 0;
        bool success = false;

        try
        {
            Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);

            DOCINFOA di = new DOCINFOA();
            di.pDocName = "Industrial Label ZPL";
            di.pDataType = "RAW";

            if (OpenPrinter(printerName.Normalize(), out hPrinter, IntPtr.Zero))
            {
                if (StartDocPrinter(hPrinter, 1, di))
                {
                    if (StartPagePrinter(hPrinter))
                    {
                        success = WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out dwWritten);
                        EndPagePrinter(hPrinter);
                    }
                    EndDocPrinter(hPrinter);
                }
                ClosePrinter(hPrinter);
            }
        }
        finally
        {
            Marshal.FreeCoTaskMem(pUnmanagedBytes);
        }

        return success && dwWritten == bytes.Length;
    }
}
"@

if (-not ([System.Management.Automation.PSTypeName]'RawPrinterHelper').Type) {
    Add-Type -TypeDefinition $signature
}

$sent = [RawPrinterHelper]::SendFileToPrinter($printerName, $jobFile)

if (-not $sent) {
    throw "Windows no pudo enviar el ZPL a la impresora '$printerName'. Verifique que el nombre del driver coincida exactamente."
}

Write-Host "Etiqueta enviada a $printerName"
Write-Host "Archivo temporal: $jobFile"
`;
}

function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.slice(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function escapePowerShellSingleQuotedString(value: string): string {
  return value.replace(/'/g, "''");
}

function parsePrintPayload(text: string): PrintPayload {
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as PrintPayload;
  } catch {
    return { error: text };
  }
}

function isLocalApiUrl(url: string): boolean {
  return /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i.test(url);
}

function isCloudPrintUnavailable(payload: PrintPayload): boolean {
  const reason = `${payload.reason ?? ""} ${payload.error ?? ""}`.toLowerCase();

  return (
    !payload.queued &&
    (reason.includes("railway") ||
      reason.includes("windows") ||
      reason.includes("impresion fisica") ||
      reason.includes("equipo conectado"))
  );
}

function clampPercentSetting(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

function truncatePreviewSelection(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();

  return compact.length > 28 ? `${compact.slice(0, 27)}...` : compact;
}

function boldSelectionInProduct(
  product: ProductRecord,
  selection: string
): { product: ProductRecord; changed: boolean } {
  return transformSelectionInProduct(product, selection, boldSelectionInText);
}

function removeBoldSelectionInProduct(
  product: ProductRecord,
  selection: string
): { product: ProductRecord; changed: boolean } {
  return transformSelectionInProduct(product, selection, removeBoldSelectionInText);
}

function transformSelectionInProduct(
  product: ProductRecord,
  selection: string,
  transform: (value: string | undefined, selection: string) => string | undefined
): { product: ProductRecord; changed: boolean } {
  let changed = false;
  const apply = (value?: string): string | undefined => {
    const next = transform(value, selection);

    if (next !== value) {
      changed = true;
    }

    return next;
  };
  const nextLanguages = Object.fromEntries(
    Object.entries(product.languages).map(([language, content]) => {
      if (!content) {
        return [language, content];
      }

      return [
        language,
        {
          ...content,
          name: apply(content.name),
          ingredients: apply(content.ingredients),
          warnings: apply(content.warnings),
          conservation: apply(content.conservation),
          origin: apply(content.origin),
          importer: apply(content.importer),
          customSections: content.customSections?.map((section) => ({
            title: apply(section.title) ?? section.title,
            body: apply(section.body) ?? section.body
          }))
        }
      ];
    })
  ) as ProductRecord["languages"];
  const nextRows = product.nutrition.rows.map((row) => {
    const nextLabels = { ...row.label };

    (Object.keys(nextLabels) as LanguageCode[]).forEach((language) => {
      const nextLabel = apply(nextLabels[language]);

      if (nextLabel) {
        nextLabels[language] = nextLabel;
      }
    });

    return {
      ...row,
      label: nextLabels
    };
  });
  const nextName = apply(product.name) ?? product.name;

  if (!changed) {
    return { product, changed: false };
  }

  return {
    product: withDefaultProductMetadata({
      ...product,
      name: nextName,
      languages: nextLanguages,
      nutrition: {
        ...product.nutrition,
        rows: nextRows
      }
    }),
    changed: true
  };
}

function boldSelectionInText(value: string | undefined, selection: string): string | undefined {
  if (!value || !selection.trim()) {
    return value;
  }

  const index = value.toLocaleLowerCase().indexOf(selection.toLocaleLowerCase());

  if (index < 0) {
    return value;
  }

  const end = index + selection.length;
  const alreadyBold = value.slice(Math.max(0, index - 2), index) === "**" &&
    value.slice(end, end + 2) === "**";

  if (alreadyBold) {
    return value;
  }

  return `${value.slice(0, index)}**${value.slice(index, end)}**${value.slice(end)}`;
}

function removeBoldSelectionInText(
  value: string | undefined,
  selection: string
): string | undefined {
  if (!value || !selection.trim()) {
    return value;
  }

  const selectionPattern = escapeRegExp(selection.trim()).replace(/\s+/g, "\\s+");
  const pattern = new RegExp(`\\*\\*(${selectionPattern})\\*\\*`, "i");

  if (!pattern.test(value)) {
    return value;
  }

  return value.replace(pattern, "$1");
}

function removeBoldFromEditorValue(
  value: string,
  start: number,
  end: number
): { value: string; start: number; end: number } {
  if (start === end) {
    const next = value.replace(/\*\*/g, "");
    return {
      value: next,
      start: Math.min(start, next.length),
      end: Math.min(start, next.length)
    };
  }

  const selected = value.slice(start, end);
  const before = value.slice(0, start);
  const after = value.slice(end);

  if (before.endsWith("**") && after.startsWith("**")) {
    return {
      value: `${before.slice(0, -2)}${selected}${after.slice(2)}`,
      start: start - 2,
      end: end - 2
    };
  }

  const cleanedSelection = selected.replace(/\*\*/g, "");

  return {
    value: `${before}${cleanedSelection}${after}`,
    start,
    end: start + cleanedSelection.length
  };
}

function upsertLocalProduct(
  products: ProductRecord[],
  product: ProductRecord
): ProductRecord[] {
  const normalizedProduct = withDefaultProductMetadata(product);
  const exists = products.some((item) => item.sku === normalizedProduct.sku);

  if (!exists) {
    return [...products, normalizedProduct].sort((left, right) =>
      left.sku.localeCompare(right.sku)
    );
  }

  return products.map((item) =>
    item.sku === normalizedProduct.sku ? normalizedProduct : item
  );
}

function cleanProduct(product: ProductRecord): ProductRecord {
  const normalized = withDefaultProductMetadata(product);

  return {
    ...normalized,
    gtin: normalized.gtin?.trim() || undefined
  };
}

function withProductLabelSettings(
  product: ProductRecord,
  label: Required<LabelSpec>,
  printerProfile: PrinterProfile
): ProductRecord {
  return withDefaultProductMetadata({
    ...product,
    metadata: {
      ...product.metadata,
      labelSpec: serializeLabelSpec(label),
      printerProfile: {
        id: printerProfile.id,
        name: printerProfile.printerName,
        dpi: printerProfile.dpi
      }
    }
  });
}

function serializeLabelSpec(label: Required<LabelSpec>): Record<string, unknown> {
  return {
    widthMm: label.widthMm,
    heightMm: label.heightMm,
    dpi: label.dpi,
    marginMm: label.marginMm,
    fontFamily: label.fontFamily,
    zplFontRegular: label.zplFontRegular,
    zplFontBold: label.zplFontBold,
    visualPreset: label.visualPreset,
    headerTextScalePercent: label.headerTextScalePercent,
    bodyTextScalePercent: label.bodyTextScalePercent,
    nutritionTableWidthPercent: label.nutritionTableWidthPercent,
    nutritionTableAlign: label.nutritionTableAlign,
    nutritionValueColumnPercent: label.nutritionValueColumnPercent,
    nutritionLabelColumnPercent: label.nutritionLabelColumnPercent,
    nutritionTableBottomOffsetMm: label.nutritionTableBottomOffsetMm,
    nutritionTableRowPaddingMm: label.nutritionTableRowPaddingMm,
    nutritionTableFontScalePercent: label.nutritionTableFontScalePercent,
    nutritionShowServing: label.nutritionShowServing,
    nutritionShowRiPercent: label.nutritionShowRiPercent
  };
}

function readProductLabelSettings(product: ProductRecord): {
  label: Partial<LabelSpec> | null;
  printerProfileId: PrinterProfileId | null;
} {
  const metadata = product.metadata ?? {};
  const labelSpec = isObjectRecord(metadata.labelSpec)
    ? metadata.labelSpec
    : isObjectRecord(metadata.label)
      ? metadata.label
      : null;
  const printerProfile = isObjectRecord(metadata.printerProfile)
    ? metadata.printerProfile
    : null;

  return {
    label: labelSpec ? parseSavedLabelSpec(labelSpec) : null,
    printerProfileId: normalizePrinterProfileId(
      typeof printerProfile?.id === "string" ? printerProfile.id : undefined
    )
  };
}

function parseSavedLabelSpec(value: Record<string, unknown>): Partial<LabelSpec> {
  const label: Partial<LabelSpec> = {};

  if (typeof value.widthMm === "number") label.widthMm = value.widthMm;
  if (typeof value.heightMm === "number") label.heightMm = value.heightMm;
  if (typeof value.dpi === "number") label.dpi = value.dpi;
  if (typeof value.marginMm === "number") label.marginMm = value.marginMm;
  if (value.fontFamily === "zebra" || value.fontFamily === "arial") {
    label.fontFamily = value.fontFamily;
  }
  if (typeof value.zplFontRegular === "string") {
    label.zplFontRegular = value.zplFontRegular;
  }
  if (typeof value.zplFontBold === "string") {
    label.zplFontBold = value.zplFontBold;
  }
  if (
    value.visualPreset === "crevel-current" ||
    value.visualPreset === "poblano-import" ||
    value.visualPreset === "industrial-plain"
  ) {
    label.visualPreset = value.visualPreset;
  }
  if (typeof value.headerTextScalePercent === "number") {
    label.headerTextScalePercent = value.headerTextScalePercent;
  }
  if (typeof value.bodyTextScalePercent === "number") {
    label.bodyTextScalePercent = value.bodyTextScalePercent;
  }
  if (typeof value.nutritionTableWidthPercent === "number") {
    label.nutritionTableWidthPercent = value.nutritionTableWidthPercent;
  }
  if (
    value.nutritionTableAlign === "left" ||
    value.nutritionTableAlign === "center" ||
    value.nutritionTableAlign === "right" ||
    value.nutritionTableAlign === "full"
  ) {
    label.nutritionTableAlign = value.nutritionTableAlign;
  }
  if (typeof value.nutritionValueColumnPercent === "number") {
    label.nutritionValueColumnPercent = value.nutritionValueColumnPercent;
  }
  if (typeof value.nutritionLabelColumnPercent === "number") {
    label.nutritionLabelColumnPercent = value.nutritionLabelColumnPercent;
  }
  if (typeof value.nutritionTableBottomOffsetMm === "number") {
    label.nutritionTableBottomOffsetMm = value.nutritionTableBottomOffsetMm;
  }
  if (typeof value.nutritionTableRowPaddingMm === "number") {
    label.nutritionTableRowPaddingMm = value.nutritionTableRowPaddingMm;
  }
  if (typeof value.nutritionTableFontScalePercent === "number") {
    label.nutritionTableFontScalePercent = value.nutritionTableFontScalePercent;
  }
  if (typeof value.nutritionShowServing === "boolean") {
    label.nutritionShowServing = value.nutritionShowServing;
  }
  if (typeof value.nutritionShowRiPercent === "boolean") {
    label.nutritionShowRiPercent = value.nutritionShowRiPercent;
  }

  return label;
}

function normalizePrinterProfileId(value?: string): PrinterProfileId | null {
  return PRINTER_PROFILES.some((profile) => profile.id === value)
    ? (value as PrinterProfileId)
    : null;
}

function getPrinterProfileIdForDpi(dpi: number): PrinterProfileId {
  return dpi === 300 ? "zt610-300" : "zt610-203";
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

const IMPORT_FIELD_ALIASES: Record<string, string[]> = {
  sku: ["sku", "codigo", "codigo producto", "producto"],
  language: ["language", "idioma", "lang"],
  section: ["section", "seccion", "sección", "campo"],
  value: ["value", "valor", "contenido", "texto"],
  per100g: ["per100g", "100g", "por100g", "por 100g", "por 100 g"],
  perServing: ["perServing", "portion", "porcion", "porción", "serving"],
  riPercent: ["riPercent", "ri", "%ri", "% ri", "ir", "%ir"],
  name: ["name", "nombre", "nombre base"],
  gtin: ["gtin", "ean", "barcode", "codigo barras", "código barras"],
  brand: ["brand", "marca"],
  netWeight: ["netWeight", "net weight", "peso neto", "neto"],
  countryOfOrigin: ["countryOfOrigin", "pais origen", "país origen", "origen"],
  status: ["status", "estatus", "estado"],
  notes: ["notes", "note", "notas", "nota", "notas etiqueta"],
  files: ["files", "file", "archivos", "archivo", "archivos etiqueta"],
  customer: ["customer", "cliente", "client", "distribuidor", "importador cliente"],
  format: ["format", "formato", "layout", "plantilla", "estilo etiqueta"]
};

const METADATA_ALIASES: Record<ProductMetadataField, string[]> = {
  status: ["status", "estatus", "estado"],
  notes: ["notes", "note", "notas", "nota", "labelNotes", "label_notes"],
  files: ["files", "file", "archivos", "archivo", "labelFiles", "label_files"],
  customer: [
    "customer",
    "cliente",
    "client",
    "distribuidor",
    "importadorCliente",
    "importador_cliente"
  ],
  format: [
    "format",
    "formato",
    "layout",
    "plantilla",
    "labelFormat",
    "label_format",
    "estiloEtiqueta",
    "estilo_etiqueta"
  ]
};

function withDefaultProductMetadata(product: ProductRecord): ProductRecord {
  return {
    ...product,
    metadata: {
      ...product.metadata,
      status: getProductMetadata(product, "status"),
      customer: getProductMetadata(product, "customer"),
      format: getProductMetadata(product, "format"),
      attachments: getLabelAttachments(product)
    }
  };
}

function getProductMetadata(
  product: ProductRecord,
  field: ProductMetadataField
): string {
  const metadata = product.metadata ?? {};
  const aliases = METADATA_ALIASES[field];

  for (const key of aliases) {
    const value = metadata[key];

    if (Array.isArray(value)) {
      continue;
    }

    if (value !== undefined && value !== null) {
      return String(value);
    }
  }

  return "";
}

function setProductMetadata(
  product: ProductRecord,
  field: ProductMetadataField,
  value: string
): ProductRecord {
  return withDefaultProductMetadata({
    ...product,
    metadata: {
      ...product.metadata,
      [field]: value
    }
  });
}

function getLabelAttachments(product: ProductRecord): LabelAttachment[] {
  const metadata = product.metadata ?? {};
  const candidates = [metadata.attachments, metadata.labelAttachments];
  const attachments = candidates.find(Array.isArray) ?? [];

  return attachments.filter(isLabelAttachment);
}

function setLabelAttachments(
  product: ProductRecord,
  attachments: LabelAttachment[]
): ProductRecord {
  return withDefaultProductMetadata({
    ...product,
    metadata: {
      ...product.metadata,
      attachments
    }
  });
}

function createReferenceFormatName(attachments: LabelAttachment[]): string {
  const reference = attachments.find((attachment) =>
    isVisualReferenceAttachment(attachment)
  );

  if (!reference) {
    return "";
  }

  const baseName = reference.name
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return baseName ? `Referencia ${baseName}` : "Referencia visual";
}

function isVisualReferenceAttachment(attachment: LabelAttachment): boolean {
  return (
    attachment.mimeType.startsWith("image/") ||
    attachment.mimeType === "application/pdf" ||
    /\.(?:png|jpe?g|webp|gif|pdf)$/i.test(attachment.name)
  );
}

function isLabelAttachment(value: unknown): value is LabelAttachment {
  if (!value || typeof value !== "object") {
    return false;
  }

  const attachment = value as Partial<LabelAttachment>;

  return Boolean(
    attachment.id &&
      attachment.name &&
      attachment.dataUrl &&
      typeof attachment.size === "number"
  );
}

function isAllowedLabelAttachment(file: File): boolean {
  const extension = file.name.split(".").pop()?.toLowerCase();

  return (
    ["pdf", "nlbl", "btw", "png", "jpg", "jpeg", "webp", "gif"].includes(
      extension ?? ""
    ) ||
    ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"].includes(
      file.type
    )
  );
}

async function fileToLabelAttachment(file: File): Promise<LabelAttachment> {
  return {
    id: createAttachmentId(file),
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    lastModified: file.lastModified,
    uploadedAt: new Date().toISOString(),
    dataUrl: await readFileAsDataUrl(file)
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

function createAttachmentId(file: File): string {
  const safeName = file.name.replace(/[^a-z0-9.]+/gi, "-").toLowerCase();
  return `${Date.now().toString(36)}-${file.lastModified.toString(36)}-${safeName}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function createImportedProductBase(sku: string, source: ProductRecord): ProductRecord {
  return withDefaultProductMetadata({
    ...source,
    sku,
    name: sku,
    gtin: undefined,
    brand: undefined,
    netWeight: undefined,
    languages: {},
    nutrition: {
      ...source.nutrition,
      servingSize: "",
      rows: source.nutrition.rows.map((row) => ({
        ...row,
        per100g: "",
        perServing: "",
        riPercent: ""
      }))
    },
    metadata: {
      status: "",
      notes: "",
      files: "",
      customer: "",
      format: "",
      attachments: []
    }
  });
}

function preserveManualImportMetadata(
  existing: ProductRecord,
  imported: ProductRecord,
  row: Record<string, string>
): ProductRecord {
  return PRODUCT_METADATA_FIELDS.reduce((current, field) => {
    const incoming = readImportField(row, field);

    if (hasImportValue(incoming)) {
      return setProductMetadata(current, field, incoming);
    }

    return setProductMetadata(current, field, getProductMetadata(existing, field));
  }, withDefaultProductMetadata(imported));
}

type RawSectionKey =
  | "ingredients"
  | "warnings"
  | "conservation"
  | "origin"
  | "importer";

type RawParsedLabel = RawImportResult & {
  product: ProductRecord;
  languages: LanguageCode[];
  suggestedLabel?: Partial<LabelSpec>;
};

type RawLanguageSegment = {
  language: LanguageCode;
  text: string;
  title?: string;
};

const RAW_SECTION_KEYS: RawSectionKey[] = [
  "ingredients",
  "warnings",
  "conservation",
  "origin",
  "importer"
];

const RAW_DEFAULT_NUTRIENT_IDS = [
  "energy",
  "fat",
  "saturates",
  "carbohydrate",
  "sugars",
  "protein",
  "salt"
];

type RawNutritionColumnMode =
  | "per100-only"
  | "serving-then-per100"
  | "per100-then-serving";

const RAW_SECTION_ALIASES: Record<RawSectionKey, string[]> = {
  ingredients: [
    "Zutaten",
    "Ingredientes",
    "Ingredients",
    "Ingrédients",
    "Ingredienten",
    "Ingrediënten",
    "Ingredienti"
  ],
  warnings: [
    "Warnhinweise",
    "Advertencias",
    "Warnings",
    "Avertissements",
    "Waarschuwingen",
    "Vorsicht",
    "Aviso"
  ],
  conservation: [
    "Aufbewahrung",
    "Conservación",
    "Conservacion",
    "Conservation",
    "Storage",
    "Bewaren",
    "Kühl und trocken lagern",
    "Almacenar"
  ],
  origin: [
    "Herkunft",
    "Origen",
    "Pais de origen",
    "País de origen",
    "Country of origin",
    "Origine"
  ],
  importer: [
    "Importiert von",
    "Importado por",
    "Importer",
    "Imported by",
    "Importateur"
  ]
};

const RAW_NUTRIENT_ALIASES: Record<string, string[]> = {
  energy: [
    "energy",
    "energia",
    "energía",
    "valor energetico",
    "valor energético",
    "calories"
  ],
  fat: ["total fat", "fat", "grasas", "fett", "matieres grasses"],
  saturates: [
    "saturated fat",
    "saturated fats",
    "of which saturates",
    "grasas saturadas",
    "de las cuales saturadas",
    "gesattigte fettsauren",
    "gesättigte fettsäuren"
  ],
  carbohydrate: [
    "total carbohydrates",
    "total carbohydrate",
    "carbohydrates",
    "carbohydrate",
    "hidratos de carbono",
    "carbohidratos",
    "kohlenhydrate"
  ],
  sugars: [
    "sugar",
    "sugars",
    "azucares",
    "azúcares",
    "of which sugars",
    "de los cuales azucares",
    "de las cuales azucares",
    "davon zucker"
  ],
  fiber: ["fibre", "fiber", "fibra", "fibra alimentaria", "ballaststoffe"],
  protein: ["protein", "proteina", "proteínas", "proteinas", "eiweiss", "eiweiß"],
  salt: ["salt", "sal", "salz"],
  sodium: ["sodium", "sodio", "natrium"],
  vitamin_a: ["vitamin a", "vitamina a"],
  vitamin_c: ["vitamin c", "vitamina c"],
  vitamin_d: ["vitamin d", "vitamina d"],
  calcium: ["calcium", "calcio"],
  iron: ["iron", "hierro", "eisen"]
};

function parseRawLabelText(
  text: string,
  source: ProductRecord,
  fallbackLanguages: LanguageCode[]
): RawParsedLabel {
  const detected: string[] = [];
  const warnings: string[] = [];
  const normalizedText = normalizeRawText(text);
  const next = createRawDetectionBase(source);

  if (!normalizedText) {
    return {
      product: next,
      languages: fallbackLanguages.length ? fallbackLanguages : (["ES"] as LanguageCode[]),
      detected,
      missing: ["Raw text vacio"],
      warnings
    };
  }

  const sku = matchRawValue(normalizedText, /\bSKU[:#]?\s*([A-Z0-9._-]+)/i);
  const gtin = matchRawValue(normalizedText, /\b(?:GTIN|EAN)[:#]?\s*(\d{8,14})\b/i);
  const netWeight = extractRawNetWeight(normalizedText);
  const title = extractRawTitle(normalizedText);
  const customerName = extractRawCustomerName(normalizedText);
  const importerText = extractRawImporterText(normalizedText);
  const originText = extractRawOriginText(normalizedText);
  const rawLegends = extractRawLegends(normalizedText);

  if (sku) {
    next.sku = sku;
    detected.push(`SKU ${sku}`);
  }

  if (gtin) {
    next.gtin = gtin;
    detected.push(`GTIN ${gtin}`);
  }

  if (netWeight) {
    next.netWeight = netWeight;
    detected.push(`peso ${netWeight}`);
  }

  const rawBaseMeasure = extractRawBaseMeasure(normalizedText);
  const rawServingSize = extractRawServingSize(normalizedText);

  if (rawBaseMeasure) {
    next.nutrition.baseQuantity = rawBaseMeasure.quantity;
    next.nutrition.baseUnit = rawBaseMeasure.unit;
    detected.push(`base ${rawBaseMeasure.quantity} ${rawBaseMeasure.unit}`);
  }

  if (rawServingSize) {
    next.nutrition.servingSize = rawServingSize;
    detected.push(`porcion ${rawServingSize}`);
  }

  if (title) {
    next.name = title;
    detected.push("titulo");
  }

  if (customerName) {
    next.metadata = {
      ...next.metadata,
      customer: customerName
    };
    detected.push(`cliente ${customerName}`);
  }

  const formatName = detectRawFormatName(normalizedText, customerName);

  if (formatName) {
    next.metadata = {
      ...next.metadata,
      format: formatName
    };
    detected.push(`formato ${formatName}`);
  }

  const explicitLanguageSegments = extractRawLanguageSegments(normalizedText);
  const inferredLanguages = explicitLanguageSegments.length
    ? []
    : inferRawLanguages(normalizedText);
  const languageSegments = explicitLanguageSegments.length
    ? explicitLanguageSegments
    : createInferredRawSegments(
        normalizedText,
        title,
        inferredLanguages,
        fallbackLanguages
      );
  const detectedLanguages = uniqueLanguages(
    languageSegments.map((segment) => segment.language)
  );
  const resultLanguages: LanguageCode[] = detectedLanguages.length
    ? detectedLanguages
    : ["ES"];
  const segmentTitle = combineRawSegmentTitles(
    languageSegments
      .map((segment) => segment.title)
      .filter((value): value is string => Boolean(value?.trim())),
    netWeight
  );

  if (segmentTitle) {
    next.name = segmentTitle;
    detected.push("titulos por idioma");
  }

  if (explicitLanguageSegments.length) {
    detected.push(`idiomas ${detectedLanguages.join("-")}`);
  } else if (inferredLanguages.length) {
    detected.push(`idioma probable ${inferredLanguages[0]}`);
    warnings.push(
      `No se encontraron marcadores (DE)/(ES); el texto se asigno a ${inferredLanguages[0]} por deteccion.`
    );
  } else {
    warnings.push(
      "No se encontraron marcadores de idioma como (DE) o (ES); se uso el idioma activo."
    );
  }

  for (const segment of languageSegments) {
    const titleForLanguage = segment.title || title;
    const cleanSegment = removeKnownTitle(
      removeRawNutritionBlock(segment.text),
      titleForLanguage
    );
    const sections = parseRawLanguageSections(cleanSegment, segment.language);
    const inferredSections = inferRawSectionsFromSegment(segment.text);
    const currentContent = next.languages[segment.language] ?? {};
    const languageContent: ProductLanguageContent = {
      ...currentContent,
      name: titleForLanguage || currentContent.name || next.name
    };

    for (const key of RAW_SECTION_KEYS) {
      const value = sections[key] || inferredSections[key];

      if (value) {
        languageContent[key] = mergeDetectedText(languageContent[key], value);
        detected.push(`${segment.language} ${key}`);
      }
    }

    if (
      importerText &&
      languageSegments.length <= 1 &&
      !languageContent.importer?.trim()
    ) {
      languageContent.importer = mergeDetectedText(
        languageContent.importer,
        importerText
      );
      detected.push(`${segment.language} importer`);
    }

    if (originText && !languageContent.origin?.trim()) {
      languageContent.origin = mergeDetectedText(languageContent.origin, originText);
      detected.push(`${segment.language} origin`);
    }

    if (rawLegends.length) {
      languageContent.customSections = mergeRawCustomSections(
        languageContent.customSections,
        rawLegends
      );
      detected.push(`${segment.language} leyendas`);
    }

    if (!Object.values(sections).some(Boolean) && cleanSegment) {
      languageContent.ingredients = mergeDetectedText(
        languageContent.ingredients,
        cleanSegment
      );
      detected.push(`${segment.language} texto`);
    }

    next.languages[segment.language] = languageContent;
  }

  next.nutrition = {
    ...next.nutrition,
    rows: applyRawNutritionValues(normalizedText, resultLanguages, detected)
  };
  const suggestedLabel = createRawLabelSuggestion(normalizedText, next);

  const missing = getProductValidationIssues(next, resultLanguages);

  return {
    product: cleanProduct(next),
    languages: resultLanguages,
    suggestedLabel,
    detected: [...new Set(detected)],
    missing,
    warnings
  };
}

function createRawDetectionBase(product: ProductRecord): ProductRecord {
  return withDefaultProductMetadata({
    ...product,
    name: "",
    gtin: undefined,
    netWeight: undefined,
    countryOfOrigin: undefined,
    languages: {},
    nutrition: {
      ...product.nutrition,
      servingSize: "",
      baseQuantity: product.nutrition.baseQuantity || "100",
      baseUnit: product.nutrition.baseUnit || "g",
      rows: []
    }
  });
}

function normalizeRawText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function matchRawValue(text: string, pattern: RegExp): string {
  return text.match(pattern)?.[1]?.trim() ?? "";
}

function extractRawNetWeight(text: string): string {
  const match =
    text.match(/\b(?:NET|Peso neto|Contenido neto)[:\s-]*(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l)\s*(?:e|℮)?(?=\s|$|[.;,)])/i) ??
    text.match(/[-–]\s*(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l)\s*(?:e|℮)?(?=\s|$|[.;,)])/i) ??
    text.match(/\b(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l)\s*(?:e|℮)(?=\s|$|[.;,)])/i);

  return match ? `${match[1]} ${match[2]}` : "";
}

function extractRawBaseMeasure(
  text: string
): { quantity: string; unit: "g" | "ml" | "kg" | "l" } | null {
  const match = text.match(
    /\b(?:por|per|je|pour|voor)\s*(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l)\b/i
  );

  if (!match || !isNutritionUnit(match[2])) {
    return null;
  }

  return {
    quantity: match[1],
    unit: match[2].toLowerCase() as "g" | "ml" | "kg" | "l"
  };
}

function extractRawServingSize(text: string): string {
  const servingSizeMatch = text.match(
    /\bServing\s+Size\s*(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l)\b/i
  );

  if (servingSizeMatch && isNutritionUnit(servingSizeMatch[2])) {
    return `Per ${servingSizeMatch[1]} ${servingSizeMatch[2].toLowerCase()}`;
  }

  const matches = [
    ...text.matchAll(/\b(?:per|por)\s*(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l)\b/gi)
  ];
  const match = matches.find((candidate) => candidate[1] !== "100");

  if (!match) {
    return "";
  }

  return `Per ${match[1]} ${match[2].toLowerCase()}`;
}

function isNutritionUnit(value: string): value is "g" | "ml" | "kg" | "l" {
  return ["g", "ml", "kg", "l"].includes(value.toLowerCase());
}

function extractRawTitle(text: string): string {
  const firstContentMarker = findFirstContentMarkerIndex(text);
  const headerText = Number.isFinite(firstContentMarker)
    ? text.slice(0, firstContentMarker)
    : text;
  const lines = headerText
    .split("\n")
    .map((line) => stripRawHeaderMetadata(line))
    .map((line) => cleanRawBody(line))
    .filter(Boolean)
    .filter(isRawTitleCandidate)
    .slice(0, 4);
  const title = lines.join("\n").trim();

  return trimRawTitle(title);
}

function findFirstContentMarkerIndex(text: string): number {
  const markers = [
    findFirstLanguageMarkerIndex(text),
    findNutritionMarkerIndex(text),
    findFirstRawSectionMarkerIndex(text),
    text.search(/\bServing\s+Size\b/i),
    text.search(/\b(?:BBD|LOT)\s*:/i),
    text.search(/\bProduct\s+From\b/i)
  ].filter((index) => index >= 0);

  return markers.length ? Math.min(...markers) : Number.POSITIVE_INFINITY;
}

function findFirstRawSectionMarkerIndex(text: string): number {
  const aliases = Object.values(RAW_SECTION_ALIASES).flat();
  const indexes = aliases
    .map((alias) => {
      const aliasPattern = escapeRegExp(alias).replace(/\\ /g, "\\s+");
      const match = new RegExp(`(^|[\\s/])${aliasPattern}\\s*[:.]`, "iu").exec(
        text
      );

      return match ? match.index + (match[1]?.length ?? 0) : -1;
    })
    .filter((index) => index >= 0);

  return indexes.length ? Math.min(...indexes) : -1;
}

function stripRawHeaderMetadata(line: string): string {
  return line
    .replace(/\bSKU[:#]?\s*[A-Z0-9._-]+/gi, " ")
    .replace(/\b(?:GTIN|EAN)[:#]?\s*\d{8,14}\b/gi, " ")
    .replace(/\bCR\s*\d+\b/gi, " ")
    .replace(/\bCR\d+\b/gi, " ")
    .replace(/\b(?:NET|Peso neto|Contenido neto)[:\s-]*\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l)\s*(?:e|℮)?(?=\s|$|[.;,)])/gi, " ");
}

function isRawTitleCandidate(line: string): boolean {
  const comparable = normalizeComparable(line);
  const letters = line.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "");

  return (
    letters.length >= 3 &&
    !/^(?:sku|gtin|ean|cr)\b/i.test(comparable) &&
    !/(?:zutaten|ingredientes|ingredients|nutrition|nahrwert|naehrwert|serving size|serving per package|imported by|importado por|importiert von|bbd|lot)/i.test(comparable)
  );
}

function trimRawTitle(title: string): string {
  const compact = title
    .split("\n")
    .map((line) => cleanRawBody(line).replace(/\s+([,.;:])/g, "$1"))
    .filter(Boolean)
    .join("\n");

  return compact.length > 220 ? compact.slice(0, 220).trim() : compact;
}

function findFirstLanguageMarkerIndex(text: string): number {
  const markerPattern = /\(([A-Z]{2})\)/g;
  let match: RegExpExecArray | null;

  while ((match = markerPattern.exec(text))) {
    if (isSupportedLanguageCode(match[1])) {
      return match.index;
    }
  }

  return -1;
}

function findNutritionMarkerIndex(text: string): number {
  const marker = text.search(
    /(?:Nährwert|Naehrwert|Información nutricional|Informacion nutricional|Nutrition|Valeurs|Voedingswaarde|Valores por|Werte je)/i
  );

  return marker >= 0 ? marker : -1;
}

function extractRawCustomerName(text: string): string {
  const importedByMatch = text.match(/\bImported by\s+([^,\n.]+)/i);

  if (importedByMatch?.[1]) {
    return cleanRawBody(importedByMatch[1]);
  }

  const poblanoMatch = text.match(/\b(Poblano(?:\s+Distribution\s+Foods)?)\b/i);

  if (poblanoMatch?.[1]) {
    return cleanRawBody(poblanoMatch[1]);
  }

  return "";
}

function extractRawImporterText(text: string): string {
  const match = text.match(
    /\b(?:Imported by|Importado por|Importiert von|Importer|Importeur)\s*:?\s*([\s\S]*?)(?=\b(?:BBD|LOT|Product From|PRODUCT FROM|Nutrition|Nährwert|Naehrwert|Información nutricional|Informacion nutricional)\b|$)/i
  );

  return match?.[1] ? cleanRawMultiline(match[1]) : "";
}

function extractRawOriginText(text: string): string {
  const productFromMatch = text.match(/\bProduct\s+From\s+([A-ZÁÉÍÓÚÜÑ ]{3,})/i);

  if (productFromMatch?.[1]) {
    return `Product from ${cleanRawBody(productFromMatch[1])}`;
  }

  const originMatch = text.match(
    /\b(?:Country of origin|Pais de origen|País de origen|Origen|Herkunft|Origine)\s*:?\s*([^\n.]+)/i
  );

  if (originMatch?.[1]) {
    return cleanRawBody(originMatch[1]);
  }

  return "";
}

function extractRawLegends(text: string): Array<{ title: string; body: string }> {
  const legends: Array<{ title: string; body: string }> = [];
  const dateLotParts: string[] = [];

  if (/\bBBD\s*:/i.test(text)) {
    dateLotParts.push("BBD:");
  }

  if (/\bLOT\s*:/i.test(text)) {
    dateLotParts.push("LOT:");
  }

  if (dateLotParts.length) {
    legends.push({
      title: "Fecha/lote",
      body: dateLotParts.join(" ")
    });
  }

  const productFrom = text.match(/\b(Product\s+From\s+[A-ZÁÉÍÓÚÜÑ ]{3,})/i);

  if (productFrom?.[1]) {
    legends.push({
      title: "Origen destacado",
      body: applyAutoBoldUppercase(cleanRawBody(productFrom[1]))
    });
  }

  return legends;
}

function cleanRawMultiline(value: string): string {
  return value
    .split("\n")
    .map((line) => cleanRawBody(line))
    .filter(Boolean)
    .join(" ");
}

function detectRawFormatName(text: string, customerName: string): string {
  if (
    /Nutrition\s+Facts/i.test(text) &&
    /\b(?:Imported by|BBD|LOT|Product From)\b/i.test(text)
  ) {
    return customerName ? `${customerName} Nutrition Facts` : "Nutrition Facts importador";
  }

  return "";
}

function createRawLabelSuggestion(
  text: string,
  product: ProductRecord
): Partial<LabelSpec> {
  const hasServingValues = product.nutrition.rows.some((row) =>
    row.perServing?.trim()
  );

  if (
    /Nutrition\s+Facts/i.test(text) &&
    /\b(?:Imported by|BBD|LOT|Product From)\b/i.test(text)
  ) {
    return {
      visualPreset: "poblano-import",
      nutritionTableAlign: "left",
      nutritionTableWidthPercent: 58,
      nutritionLabelColumnPercent: 48,
      nutritionValueColumnPercent: 31,
      nutritionTableRowPaddingMm: 0.35,
      nutritionTableFontScalePercent: 100,
      nutritionShowServing: hasServingValues
    };
  }

  return {
    nutritionShowServing: hasServingValues
  };
}

function mergeRawCustomSections(
  existing: ProductLanguageContent["customSections"],
  incoming: Array<{ title: string; body: string }>
): ProductLanguageContent["customSections"] {
  const merged = [...(existing ?? [])];

  incoming.forEach((section) => {
    const normalizedTitle = normalizeComparable(section.title);
    const normalizedBody = normalizeComparable(section.body);
    const alreadyExists = merged.some(
      (candidate) =>
        normalizeComparable(candidate.title) === normalizedTitle &&
        normalizeComparable(candidate.body) === normalizedBody
    );

    if (!alreadyExists) {
      merged.push(section);
    }
  });

  return merged;
}

function extractRawLanguageSegments(text: string): RawLanguageSegment[] {
  const markers: Array<{ language: LanguageCode; start: number; end: number }> = [];
  const markerPattern = /\(([A-Z]{2})\)/g;
  let match: RegExpExecArray | null;

  while ((match = markerPattern.exec(text))) {
    if (isSupportedLanguageCode(match[1])) {
      markers.push({
        language: match[1],
        start: match.index,
        end: match.index + match[0].length
      });
    }
  }

  return markers.map((marker, index) => {
    const nextMarker = markers[index + 1];
    const previousMarker = markers[index - 1];
    const prefix = text.slice(previousMarker?.end ?? 0, marker.start);
    const rawSegmentText = text.slice(marker.end, nextMarker?.start ?? text.length);
    const nextTitle = nextMarker ? extractRawTitleFromPrefix(rawSegmentText) : "";

    return {
      language: marker.language,
      title: extractRawTitleFromPrefix(prefix),
      text: removeTrailingRawTitle(rawSegmentText, nextTitle)
    };
  });
}

function extractRawTitleFromPrefix(prefix: string): string {
  const paragraphs = prefix
    .split(/\n\s*\n/g)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const source = paragraphs.at(-1) ?? prefix;
  const lines = source
    .split("\n")
    .map((line) => stripRawHeaderMetadata(line))
    .map((line) => cleanRawBody(line))
    .filter(Boolean)
    .filter(isRawTitleCandidate)
    .slice(-3);

  return trimRawTitle(lines.join("\n"));
}

function combineRawSegmentTitles(titles: string[], netWeight: string): string {
  const uniqueTitles = titles.reduce<string[]>((accumulator, current) => {
    const cleanTitle = stripRawNetWeightFromTitle(current, netWeight);
    const normalized = normalizeComparable(cleanTitle);
    const exists = accumulator.some(
      (title) => normalizeComparable(title) === normalized
    );

    if (!exists && cleanTitle) {
      accumulator.push(cleanTitle);
    }

    return accumulator;
  }, []);

  const title = uniqueTitles.join(" / ").replace(/\s+/g, " ").trim();

  if (!title || !netWeight) {
    return title;
  }

  return `${title} - ${netWeight} e`;
}

function stripRawNetWeightFromTitle(title: string, netWeight: string): string {
  const cleanTitle = title
    .replace(/\s*\n+\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!netWeight) {
    return cleanTitle;
  }

  const match = netWeight.match(/^(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l)$/i);

  if (!match) {
    return cleanTitle.replace(new RegExp(`${escapeRegExp(netWeight)}\\s*(?:e|℮)?`, "i"), "").trim();
  }

  const [, quantity, unit] = match;
  const weightPattern = new RegExp(
    `\\s*[-–]?\\s*${escapeRegExp(quantity)}\\s*${escapeRegExp(unit)}\\s*(?:e|℮)?\\s*$`,
    "i"
  );

  return cleanTitle.replace(weightPattern, "").trim();
}

function removeTrailingRawTitle(text: string, title: string): string {
  if (!title) {
    return text.trim();
  }

  let next = text.trimEnd();

  for (const line of title.split("\n").reverse()) {
    const index = next.toLowerCase().lastIndexOf(line.toLowerCase());

    if (index >= 0 && next.slice(index).trim() === line.trim()) {
      next = next.slice(0, index).trimEnd();
    }
  }

  return next.trim();
}

function createInferredRawSegments(
  text: string,
  title: string,
  inferredLanguages: LanguageCode[],
  fallbackLanguages: LanguageCode[]
): RawLanguageSegment[] {
  const language =
    inferredLanguages[0] ?? fallbackLanguages[0] ?? ("ES" as LanguageCode);
  const body = removeKnownTitle(removeRawNutritionBlock(text), title);

  return [
    {
      language,
      title,
      text: body || text
    }
  ];
}

function inferRawLanguages(text: string): LanguageCode[] {
  const scores = SUPPORTED_LANGUAGES.map((language) => {
    let score = 0;

    for (const key of RAW_SECTION_KEYS) {
      const sectionLabel = SECTION_LABELS[language.code][key];

      if (sectionLabel && containsComparableTerm(text, sectionLabel)) {
        score += 3;
      }
    }

    for (const nutrient of NUTRIENT_CATALOG) {
      const label = nutrient.label[language.code];

      if (label && containsComparableTerm(text, label)) {
        score += 1;
      }
    }

    return {
      language: language.code,
      score
    };
  })
    .filter((result) => result.score >= 3)
    .sort((left, right) => right.score - left.score);

  return scores.slice(0, 5).map((result) => result.language);
}

function parseRawLanguageSections(
  segment: string,
  language: LanguageCode
): Partial<Record<RawSectionKey, string>> {
  const matches = findRawSectionMarkers(segment, language);

  if (!matches.length) {
    return {};
  }

  const sections: Partial<Record<RawSectionKey, string>> = {};

  matches.forEach((match, index) => {
    const nextMatch = matches[index + 1];
    const body = cleanRawSectionBody(
      match.key,
      segment.slice(match.end, nextMatch?.start ?? segment.length)
    );

    if (body) {
      sections[match.key] = mergeDetectedText(sections[match.key], body);
    }
  });

  return sections;
}

function inferRawSectionsFromSegment(
  segment: string
): Partial<Record<RawSectionKey, string>> {
  const sections: Partial<Record<RawSectionKey, string>> = {};
  const conservation = firstRawPatternBody(segment, [
    /\b(Kühl und trocken lagern\.[\s\S]*?)(?=\s*(?:Hergestellt|Importiert|$))/i,
    /\b(Store in a cool,\s*dry place\.[\s\S]*?)(?=\s*(?:Made in|Imported by|$))/i,
    /\b(Conservar en un lugar fresco y seco\.[\s\S]*?)(?=\s*(?:Producido|Importado|$))/i,
    /\b(Conservar en lugar fresco y seco\.[\s\S]*?)(?=\s*(?:Producido|Importado|$))/i,
    /\b(À conserver dans un endroit frais et sec\.[\s\S]*?)(?=\s*(?:Produit|Fabriqué|Fabrique|Importé|Importe|$))/i,
    /\b(A conserver dans un endroit frais et sec\.[\s\S]*?)(?=\s*(?:Produit|Fabrique|Importe|$))/i
  ]);
  const origin = firstRawPatternBody(segment, [
    /\b(Hergestellt in Mexiko)\b/i,
    /\b(Made in Mexico)\b/i,
    /\b(Producido en México)\b/i,
    /\b(Producido en Mexico)\b/i,
    /\b(Hecho en México)\b/i,
    /\b(Hecho en Mexico)\b/i,
    /\b(Produit en Mexique)\b/i,
    /\b(Fabriqué au Mexique)\b/i,
    /\b(Fabrique au Mexique)\b/i
  ]);
  const importer = firstRawPatternBody(segment, [
    /\b(?:Importiert durch|Imported by|Importado por|Importé par|Importe par)\s*:?\s*([\s\S]*?)$/i
  ]);

  if (conservation) {
    sections.conservation = conservation;
  }

  if (origin) {
    sections.origin = origin;
  }

  if (importer) {
    sections.importer = importer;
  }

  return sections;
}

function firstRawPatternBody(text: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1] ? cleanRawMultiline(match[1]) : "";

    if (value) {
      return value;
    }
  }

  return "";
}

function findRawSectionMarkers(
  segment: string,
  language: LanguageCode
): Array<{ key: RawSectionKey; start: number; end: number }> {
  const matches: Array<{ key: RawSectionKey; start: number; end: number }> = [];

  for (const key of RAW_SECTION_KEYS) {
    for (const alias of rawSectionAliases(language, key)) {
      const aliasPattern = escapeRegExp(alias).replace(/\\ /g, "\\s+");
      const pattern = new RegExp(`(^|[\\s/])${aliasPattern}\\s*[:.]`, "giu");
      let match: RegExpExecArray | null;

      while ((match = pattern.exec(segment))) {
        const leading = match[1]?.length ?? 0;
        matches.push({
          key,
          start: match.index + leading,
          end: match.index + match[0].length
        });
      }
    }
  }

  return matches
    .sort((left, right) => left.start - right.start)
    .filter(
      (match, index, all) =>
        index === 0 || match.start > all[index - 1].start + 2
    );
}

function rawSectionAliases(
  language: LanguageCode,
  key: RawSectionKey
): string[] {
  return [
    SECTION_LABELS[language][key],
    ...RAW_SECTION_ALIASES[key]
  ].filter(Boolean);
}

function removeRawNutritionBlock(text: string): string {
  const marker = findNutritionMarkerIndex(text);

  if (marker < 0) {
    return text;
  }

  const before = text.slice(0, marker).trim();
  const after = text.slice(marker);
  const nextSemanticMarker = after.search(
    /\b(?:Kühl und trocken lagern|Store in a cool|Conservar en|À conserver|A conserver|Imported by|Importado por|Importiert von|Importiert durch|Importer|Importeur|Importé par|Importe par|BBD|LOT|Product From|Product of|Made in|Hecho en|Hergestellt|Produit en|Fabriqué|Fabrique)\b/i
  );

  if (nextSemanticMarker > 0) {
    return `${before}\n${after.slice(nextSemanticMarker).trim()}`.trim();
  }

  return before;
}

function cleanRawSectionBody(key: RawSectionKey, value: string): string {
  let cleaned = removeRawNutritionBlock(value);

  if (key === "ingredients") {
    cleaned = cleaned
      .replace(
        /\b(?:Nährwert|Naehrwert|Información nutricional|Informacion nutricional|Nutrition|Valeurs|Voedingswaarde|Valores por|Werte je)\b[\s\S]*$/i,
        " "
      )
      .replace(
        /\b(?:Kühl und trocken lagern|Store in a cool|Conservar en|À conserver|A conserver|Hergestellt in|Made in|Producido en|Hecho en|Produit en|Fabriqué|Fabrique|Importiert durch|Importiert von|Imported by|Importado por|Importé par|Importe par)\b[\s\S]*$/i,
        " "
      )
      .replace(/\bServing\s+Size\b[\s\S]*$/i, " ")
      .replace(/\bServing\s+per\s+Package\b[\s\S]*$/i, " ");
  }

  return cleanRawBody(
    cleaned
      .replace(/\b(?:BBD|LOT)\s*:\s*[^\n]*/gi, " ")
      .replace(/\bProduct\s+From\s+[A-ZÁÉÍÓÚÜÑ ]{3,}/gi, " ")
  );
}

function removeKnownTitle(text: string, title: string): string {
  if (!title) {
    return text;
  }

  const normalizedTitle = normalizeComparable(title);
  const escapedTitle = escapeRegExp(title);

  return text
    .split("\n")
    .filter((line) => {
      const comparableLine = normalizeComparable(stripRawHeaderMetadata(line));

      return (
        comparableLine !== normalizedTitle &&
        !normalizedTitle.includes(comparableLine) &&
        !comparableLine.includes(normalizedTitle)
      );
    })
    .join("\n")
    .replace(new RegExp(`^${escapedTitle}\\s*`, "i"), "")
    .replace(new RegExp(`\\s+${escapedTitle}\\s+`, "gi"), " ")
    .trim();
}

function applyRawNutritionValues(
  text: string,
  languages: LanguageCode[],
  detected: string[]
): NutritionRow[] {
  const lines = extractRawNutritionCandidates(text);
  const detectedIds = new Set<string>();
  const columnMode = inferRawNutritionColumnMode(text);

  for (const row of NUTRIENT_CATALOG) {
    const line = lines.find((candidate) =>
      nutrientAliases(row, languages).some((alias) =>
        containsComparableTerm(candidate, alias)
      )
    );

    if (line && extractRawNutritionNumbers(line).length) {
      detectedIds.add(row.id);
    }
  }

  const rowIds = detectedIds.size ? [...detectedIds] : RAW_DEFAULT_NUTRIENT_IDS;
  const rows = NUTRIENT_CATALOG.filter((item) => rowIds.includes(item.id)).map(
    (item) => ({
      id: item.id,
      label: item.label,
      per100g: "",
      perServing: "",
      riPercent: "",
      indent: item.indent
    })
  );

  return rows.map((row) => {
    const line = lines.find((candidate) =>
      nutrientAliases(row, languages).some((alias) =>
        containsComparableTerm(candidate, alias)
      )
    );

    if (!line) {
      return row;
    }

    const values = extractRawNutritionNumbers(line);

    if (!values.length) {
      return row;
    }

    detected.push(`nutricion ${row.id}`);

    return assignRawNutritionValues(row, values, columnMode);
  });
}

function inferRawNutritionColumnMode(text: string): RawNutritionColumnMode {
  const servingColumnIndex = text.search(
    /\b(?:Avg\s+Qty\s+per\s+Serving|Qty\s+per\s+Serving|Per\s+(?!100\b)\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l)|Por\s+(?!100\b)\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l)|Porci[oó]n)\b/i
  );
  const per100Index = text.search(
    /\b(?:Per|Por|Je|Pour|Voor|Werte\s+je|Valores\s+por|Values\s+per)\s*100\s*(?:g|kg|ml|l)\b/i
  );

  if (servingColumnIndex >= 0 && per100Index >= 0) {
    return servingColumnIndex < per100Index
      ? "serving-then-per100"
      : "per100-then-serving";
  }

  return "per100-only";
}

function assignRawNutritionValues(
  row: NutritionRow,
  values: string[],
  columnMode: RawNutritionColumnMode
): NutritionRow {
  const riPercent = values.find((value) => value.includes("%")) ?? row.riPercent;
  const nutrientValues = values.filter((value) => !value.includes("%"));

  if (row.id === "energy") {
    return assignRawEnergyValues(row, nutrientValues, riPercent, columnMode);
  }

  if (columnMode === "serving-then-per100" && nutrientValues.length >= 2) {
    return {
      ...row,
      perServing: nutrientValues[0] ?? row.perServing,
      per100g: nutrientValues[1] ?? row.per100g,
      riPercent
    };
  }

  if (columnMode === "per100-then-serving" && nutrientValues.length >= 2) {
    return {
      ...row,
      per100g: nutrientValues[0] ?? row.per100g,
      perServing: nutrientValues[1] ?? row.perServing,
      riPercent
    };
  }

  return {
    ...row,
    per100g: nutrientValues[0] ?? row.per100g,
    perServing: row.perServing,
    riPercent
  };
}

function extractRawNutritionCandidates(text: string): string[] {
  const compactText = text.replace(/\n+/g, " ");
  const nutritionStart = findNutritionMarkerIndex(compactText);
  const nutritionSource =
    nutritionStart >= 0 ? compactText.slice(nutritionStart) : compactText;
  const nutritionEnd = nutritionSource.search(
    /\b(?:Kühl|Store in|Conservar|Best before|Mindestens haltbar|Consumir preferentemente|Made in|Hergestellt|Producido|Importiert|Imported|Importado|BBD|LOT|Product From)\b/i
  );
  const nutritionBlock =
    nutritionEnd > 0 ? nutritionSource.slice(0, nutritionEnd) : nutritionSource;
  const lineChunks = text
    .split(/\n+/g)
    .filter((line) => !line.includes(";") && extractRawNutritionNumbers(line).length);
  const chunks = [...nutritionBlock.split(/[;]/g), ...lineChunks];
  const seen = new Set<string>();

  return chunks
    .map(stripRawNutritionHeaderContext)
    .map((line) => cleanRawBody(line))
    .filter(Boolean)
    .filter((line) => {
      const normalized = normalizeComparable(line);

      if (seen.has(normalized)) {
        return false;
      }

      seen.add(normalized);
      return true;
    });
}

function stripRawNutritionHeaderContext(line: string): string {
  return line
    .replace(
      /\b(?:Nutrition Facts|Nutrition|Nutritional information|Nährwertangaben|Naehrwertangaben|Información nutricional|Informacion nutricional|Valeurs nutritionnelles|Voedingswaarde)\.?\s*/gi,
      " "
    )
    .replace(
      /\b(?:Quantity|Cantidad|Valores|Values|Werte)\s*(?:per|por|je)?\s*100\s*(?:g|kg|ml|l)\s*:?\s*/gi,
      " "
    )
    .replace(/\b(?:per|por|je|pour|voor)\s*100\s*(?:g|kg|ml|l)\s*:?\s*/gi, " ")
    .replace(
      /\bServing\s+Size\s*\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l)\b/gi,
      " "
    )
    .replace(/\bServing\s+per\s+Package\s*\d+\b/gi, " ");
}

function assignRawEnergyValues(
  row: NutritionRow,
  values: string[],
  riPercent: string | undefined,
  columnMode: RawNutritionColumnMode
): NutritionRow {
  if (columnMode === "serving-then-per100" && values.length >= 2) {
    return {
      ...row,
      perServing: combineEnergyValues(values.slice(0, values.length >= 4 ? 2 : 1)),
      per100g: combineEnergyValues(values.slice(values.length >= 4 ? 2 : 1)),
      riPercent
    };
  }

  if (columnMode === "per100-then-serving" && values.length >= 2) {
    return {
      ...row,
      per100g: combineEnergyValues(values.slice(0, values.length >= 4 ? 2 : 1)),
      perServing: combineEnergyValues(values.slice(values.length >= 4 ? 2 : 1)),
      riPercent
    };
  }

  return {
    ...row,
    per100g: combineEnergyValues(values),
    perServing: row.perServing,
    riPercent
  };
}

function combineEnergyValues(values: string[]): string {
  return values.filter(Boolean).join(" / ");
}

function nutrientAliases(
  row: Pick<NutritionRow, "id" | "label">,
  languages: LanguageCode[]
): string[] {
  return [
    ...(RAW_NUTRIENT_ALIASES[row.id] ?? []),
    ...languages.map((language) => row.label[language] ?? ""),
    row.label.EN,
    row.id.replace(/_/g, " ")
  ].filter(Boolean);
}

function extractRawNutritionNumbers(line: string): string[] {
  return (
    line.match(
      /(?:\d{1,3}(?:[,.]\d{3})+|\d+(?:[.,]\d+)?)\s*(?:kJ|kcal|g|mg|µg|μg|ug|%)/gi
    ) ?? []
  ).map((value) => value.replace(/\s+/g, " ").trim());
}

function getProductValidationIssues(
  product: ProductRecord,
  selectedLanguages: LanguageCode[]
): string[] {
  const issues: string[] = [];

  if (!product.sku.trim()) {
    issues.push("Falta SKU");
  }

  if (!product.name.trim()) {
    issues.push("Falta titulo/nombre base");
  }

  selectedLanguages.forEach((language) => {
    const content = product.languages[language];

    if (!content) {
      issues.push(`Falta contenido ${language}`);
      return;
    }

    if (!content.ingredients?.trim()) {
      issues.push(`Faltan ingredientes ${language}`);
    }
  });

  if (!product.nutrition.rows.length) {
    issues.push("Falta tabla nutricional");
  }

  product.nutrition.rows.forEach((row) => {
    if (!row.per100g.trim()) {
      issues.push(`Falta valor nutricional: ${row.label.EN}`);
    }
  });

  return issues;
}

function uniqueLanguages(languages: LanguageCode[]): LanguageCode[] {
  return [...new Set(languages)];
}

function isSupportedLanguageCode(value: string): value is LanguageCode {
  return SUPPORTED_LANGUAGES.some((language) => language.code === value);
}

function containsComparableTerm(text: string, term: string): boolean {
  const normalizedText = normalizeComparable(text);
  const normalizedTerm = normalizeComparable(term);

  if (!normalizedTerm) {
    return false;
  }

  return normalizedText.includes(normalizedTerm);
}

function normalizeComparable(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%µ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mergeDetectedText(existing: string | undefined, incoming: string): string {
  const cleanIncoming = applyAutoBoldUppercase(cleanRawBody(incoming));

  if (!cleanIncoming) {
    return existing ?? "";
  }

  if (!existing?.trim()) {
    return cleanIncoming;
  }

  if (normalizeComparable(existing).includes(normalizeComparable(cleanIncoming))) {
    return existing;
  }

  return `${existing.trim()} ${cleanIncoming}`;
}

function applyAutoBoldUppercase(value: string): string {
  return value.replace(
    /\b((?:[A-ZÁÉÍÓÚÜÑ]{2,}|\([A-ZÁÉÍÓÚÜÑ]{2,}\))(?:[\s/,-]+(?:[A-ZÁÉÍÓÚÜÑ]{2,}|\([A-ZÁÉÍÓÚÜÑ]{2,}\)))*)\b/g,
    (match) => {
      const letters = match.replace(/[^A-ZÁÉÍÓÚÜÑ]/g, "");

      if (letters.length < 3) {
        return match;
      }

      return `**${match}**`;
    }
  );
}

function cleanRawBody(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/^[/\s:.-]+/, "")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseDelimited(text: string): string[][] {
  const delimiter = text.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (!quoted && char === delimiter) {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      if (row.some((value) => value.trim())) {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim())) {
    rows.push(row);
  }

  return rows;
}

function readImportField(row: Record<string, string>, field: string): string {
  const aliases = IMPORT_FIELD_ALIASES[field] ?? [field];
  const normalizedAliases = new Set(aliases.map(normalizeImportKey));

  for (const [key, value] of Object.entries(row)) {
    if (normalizedAliases.has(normalizeImportKey(key))) {
      return value ?? "";
    }
  }

  return "";
}

function normalizeImportKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%]/g, "");
}

function canonicalImportSection(section: string): string {
  const normalized = normalizeImportKey(section);

  for (const [field, aliases] of Object.entries(IMPORT_FIELD_ALIASES)) {
    if (aliases.map(normalizeImportKey).includes(normalized)) {
      return field;
    }
  }

  return section;
}

function canonicalMetadataSection(
  section: string
): ProductMetadataField | undefined {
  const normalized = normalizeImportKey(section);

  for (const [field, aliases] of Object.entries(METADATA_ALIASES)) {
    if (aliases.map(normalizeImportKey).includes(normalized)) {
      return field as ProductMetadataField;
    }
  }

  return undefined;
}

function hasImportValue(value: string | undefined): value is string {
  return Boolean(value?.trim());
}

function applyImportRow(
  product: ProductRecord,
  row: Record<string, string>
): ProductRecord {
  const sku = readImportField(row, "sku").trim() || product.sku;
  const language = readImportField(row, "language")
    .trim()
    .toUpperCase() as LanguageCode | "";
  const section = readImportField(row, "section").trim();
  const canonicalSection = section.startsWith("nutrition.")
    ? section
    : canonicalImportSection(section);
  const value = readImportField(row, "value");

  if (!section) {
    return applyWideImportRow({
      ...product,
      sku
    }, row);
  }

  let next: ProductRecord = {
    ...product,
    sku
  };

  const metadataSection = canonicalMetadataSection(canonicalSection);

  if (!language && metadataSection) {
    if (!hasImportValue(value)) {
      return next;
    }

    return setProductMetadata(next, metadataSection, value);
  }

  if (
    !language &&
    ["name", "gtin", "brand", "netWeight", "countryOfOrigin"].includes(
      canonicalSection
    )
  ) {
    if (!hasImportValue(value)) {
      return next;
    }

    next = {
      ...next,
      [canonicalSection]: value || undefined
    };
    return cleanProduct(next);
  }

  if (canonicalSection.startsWith("nutrition.")) {
    const id = canonicalSection.replace("nutrition.", "");

    if (id === "baseQuantity" || id === "baseUnit") {
      if (!hasImportValue(value)) {
        return next;
      }

      return {
        ...next,
        nutrition: {
          ...next.nutrition,
          [id]: value
        }
      };
    }

    const rows = [...next.nutrition.rows];
    const existingIndex = rows.findIndex((nutritionRow) => nutritionRow.id === id);
    const catalogItem = NUTRIENT_CATALOG.find((item) => item.id === id);
    const baseRow: NutritionRow = {
      id,
      label: catalogItem?.label ?? { EN: value || id },
      per100g: readImportField(row, "per100g"),
      perServing: readImportField(row, "perServing"),
      riPercent: readImportField(row, "riPercent"),
      indent: catalogItem?.indent
    };
    const targetIndex = existingIndex >= 0 ? existingIndex : rows.length;
    const currentRow = rows[targetIndex] ?? baseRow;
    const per100g = readImportField(row, "per100g");
    const perServing = readImportField(row, "perServing");
    const riPercent = readImportField(row, "riPercent");

    rows[targetIndex] = {
      ...currentRow,
      label: language && hasImportValue(value)
        ? {
            ...currentRow.label,
            [language]: value || currentRow.label[language] || currentRow.label.EN
          }
        : currentRow.label,
      per100g: per100g || currentRow.per100g,
      perServing: perServing || currentRow.perServing,
      riPercent: riPercent || currentRow.riPercent
    };

    return {
      ...next,
      nutrition: {
        ...next.nutrition,
        rows
      }
    };
  }

  if (language && isEditableLanguageSection(canonicalSection)) {
    if (!hasImportValue(value)) {
      return next;
    }

    return {
      ...next,
      languages: {
        ...next.languages,
        [language]: {
          ...next.languages[language],
          [canonicalSection]: value
        }
      }
    };
  }

  return next;
}

function applyWideImportRow(
  product: ProductRecord,
  row: Record<string, string>
): ProductRecord {
  let next = withDefaultProductMetadata(product);
  const simpleFields = [
    "name",
    "gtin",
    "brand",
    "netWeight",
    "countryOfOrigin"
  ] as const;

  simpleFields.forEach((field) => {
    const value = readImportField(row, field);

    if (hasImportValue(value)) {
      next = {
        ...next,
        [field]: value
      };
    }
  });

  PRODUCT_METADATA_FIELDS.forEach((field) => {
    const value = readImportField(row, field);

    if (hasImportValue(value)) {
      next = setProductMetadata(next, field, value);
    }
  });

  return cleanProduct(next);
}

function isEditableLanguageSection(section: string): section is
  | "name"
  | "ingredients"
  | "warnings"
  | "conservation"
  | "origin"
  | "importer" {
  return [
    "name",
    "ingredients",
    "warnings",
    "conservation",
    "origin",
    "importer"
  ].includes(section);
}

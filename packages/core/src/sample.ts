import { SUPPORTED_LANGUAGES } from "./languages.js";
import { NUTRIENT_CATALOG } from "./nutrients.js";
import type { LanguageCode, ProductLanguageContent, ProductRecord } from "./types.js";

const localizedContent: Partial<Record<LanguageCode, ProductLanguageContent>> = {
  DE: {
    name: "Tamale mit Mais und Chili",
    ingredients:
      "Maisteig 62%, Wasser, Sonnenblumenöl, Chili, Salz, Gewürze. Kann Spuren von Sesam und Soja enthalten.",
    warnings: "Nach dem Öffnen gekühlt lagern und innerhalb von 48 Stunden verbrauchen.",
    conservation: "Kühl und trocken lagern. Vor direkter Sonneneinstrahlung schützen.",
    origin: "Herkunftsland: Mexiko.",
    importer: "Importeur: Industrial Foods GmbH, Berlin, Deutschland."
  },
  ES: {
    name: "Tamal de maíz con chile",
    ingredients:
      "Masa de maíz 62%, agua, aceite de girasol, chile, sal, especias. Puede contener trazas de sésamo y soja.",
    warnings: "Una vez abierto, mantener refrigerado y consumir antes de 48 horas.",
    conservation: "Conservar en lugar fresco y seco. Proteger de la luz solar directa.",
    origin: "País de origen: México.",
    importer: "Importador: Industrial Foods GmbH, Berlin, Alemania."
  },
  FR: {
    name: "Tamale de maïs au piment",
    ingredients:
      "Pâte de maïs 62 %, eau, huile de tournesol, piment, sel, épices. Peut contenir des traces de sésame et de soja.",
    warnings: "Après ouverture, conserver au réfrigérateur et consommer sous 48 heures.",
    conservation: "À conserver dans un endroit frais et sec. Protéger de la lumière directe.",
    origin: "Pays d'origine : Mexique.",
    importer: "Importateur : Industrial Foods GmbH, Berlin, Allemagne."
  },
  NL: {
    name: "Maistamale met chili",
    ingredients:
      "Maïsdeeg 62%, water, zonnebloemolie, chili, zout, specerijen. Kan sporen van sesam en soja bevatten.",
    warnings: "Na opening gekoeld bewaren en binnen 48 uur consumeren.",
    conservation: "Koel en droog bewaren. Beschermen tegen direct zonlicht.",
    origin: "Land van oorsprong: Mexico.",
    importer: "Importeur: Industrial Foods GmbH, Berlijn, Duitsland."
  },
  EN: {
    name: "Corn tamale with chili",
    ingredients:
      "Corn dough 62%, water, sunflower oil, chili, salt, spices. May contain traces of sesame and soy.",
    warnings: "Once opened, keep refrigerated and consume within 48 hours.",
    conservation: "Store in a cool, dry place. Protect from direct sunlight.",
    origin: "Country of origin: Mexico.",
    importer: "Importer: Industrial Foods GmbH, Berlin, Germany."
  }
};

export const sampleProduct: ProductRecord = {
  sku: "TAM001",
  name: "Corn tamale with chili",
  gtin: "07501234567890",
  brand: "Casa Industrial",
  netWeight: "280 g",
  countryOfOrigin: "Mexico",
  languages: createSampleLanguages(),
  nutrition: {
    baseQuantity: "100",
    baseUnit: "g",
    servingSize: "Per 70 g",
    rows: [
      {
        id: "energy",
        label: nutritionLabel("energy"),
        per100g: "780 kJ / 186 kcal",
        perServing: "546 kJ / 130 kcal",
        riPercent: "7%"
      },
      {
        id: "fat",
        label: nutritionLabel("fat"),
        per100g: "6.4 g",
        perServing: "4.5 g",
        riPercent: "6%"
      },
      {
        id: "saturates",
        label: nutritionLabel("saturates"),
        per100g: "0.9 g",
        perServing: "0.6 g",
        riPercent: "3%",
        indent: true
      },
      {
        id: "carbohydrate",
        label: nutritionLabel("carbohydrate"),
        per100g: "27.8 g",
        perServing: "19.5 g",
        riPercent: "8%"
      },
      {
        id: "sugars",
        label: nutritionLabel("sugars"),
        per100g: "2.1 g",
        perServing: "1.5 g",
        riPercent: "2%",
        indent: true
      },
      {
        id: "fiber",
        label: nutritionLabel("fiber"),
        per100g: "3.2 g",
        perServing: "2.2 g",
        riPercent: ""
      },
      {
        id: "protein",
        label: nutritionLabel("protein"),
        per100g: "4.8 g",
        perServing: "3.4 g",
        riPercent: "7%"
      },
      {
        id: "salt",
        label: nutritionLabel("salt"),
        per100g: "1.1 g",
        perServing: "0.8 g",
        riPercent: "13%"
      }
    ]
  },
  metadata: {
    status: "",
    attachments: [],
    regulatoryReady: false,
    createdFor: "Zebra ZT610 203 DPI"
  }
};

function createSampleLanguages(): ProductRecord["languages"] {
  const fallback =
    "Corn dough, water, sunflower oil, chili, salt and spices. Store in a cool, dry place.";

  return SUPPORTED_LANGUAGES.reduce<ProductRecord["languages"]>(
    (accumulator, language) => {
      accumulator[language.code] = localizedContent[language.code] ?? {
        name: `Corn tamale with chili (${language.nativeName})`,
        ingredients: fallback,
        warnings: "Keep refrigerated after opening and consume within 48 hours.",
        conservation: "Store away from heat and direct sunlight.",
        origin: "Country of origin: Mexico.",
        importer: "Importer: Industrial Foods GmbH, Berlin, Germany."
      };

      return accumulator;
    },
    {}
  );
}

function nutritionLabel(id: string) {
  const catalogItem = NUTRIENT_CATALOG.find((item) => item.id === id);

  if (!catalogItem) {
    throw new Error(`Missing nutrient catalog item: ${id}`);
  }

  return catalogItem.label;
}

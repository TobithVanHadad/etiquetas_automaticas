import type { LanguageCode, LanguageDefinition, SectionKey } from "./types.js";

export const SUPPORTED_LANGUAGES: LanguageDefinition[] = [
  { code: "DE", name: "German", nativeName: "Deutsch" },
  { code: "ES", name: "Spanish", nativeName: "Español" },
  { code: "FR", name: "French", nativeName: "Français" },
  { code: "NL", name: "Dutch", nativeName: "Nederlands" },
  { code: "EN", name: "English", nativeName: "English" },
  { code: "IT", name: "Italian", nativeName: "Italiano" },
  { code: "DA", name: "Danish", nativeName: "Dansk" },
  { code: "NO", name: "Norwegian", nativeName: "Norsk" },
  { code: "FI", name: "Finnish", nativeName: "Suomi" },
  { code: "EL", name: "Greek", nativeName: "Ελληνικά" },
  { code: "SV", name: "Swedish", nativeName: "Svenska" },
  { code: "PL", name: "Polish", nativeName: "Polski" },
  { code: "SL", name: "Slovenian", nativeName: "Slovenščina" },
  { code: "CS", name: "Czech", nativeName: "Čeština" },
  { code: "HU", name: "Hungarian", nativeName: "Magyar" },
  { code: "SK", name: "Slovak", nativeName: "Slovenčina" },
  { code: "RO", name: "Romanian", nativeName: "Română" },
  { code: "PT", name: "Portuguese", nativeName: "Português" },
  { code: "HR", name: "Croatian", nativeName: "Hrvatski" },
  { code: "ET", name: "Estonian", nativeName: "Eesti" }
];

export const SUPPORTED_LANGUAGE_CODES = SUPPORTED_LANGUAGES.map(
  (language) => language.code
);

export const OFFICIAL_COMBINATIONS: LanguageCode[][] = [
  ["DE", "ES"],
  ["DE", "ES", "FR"],
  ["DE", "ES", "FR", "NL"],
  ["DE", "ES", "FR", "NL", "EN"]
];

export const SECTION_LABELS: Record<
  LanguageCode,
  Record<SectionKey, string>
> = {
  DE: {
    name: "Bezeichnung",
    ingredients: "Zutaten",
    nutrition: "Nährwerte",
    warnings: "Hinweise",
    conservation: "Aufbewahrung",
    origin: "Ursprung",
    importer: "Importeur"
  },
  ES: {
    name: "Nombre",
    ingredients: "Ingredientes",
    nutrition: "Información nutricional",
    warnings: "Advertencias",
    conservation: "Conservación",
    origin: "Origen",
    importer: "Importador"
  },
  FR: {
    name: "Nom",
    ingredients: "Ingrédients",
    nutrition: "Valeurs nutritionnelles",
    warnings: "Avertissements",
    conservation: "Conservation",
    origin: "Origine",
    importer: "Importateur"
  },
  NL: {
    name: "Naam",
    ingredients: "Ingrediënten",
    nutrition: "Voedingswaarden",
    warnings: "Waarschuwingen",
    conservation: "Bewaren",
    origin: "Oorsprong",
    importer: "Importeur"
  },
  EN: {
    name: "Name",
    ingredients: "Ingredients",
    nutrition: "Nutrition",
    warnings: "Warnings",
    conservation: "Storage",
    origin: "Origin",
    importer: "Importer"
  },
  IT: {
    name: "Nome",
    ingredients: "Ingredienti",
    nutrition: "Valori nutrizionali",
    warnings: "Avvertenze",
    conservation: "Conservazione",
    origin: "Origine",
    importer: "Importatore"
  },
  DA: {
    name: "Navn",
    ingredients: "Ingredienser",
    nutrition: "Næringsindhold",
    warnings: "Advarsler",
    conservation: "Opbevaring",
    origin: "Oprindelse",
    importer: "Importør"
  },
  NO: {
    name: "Navn",
    ingredients: "Ingredienser",
    nutrition: "Næringsinnhold",
    warnings: "Advarsler",
    conservation: "Oppbevaring",
    origin: "Opprinnelse",
    importer: "Importør"
  },
  FI: {
    name: "Nimi",
    ingredients: "Ainesosat",
    nutrition: "Ravintosisältö",
    warnings: "Varoitukset",
    conservation: "Säilytys",
    origin: "Alkuperä",
    importer: "Maahantuoja"
  },
  EL: {
    name: "Όνομα",
    ingredients: "Συστατικά",
    nutrition: "Διατροφικές αξίες",
    warnings: "Προειδοποιήσεις",
    conservation: "Διατήρηση",
    origin: "Προέλευση",
    importer: "Εισαγωγέας"
  },
  SV: {
    name: "Namn",
    ingredients: "Ingredienser",
    nutrition: "Näringsvärde",
    warnings: "Varningar",
    conservation: "Förvaring",
    origin: "Ursprung",
    importer: "Importör"
  },
  PL: {
    name: "Nazwa",
    ingredients: "Składniki",
    nutrition: "Wartość odżywcza",
    warnings: "Ostrzeżenia",
    conservation: "Przechowywanie",
    origin: "Pochodzenie",
    importer: "Importer"
  },
  SL: {
    name: "Ime",
    ingredients: "Sestavine",
    nutrition: "Hranilne vrednosti",
    warnings: "Opozorila",
    conservation: "Shranjevanje",
    origin: "Poreklo",
    importer: "Uvoznik"
  },
  CS: {
    name: "Název",
    ingredients: "Složení",
    nutrition: "Výživové údaje",
    warnings: "Upozornění",
    conservation: "Skladování",
    origin: "Původ",
    importer: "Dovozce"
  },
  HU: {
    name: "Név",
    ingredients: "Összetevők",
    nutrition: "Tápérték",
    warnings: "Figyelmeztetések",
    conservation: "Tárolás",
    origin: "Származás",
    importer: "Importőr"
  },
  SK: {
    name: "Názov",
    ingredients: "Zloženie",
    nutrition: "Výživové údaje",
    warnings: "Upozornenia",
    conservation: "Skladovanie",
    origin: "Pôvod",
    importer: "Dovozca"
  },
  RO: {
    name: "Nume",
    ingredients: "Ingrediente",
    nutrition: "Valori nutriționale",
    warnings: "Avertismente",
    conservation: "Păstrare",
    origin: "Origine",
    importer: "Importator"
  },
  PT: {
    name: "Nome",
    ingredients: "Ingredientes",
    nutrition: "Informação nutricional",
    warnings: "Advertências",
    conservation: "Conservação",
    origin: "Origem",
    importer: "Importador"
  },
  HR: {
    name: "Naziv",
    ingredients: "Sastojci",
    nutrition: "Hranjive vrijednosti",
    warnings: "Upozorenja",
    conservation: "Čuvanje",
    origin: "Podrijetlo",
    importer: "Uvoznik"
  },
  ET: {
    name: "Nimi",
    ingredients: "Koostisosad",
    nutrition: "Toiteväärtus",
    warnings: "Hoiatused",
    conservation: "Säilitamine",
    origin: "Päritolu",
    importer: "Importija"
  }
};

export function isLanguageCode(value: string): value is LanguageCode {
  return SUPPORTED_LANGUAGE_CODES.includes(value as LanguageCode);
}

export function getLanguageDefinition(code: LanguageCode): LanguageDefinition {
  const language = SUPPORTED_LANGUAGES.find((item) => item.code === code);

  if (!language) {
    throw new Error(`Unsupported language code: ${code}`);
  }

  return language;
}

export function normalizeCombination(languages: LanguageCode[]): string {
  return languages.join("-");
}

export function isOfficialCombination(languages: LanguageCode[]): boolean {
  const normalized = normalizeCombination(languages);
  return OFFICIAL_COMBINATIONS.some(
    (combination) => normalizeCombination(combination) === normalized
  );
}

export const DOTS_PER_INCH_DEFAULT = 203;
export const MM_PER_INCH = 25.4;
export const POINTS_PER_INCH = 72;
export const MIN_TEXT_HEIGHT_MM = 1.2;
export const MIN_ARIAL_POINT_SIZE = 6.2;
export const MIN_ARIAL_TEXT_HEIGHT_MM = pointsToMm(MIN_ARIAL_POINT_SIZE);

export function mmToDots(mm: number, dpi = DOTS_PER_INCH_DEFAULT): number {
  return Math.round((mm / MM_PER_INCH) * dpi);
}

export function dotsToMm(dots: number, dpi = DOTS_PER_INCH_DEFAULT): number {
  return (dots / dpi) * MM_PER_INCH;
}

export function pointsToMm(points: number): number {
  return (points / POINTS_PER_INCH) * MM_PER_INCH;
}

export function getMinimumTextHeightMm(
  fontFamily?: "zebra" | "zebra-native" | "arial"
): number {
  return fontFamily === "arial" ? MIN_ARIAL_TEXT_HEIGHT_MM : MIN_TEXT_HEIGHT_MM;
}

export function clampToIndustrialMinimum(
  fontMm: number,
  minimumMm = MIN_TEXT_HEIGHT_MM
): number {
  return Math.max(minimumMm, fontMm);
}

export function wrapText(
  text: string,
  widthMm: number,
  fontMm: number
): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return [];
  }

  const averageCharacterWidthMm = fontMm * 0.52;
  const maxCharacters = Math.max(
    7,
    Math.floor(widthMm / averageCharacterWidthMm)
  );

  return normalized
    .split(/\n/g)
    .flatMap((paragraph) => wrapParagraph(paragraph, maxCharacters));
}

export function measureTextHeightMm(
  text: string,
  widthMm: number,
  fontMm: number,
  lineHeight = 1.24
): number {
  const lines = text
    .split(/\n/g)
    .flatMap((paragraph) => wrapParagraph(paragraph, Math.max(7, Math.floor(widthMm / (fontMm * 0.52)))));

  return Math.max(fontMm * lineHeight, lines.length * fontMm * lineHeight);
}

function wrapParagraph(paragraph: string, maxCharacters: number): string[] {
  const words = paragraph.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (word.length > maxCharacters) {
      if (current) {
        lines.push(current);
        current = "";
      }

      for (let index = 0; index < word.length; index += maxCharacters) {
        lines.push(word.slice(index, index + maxCharacters));
      }
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;

    if (candidate.length > maxCharacters && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.length ? lines : [""];
}

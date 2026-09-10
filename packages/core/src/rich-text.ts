export interface RichTextSegment {
  text: string;
  bold: boolean;
}

export interface RichTextLine {
  segments: RichTextSegment[];
  widthMm: number;
}

export interface RichTextFlowRegion {
  widthMm: number;
  maxLines: number;
}

export function stripRichTextMarkers(text: string): string {
  return text.replace(/\*\*/g, "");
}

export function hasRichTextMarkers(text: string): boolean {
  return text.includes("**");
}

export function parseRichText(text: string): RichTextSegment[] {
  const parts = text.split("**");
  return parts
    .map((part, index) => ({
      text: part,
      bold: index % 2 === 1
    }))
    .filter((part) => part.text.length > 0);
}

export function wrapRichText(
  text: string,
  widthMm: number,
  fontMm: number
): RichTextLine[] {
  const paragraphs = text.split(/\r?\n/g);
  const lines: RichTextLine[] = [];

  for (const paragraph of paragraphs) {
    const tokens = tokenizeRichSegments(parseRichText(paragraph));
    let current: RichTextLine = { segments: [], widthMm: 0 };

    for (const token of tokens) {
      const tokenWidth = measureSegmentWidthMm(token.text, fontMm, token.bold);

      if (
        current.segments.length > 0 &&
        current.widthMm + tokenWidth > widthMm
      ) {
        trimLine(current);
        lines.push(current);
        current = { segments: [], widthMm: 0 };

        if (/^\s+$/.test(token.text)) {
          continue;
        }
      }

      if (tokenWidth > widthMm) {
        const pieces = breakLongToken(token, widthMm, fontMm);
        for (const piece of pieces) {
          if (current.segments.length > 0) {
            trimLine(current);
            lines.push(current);
            current = { segments: [], widthMm: 0 };
          }
          current.segments.push(piece);
          current.widthMm = measureSegmentWidthMm(piece.text, fontMm, piece.bold);
        }
        continue;
      }

      current.segments.push(token);
      current.widthMm += tokenWidth;
    }

    trimLine(current);
    lines.push(current);
  }

  return lines.length ? lines : [{ segments: [], widthMm: 0 }];
}

export function flowRichTextIntoRegions(
  text: string,
  regions: RichTextFlowRegion[],
  fontMm: number
): { regions: RichTextLine[][]; overflow: boolean } {
  const normalizedRegions = regions.map((region) => ({
    widthMm: Math.max(1, region.widthMm),
    maxLines: Math.max(0, Math.floor(region.maxLines))
  }));
  const flowedRegions = normalizedRegions.map(() => [] as RichTextLine[]);
  let regionIndex = 0;
  let current: RichTextLine = { segments: [], widthMm: 0 };
  let overflow = false;

  const advancePastFullRegions = () => {
    while (
      regionIndex < normalizedRegions.length &&
      flowedRegions[regionIndex].length >= normalizedRegions[regionIndex].maxLines
    ) {
      regionIndex += 1;
    }
  };

  const pushCurrentLine = () => {
    trimLine(current);
    advancePastFullRegions();

    if (regionIndex >= normalizedRegions.length) {
      overflow = overflow || current.segments.length > 0;
      current = { segments: [], widthMm: 0 };
      return;
    }

    flowedRegions[regionIndex].push(current);
    current = { segments: [], widthMm: 0 };
    advancePastFullRegions();
  };

  const addToken = (token: RichTextSegment) => {
    advancePastFullRegions();

    if (regionIndex >= normalizedRegions.length) {
      overflow = true;
      return;
    }

    const region = normalizedRegions[regionIndex];
    const tokenWidth = measureSegmentWidthMm(token.text, fontMm, token.bold);

    if (current.segments.length > 0 && current.widthMm + tokenWidth > region.widthMm) {
      pushCurrentLine();
      if (/^\s+$/.test(token.text)) {
        return;
      }
      addToken(token);
      return;
    }

    if (tokenWidth > region.widthMm) {
      const pieces = breakLongToken(token, region.widthMm, fontMm);
      for (const piece of pieces) {
        addToken(piece);
      }
      return;
    }

    current.segments.push(token);
    current.widthMm += tokenWidth;
  };

  for (const paragraph of text.split(/\r?\n/g)) {
    tokenizeRichSegments(parseRichText(paragraph)).forEach(addToken);
    pushCurrentLine();
  }

  return { regions: flowedRegions, overflow };
}

export function richTextLineToMarkedText(line: RichTextLine): string {
  return line.segments
    .map((segment) => (segment.bold ? `**${segment.text}**` : segment.text))
    .join("");
}

export function measureRichTextHeightMm(
  text: string,
  widthMm: number,
  fontMm: number,
  lineHeight = 1.16
): number {
  return Math.max(
    fontMm * lineHeight,
    wrapRichText(text, widthMm, fontMm).length * fontMm * lineHeight
  );
}

export function measureSegmentWidthMm(
  text: string,
  fontMm: number,
  bold = false
): number {
  return text.length * fontMm * (bold ? 0.56 : 0.52);
}

function tokenizeRichSegments(segments: RichTextSegment[]): RichTextSegment[] {
  return segments.flatMap((segment) =>
    segment.text
      .split(/(\s+)/)
      .filter((part) => part.length > 0)
      .map((part) => ({
        text: part,
        bold: segment.bold
      }))
  );
}

function trimLine(line: RichTextLine): void {
  while (line.segments.length && /^\s+$/.test(line.segments[0].text)) {
    const segment = line.segments.shift();
    if (segment) {
      line.widthMm -= measureSegmentWidthMm(segment.text, 1, segment.bold);
    }
  }

  while (
    line.segments.length &&
    /^\s+$/.test(line.segments[line.segments.length - 1].text)
  ) {
    line.segments.pop();
  }
}

function breakLongToken(
  token: RichTextSegment,
  widthMm: number,
  fontMm: number
): RichTextSegment[] {
  const charWidth = fontMm * (token.bold ? 0.56 : 0.52);
  const maxChars = Math.max(1, Math.floor(widthMm / charWidth));
  const pieces: RichTextSegment[] = [];

  for (let index = 0; index < token.text.length; index += maxChars) {
    pieces.push({
      text: token.text.slice(index, index + maxChars),
      bold: token.bold
    });
  }

  return pieces;
}

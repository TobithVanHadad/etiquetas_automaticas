"use client";

import {
  parseRichText,
  stripRichTextMarkers,
  type LayoutElement,
  type LayoutResult,
  type TableElement
} from "@industrial-label/core";

const CSS_PX_PER_MM = 3.7795275591;

export function LabelPreview({
  layout,
  zoom
}: {
  layout: LayoutResult;
  zoom: number;
}) {
  const widthPx = layout.label.widthMm * CSS_PX_PER_MM;
  const heightPx = layout.label.heightMm * CSS_PX_PER_MM;

  return (
    <div
      className="relative overflow-auto rounded border border-zinc-300 bg-zinc-100 p-5"
      style={{ minHeight: 520 }}
    >
      <div
        className="relative"
        style={{
          width: widthPx * zoom,
          height: heightPx * zoom
        }}
      >
        <div
          className="label-paper absolute left-0 top-0 border border-zinc-300 shadow-panel"
          style={{
            width: widthPx,
            height: heightPx,
            transform: `scale(${zoom})`,
            transformOrigin: "top left",
            borderRadius:
              layout.label.visualPreset === "crevel-current" ? 16 : 0
          }}
        >
          {layout.elements.map((element) => (
            <PreviewElement
              key={element.id}
              element={element}
              fontFamily={layout.label.fontFamily}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function PreviewElement({
  element,
  fontFamily
}: {
  element: LayoutElement;
  fontFamily: LayoutResult["label"]["fontFamily"];
}) {
  const baseStyle = {
    left: element.xMm * CSS_PX_PER_MM,
    top: element.yMm * CSS_PX_PER_MM,
    width: element.widthMm * CSS_PX_PER_MM,
    height: Math.max(1, element.heightMm * CSS_PX_PER_MM)
  };

  if (element.kind === "text") {
    return (
      <div
        className={[
          "absolute whitespace-pre-wrap break-words leading-tight text-zinc-950",
          element.overflow ? "bg-red-100/80 outline outline-1 outline-red-500" : ""
        ].join(" ")}
        style={{
          ...baseStyle,
          fontSize: element.fontMm * CSS_PX_PER_MM,
          lineHeight: element.lineHeight,
          fontWeight: element.weight === "bold" ? 700 : 400,
          fontFamily: previewFontFamily(fontFamily),
          textAlign: element.align ?? "left",
          overflow: "hidden"
        }}
        title={element.overflow ? "Overflow detectado" : undefined}
      >
        <RichTextInline text={element.text} />
      </div>
    );
  }

  if (element.kind === "line") {
    return (
      <div
        className={[
          "absolute bg-zinc-950",
          element.overflow ? "bg-red-600" : ""
        ].join(" ")}
        style={{
          left: element.xMm * CSS_PX_PER_MM,
          top: element.yMm * CSS_PX_PER_MM,
          width:
            element.direction === "horizontal"
              ? element.widthMm * CSS_PX_PER_MM
              : Math.max(1, element.thicknessMm * CSS_PX_PER_MM),
          height:
            element.direction === "horizontal"
              ? Math.max(1, element.thicknessMm * CSS_PX_PER_MM)
              : element.heightMm * CSS_PX_PER_MM
        }}
      />
    );
  }

  if (element.kind === "box") {
    return (
      <div
        className="absolute border border-zinc-950"
        style={{
          ...baseStyle,
          borderWidth: Math.max(1, element.thicknessMm * CSS_PX_PER_MM)
        }}
      />
    );
  }

  if (element.kind === "qr") {
    return (
      <div
        className="absolute border border-zinc-900 bg-white p-[2px]"
        style={baseStyle}
        title={element.data}
      >
        <QrPattern seed={element.data} />
      </div>
    );
  }

  if (element.kind === "barcode") {
    return (
      <div
        className="absolute flex items-end gap-[1px] overflow-hidden bg-white px-1"
        style={baseStyle}
        title={element.data}
      >
        {Array.from({ length: 72 }, (_, index) => (
          <span
            key={index}
            className="block bg-zinc-950"
            style={{
              width: index % 5 === 0 ? 2 : 1,
              height: `${38 + ((index * 17) % 56)}%`
            }}
          />
        ))}
      </div>
    );
  }

  return <TablePreview table={element} fontFamily={fontFamily} />;
}

function TablePreview({
  table,
  fontFamily
}: {
  table: TableElement;
  fontFamily: LayoutResult["label"]["fontFamily"];
}) {
  const rowHeights = table.rowHeightsMm ?? table.cells.map(() => table.rowHeightMm);

  return (
    <div
      className={[
        "absolute overflow-hidden border border-zinc-950 bg-white text-zinc-950",
        table.overflow ? "outline outline-1 outline-red-500" : ""
      ].join(" ")}
      style={{
        left: table.xMm * CSS_PX_PER_MM,
        top: table.yMm * CSS_PX_PER_MM,
        width: table.widthMm * CSS_PX_PER_MM,
        height: table.heightMm * CSS_PX_PER_MM,
        fontSize: Math.max(5, table.fontMm * CSS_PX_PER_MM),
        fontFamily: previewFontFamily(fontFamily)
      }}
    >
      {table.cells.map((row, rowIndex) => (
        <div
          key={rowIndex}
          className="grid border-b border-zinc-950 last:border-b-0"
          style={{
            gridTemplateColumns: table.columnFractions
              .map((fraction) => `${fraction}fr`)
              .join(" "),
            height: (rowHeights[rowIndex] ?? table.rowHeightMm) * CSS_PX_PER_MM
          }}
        >
          {row.map((cell, cellIndex) => (
            <div
              key={`${rowIndex}-${cellIndex}`}
              className="flex min-w-0 items-start overflow-hidden whitespace-pre-line border-r border-zinc-950 px-1 py-[1px] last:border-r-0"
              style={{
                gridColumn: cell.colSpan ? `span ${cell.colSpan}` : undefined,
                textAlign: cell.align ?? "left",
                justifyContent:
                  cell.align === "right"
                    ? "flex-end"
                    : cell.align === "center"
                      ? "center"
                      : "flex-start",
                fontWeight: cell.weight === "bold" ? 700 : 400,
                lineHeight: 0.98
              }}
              title={cell.text}
            >
              <span className="whitespace-pre-line break-words">
                {stripRichTextMarkers(cell.text)}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function previewFontFamily(fontFamily: LayoutResult["label"]["fontFamily"]): string {
  if (fontFamily === "arial") {
    return "Arial, Helvetica, sans-serif";
  }

  return "'Arial Narrow', 'Roboto Condensed', Arial, sans-serif";
}

function RichTextInline({ text }: { text: string }) {
  return (
    <>
      {parseRichText(text).map((segment, index) => (
        <span key={index} className={segment.bold ? "font-bold" : undefined}>
          {segment.text}
        </span>
      ))}
    </>
  );
}

function QrPattern({ seed }: { seed: string }) {
  const hash = Array.from(seed).reduce((value, char) => {
    return (value * 31 + char.charCodeAt(0)) >>> 0;
  }, 7);

  return (
    <div className="grid h-full w-full grid-cols-9 grid-rows-9 gap-[1px]">
      {Array.from({ length: 81 }, (_, index) => {
        const finder =
          (index < 21 && index % 9 < 3) ||
          (index < 27 && index % 9 > 5) ||
          (index > 53 && index % 9 < 3);
        const active = finder || ((hash >> (index % 24)) + index) % 3 === 0;

        return (
          <span
            key={index}
            className={active ? "bg-zinc-950" : "bg-white"}
          />
        );
      })}
    </div>
  );
}

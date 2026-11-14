import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { PagedScript, Page, PositionedLine, StyleSpan } from './types';

/** Points per inch, and the print view's line pitch (12pt lines, six to the inch). */
const PT = 72;
const LINE_PT = 12;
const FONT_SIZE = 12;

/** Courier Prime TTF bytes for the four faces; the engine does no I/O, so the caller loads them. */
export interface PdfFonts {
  regular: Uint8Array;
  bold: Uint8Array;
  italic: Uint8Array;
  boldItalic: Uint8Array;
}

export interface PdfOptions {
  fonts: PdfFonts;
  /** Creation and modification date. Passed in so identical input gives identical bytes. */
  now: Date;
  /** Drawn diagonally on every page except the title page. Blank = none. */
  watermark?: string;
  /** Default true. Ignored when the script has no title page. */
  includeTitlePage?: boolean;
}

/** Underline: 1pt below the baseline, 0.5pt thick. */
const UNDERLINE_OFFSET_PT = 1;
const UNDERLINE_THICKNESS_PT = 0.5;

const WATERMARK_SIZE = 60;
const WATERMARK_OPACITY = 0.12;
const WATERMARK_ANGLE = 45;

/** The vertical metrics of the body font, in font units. */
export interface FontMetrics {
  unitsPerEm: number;
  ascent: number;
  descent: number;
}

/**
 * Distance from the top of a 12pt line box to its baseline, the way a browser places text in a box whose
 * line-height is 12pt: the font's ascent + descent is centred in the box. The print view is exactly such
 * a box, so using this offset puts the PDF baseline where the print view puts it.
 */
export function baselineOffsetPt(m: FontMetrics): number {
  const ascent = (m.ascent / m.unitsPerEm) * FONT_SIZE;
  const descent = (-m.descent / m.unitsPerEm) * FONT_SIZE;
  return (LINE_PT - (ascent + descent)) / 2 + ascent;
}

/**
 * PDF y (points from the bottom edge) of a line's baseline: the one place layout rows become PDF
 * coordinates. `yLine` is the row from the top of the body area; the body starts `topMarginIn` down.
 */
export function baselineY(
  pageHeightIn: number,
  topMarginIn: number,
  yLine: number,
  baselineOffset: number,
): number {
  return pageHeightIn * PT - topMarginIn * PT - yLine * LINE_PT - baselineOffset;
}

type Face = 'regular' | 'bold' | 'italic' | 'boldItalic';
const FACE_NAMES: Record<Face, string> = {
  regular: 'CourierPrime-Regular',
  bold: 'CourierPrime-Bold',
  italic: 'CourierPrime-Italic',
  boldItalic: 'CourierPrime-BoldItalic',
};

interface Piece {
  text: string;
  face: Face;
  underline: boolean;
}

/** Cuts a line at every style boundary and says which face and underline each piece uses. */
function piecesOf(text: string, styles?: StyleSpan[]): Piece[] {
  if (!styles || styles.length === 0) return [{ text, face: 'regular', underline: false }];
  const cuts = new Set([0, text.length]);
  for (const s of styles) {
    cuts.add(Math.min(Math.max(s.from, 0), text.length));
    cuts.add(Math.min(Math.max(s.to, 0), text.length));
  }
  const sorted = [...cuts].sort((a, b) => a - b);
  const out: Piece[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const from = sorted[i]!;
    const to = sorted[i + 1]!;
    if (from === to) continue;
    const on = styles.filter((s) => s.from <= from && s.to >= to);
    const bold = on.some((s) => s.kind === 'bold');
    const italic = on.some((s) => s.kind === 'italic');
    out.push({
      text: text.slice(from, to),
      face: bold && italic ? 'boldItalic' : bold ? 'bold' : italic ? 'italic' : 'regular',
      underline: on.some((s) => s.kind === 'underline'),
    });
  }
  return out;
}

/** Reading order: top to bottom, then left to right, so the PDF's text layer reads like the page. */
function inReadingOrder(lines: PositionedLine[]): PositionedLine[] {
  return lines
    .map((l, i) => ({ l, i }))
    .sort((a, b) => a.l.yLine - b.l.yLine || a.l.xIn - b.l.xIn || a.i - b.i)
    .map((e) => e.l);
}

/** A title page entry's text: wrapped lines of one kind joined with a space. */
function titleEntry(page: Page | undefined, kind: PositionedLine['kind']): string | undefined {
  if (!page) return undefined;
  const text = page.lines
    .filter((l) => l.kind === kind)
    .map((l) => l.text.trim())
    .join(' ')
    .trim();
  return text || undefined;
}

/** Drops the characters a standard (WinAnsi) font cannot draw, so a stray emoji can't abort the export. */
function drawable(font: PDFFont, text: string): string {
  const supported = new Set(font.getCharacterSet());
  return [...text].filter((ch) => supported.has(ch.codePointAt(0)!)).join('');
}

function drawWatermark(page: PDFPage, font: PDFFont, text: string, widthPt: number, heightPt: number) {
  const width = font.widthOfTextAtSize(text, WATERMARK_SIZE);
  const half = font.heightAtSize(WATERMARK_SIZE, { descender: false }) / 2;
  const a = (WATERMARK_ANGLE * Math.PI) / 180;
  // pdf-lib rotates about the text's origin (its left baseline end): place that origin so the middle
  // of the text box lands on the middle of the page.
  const x = widthPt / 2 - ((width / 2) * Math.cos(a) - half * Math.sin(a));
  const y = heightPt / 2 - ((width / 2) * Math.sin(a) + half * Math.cos(a));
  page.drawText(text, {
    x,
    y,
    size: WATERMARK_SIZE,
    font,
    rotate: degrees(WATERMARK_ANGLE),
    color: rgb(0, 0, 0),
    opacity: WATERMARK_OPACITY,
  });
}

/**
 * Draws a `PagedScript` as a PDF: the same pages, lines and positions the print view shows, so the two
 * cannot differ. Pure: fonts come in as bytes, dates from `options.now`; the same input gives the same
 * bytes.
 */
export async function exportPdf(paged: PagedScript, options: PdfOptions): Promise<Uint8Array> {
  const { spec } = paged;
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.registerFontkit(fontkit);

  // Only the faces a script uses are embedded; each is subset to the glyphs drawn.
  const embedded = new Map<Face, PDFFont>();
  const faceFont = async (face: Face): Promise<PDFFont> => {
    let f = embedded.get(face);
    if (!f) {
      f = await doc.embedFont(options.fonts[face], { subset: true, customName: FACE_NAMES[face] });
      embedded.set(face, f);
    }
    return f;
  };
  const metrics = fontkit.create(options.fonts.regular);
  const baseline = baselineOffsetPt(metrics);
  const watermark = options.watermark?.trim();
  const markFont = watermark ? await doc.embedFont(StandardFonts.HelveticaBold) : undefined;
  const markText = markFont && watermark ? drawable(markFont, watermark) : '';

  const widthPt = spec.widthIn * PT;
  const heightPt = spec.heightIn * PT;
  const pages: Page[] = [];
  if (paged.titlePage && options.includeTitlePage !== false) pages.push(paged.titlePage);
  pages.push(...paged.pages);

  for (const source of pages) {
    const page = doc.addPage([widthPt, heightPt]);
    if (markFont && markText && source.number !== 0) {
      drawWatermark(page, markFont, markText, widthPt, heightPt);
    }
    for (const line of inReadingOrder(source.lines)) {
      let x = line.xIn * PT;
      const y = baselineY(spec.heightIn, spec.topMarginIn, line.yLine, baseline);
      for (const piece of piecesOf(line.text, line.styles)) {
        const font = await faceFont(piece.face);
        const width = font.widthOfTextAtSize(piece.text, FONT_SIZE);
        if (piece.text.trim() !== '') {
          page.drawText(piece.text, { x, y, size: FONT_SIZE, font });
        }
        if (piece.underline) {
          page.drawLine({
            start: { x, y: y - UNDERLINE_OFFSET_PT },
            end: { x: x + width, y: y - UNDERLINE_OFFSET_PT },
            thickness: UNDERLINE_THICKNESS_PT,
          });
        }
        x += width;
      }
    }
  }

  const title = titleEntry(paged.titlePage, 'title');
  const author = titleEntry(paged.titlePage, 'author');
  if (title) doc.setTitle(title);
  if (author) doc.setAuthor(author);
  doc.setCreator('Scriptwriter');
  doc.setProducer('pdf-lib');
  doc.setCreationDate(options.now);
  doc.setModificationDate(options.now);
  return doc.save({ useObjectStreams: false });
}

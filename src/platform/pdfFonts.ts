import type { PdfFonts } from '../engine';
import regular from '../../assets/fonts/CourierPrime-Regular.ttf?url';
import bold from '../../assets/fonts/CourierPrime-Bold.ttf?url';
import italic from '../../assets/fonts/CourierPrime-Italic.ttf?url';
import boldItalic from '../../assets/fonts/CourierPrime-BoldItalic.ttf?url';

let cached: Promise<PdfFonts> | undefined;

async function bytes(url: string): Promise<Uint8Array> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Could not load the print font (${r.status}).`);
  return new Uint8Array(await r.arrayBuffer());
}

/** The bundled Courier Prime faces (the same files the print view uses), loaded once on first export. */
export function loadPdfFonts(): Promise<PdfFonts> {
  cached ??= Promise.all([bytes(regular), bytes(bold), bytes(italic), bytes(boldItalic)]).then(
    ([r, b, i, bi]) => ({ regular: r, bold: b, italic: i, boldItalic: bi }),
    (e) => {
      cached = undefined; // try again next time
      throw e;
    },
  );
  return cached;
}

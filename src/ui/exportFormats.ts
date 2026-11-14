import { exportPdf, paginate, parse, resolve, A4, US_LETTER } from '../engine';
import type { ExportContext, ExportControl } from './exportOptions';

/**
 * One export format. The dialog lists `EXPORT_FORMATS`; choosing a format shows only the option controls
 * in `controls`, and [Save to file…] / [Share…] write whatever `run` returns.
 */
export interface ExportFormat {
  /** Stored in the remembered options, so never rename one. */
  id: string;
  /** Shown in the format picker. */
  label: string;
  /** File extension without the dot; also picks the save picker's file type. */
  extension: string;
  /** MIME type for the share sheet and the browser download. */
  mime: string;
  controls: readonly ExportControl[];
  /** Builds the file: bytes, or text (saved as UTF-8). */
  run(ctx: ExportContext): Promise<Uint8Array | string>;
}

export const PDF_FORMAT: ExportFormat = {
  id: 'pdf',
  label: 'PDF',
  extension: 'pdf',
  mime: 'application/pdf',
  controls: ['paper', 'sceneNumbers', 'variables', 'watermark', 'titlePage'],
  async run({ text, options, now, fonts }) {
    const resolved = resolve(parse(text), { mode: options.variables === 'keep' ? 'keep' : 'resolve' });
    const paged = paginate(resolved.doc, options.paper === 'a4' ? A4 : US_LETTER, {
      sceneNumbers: options.sceneNumbers,
    });
    return exportPdf(paged, {
      fonts: await fonts(),
      now,
      watermark: options.watermark,
      includeTitlePage: options.titlePage,
    });
  },
};

/**
 * The formats the dialog offers, in order. To add one (ticket 10: FDX, Fountain), write an
 * `ExportFormat` in its own file and list it here; nothing else in the dialog changes.
 */
export const EXPORT_FORMATS: readonly ExportFormat[] = [PDF_FORMAT];

export function formatById(id: string): ExportFormat {
  return EXPORT_FORMATS.find((f) => f.id === id) ?? EXPORT_FORMATS[0]!;
}

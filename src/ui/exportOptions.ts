import type { PdfFonts } from '../engine';

/** The shared option controls the dialog can show. A format lists the ones it uses (`ExportFormat.controls`). */
export type ExportControl = 'paper' | 'sceneNumbers' | 'variables' | 'watermark' | 'titlePage';

export interface ExportOptions {
  /** `ExportFormat.id` of the chosen format. */
  format: string;
  paper: 'letter' | 'a4';
  sceneNumbers: 'off' | 'both';
  /** `fill`: print each variable's value. `keep`: leave `{{KEY}}` in the output. */
  variables: 'fill' | 'keep';
  /** PDF only: diagonal text on every page except the title page. Blank = none. */
  watermark: string;
  titlePage: boolean;
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  format: 'pdf',
  paper: 'letter',
  sceneNumbers: 'off',
  variables: 'fill',
  watermark: '',
  titlePage: true,
};

/** What a format needs to produce its file. `text` is the script as written, variables unresolved. */
export interface ExportContext {
  text: string;
  options: ExportOptions;
  now: Date;
  /** Courier Prime bytes (PDF). Loaded on demand, so formats that don't draw text never fetch them. */
  fonts: () => Promise<PdfFonts>;
}

export function exportOptionsKey(fileUri: string): string {
  return `export.options.${fileUri}`;
}

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

/**
 * Options remembered for a document, from the JSON in Preferences. Anything missing or invalid falls
 * back to the default, and a format that no longer exists falls back to the first one in `formatIds`.
 */
export function parseExportOptions(raw: string | null, formatIds: readonly string[]): ExportOptions {
  let o: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object') o = parsed as Record<string, unknown>;
  } catch {
    /* corrupt value: use the defaults */
  }
  const d = DEFAULT_EXPORT_OPTIONS;
  return {
    format: oneOf(o.format, formatIds, formatIds[0] ?? d.format),
    paper: oneOf(o.paper, ['letter', 'a4'], d.paper),
    sceneNumbers: oneOf(o.sceneNumbers, ['off', 'both'], d.sceneNumbers),
    variables: oneOf(o.variables, ['fill', 'keep'], d.variables),
    watermark: typeof o.watermark === 'string' ? o.watermark : d.watermark,
    titlePage: typeof o.titlePage === 'boolean' ? o.titlePage : d.titlePage,
  };
}

/**
 * The undefined keys that stop an export, or `[]` when it may go ahead. Only a format that has the
 * Variables control, exporting in `fill` mode, can print a missing value; "Export anyway" lifts the block.
 */
export function blockingKeys(
  undefinedKeys: readonly string[],
  options: ExportOptions,
  controls: readonly ExportControl[],
  exportAnyway: boolean,
): string[] {
  if (exportAnyway || options.variables !== 'fill' || !controls.includes('variables')) return [];
  return [...undefinedKeys];
}

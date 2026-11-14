import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importFdx, parse } from '../src/engine';
import {
  exchangeFileName,
  exportFdxText,
  exportFountainText,
  importFdxFile,
  isFdxName,
} from '../src/storage/exchange';
import { MemoryStorage } from '../src/storage/memory';
import { suggestedExportName } from '../src/storage/exportFile';
import { EXPORT_FORMATS, FDX_FORMAT, FOUNTAIN_FORMAT, formatById } from '../src/ui/exportFormats';
import {
  DEFAULT_EXPORT_OPTIONS,
  blockingKeys,
  type ExportContext,
  type ExportOptions,
} from '../src/ui/exportOptions';

const FDX = readFileSync(new URL('./fixtures/fdx/final-draft.fdx', import.meta.url), 'utf8');

describe('file names', () => {
  it('recognises FDX files', () => {
    expect(isFdxName('Script.fdx')).toBe(true);
    expect(isFdxName('SCRIPT.FDX')).toBe(true);
    expect(isFdxName('Script.fountain')).toBe(false);
    expect(isFdxName('fdx')).toBe(false);
  });

  it('swaps the extension', () => {
    expect(exchangeFileName('My Script.fountain', 'fdx')).toBe('My Script.fdx');
    expect(exchangeFileName('My Script.txt', 'fdx')).toBe('My Script.fdx');
    expect(exchangeFileName('Untitled', 'fdx')).toBe('Untitled.fdx');
    expect(exchangeFileName('Draft 2.final.fountain', 'fdx')).toBe('Draft 2.final.fdx');
    expect(exchangeFileName('', 'fdx')).toBe('Script.fdx');
    expect(exchangeFileName('Script.fdx', 'fountain')).toBe('Script.fountain');
  });
});

describe('export text', () => {
  const script = 'Title: T\nVar-HERO: Jack\n\nINT. A - DAY\n\n{{HERO}} waits.\n\nINT. B - DAY';

  it('fills in variables for FDX by default and keeps them on request', () => {
    expect(exportFdxText(script)).toContain('Jack waits.');
    expect(exportFdxText(script)).not.toContain('Var-');
    expect(exportFdxText(script, { variables: 'keep' })).toContain('{{HERO}} waits.');
  });

  it('writes scene numbers only when asked', () => {
    expect(exportFdxText(script)).not.toContain('Number=');
    expect(exportFdxText(script, { sceneNumbers: true })).toContain('Number="2"');
  });

  it('gives Fountain with the values in and no Var- lines', () => {
    const out = exportFountainText(script);
    expect(out).toContain('Jack waits.');
    expect(out).not.toContain('Var-');
    expect(out).not.toContain('{{');
    expect(parse(out).elements.map((e) => e.type)).toEqual(
      parse(script).elements.map((e) => e.type),
    );
  });
});

describe('importFdxFile', () => {
  const setup = () => {
    const storage = new MemoryStorage();
    const source = storage.seed('mem://in/Script.fdx', FDX);
    return { storage, source };
  };

  it('converts the file into a new .fountain file the writer chooses', async () => {
    const { storage, source } = setup();
    storage.nextCreate = { uri: 'mem://out/Script.fountain', name: '' };
    const ref = await importFdxFile(storage, source);
    expect(ref).toMatchObject({ uri: 'mem://out/Script.fountain', name: 'Script.fountain' });
    expect(storage.files.get('mem://out/Script.fountain')).toBe(importFdx(FDX));
    // The FDX itself is left alone.
    expect(storage.files.get('mem://in/Script.fdx')).toBe(FDX);
  });

  it('returns null and writes nothing when the writer cancels the save picker', async () => {
    const { storage, source } = setup();
    expect(await importFdxFile(storage, source)).toBeNull();
    expect([...storage.files.keys()]).toEqual(['mem://in/Script.fdx']);
  });

  it('fails before asking where to save when the file is not Final Draft XML', async () => {
    const storage = new MemoryStorage();
    const source = storage.seed('mem://in/Bad.fdx', 'this is not xml');
    storage.nextCreate = { uri: 'mem://out/Bad.fountain', name: '' };
    await expect(importFdxFile(storage, source)).rejects.toThrow(/Final Draft/);
    expect(storage.files.has('mem://out/Bad.fountain')).toBe(false);
  });

  it('reads a file that starts with a byte-order mark', async () => {
    const storage = new MemoryStorage();
    const source = storage.seed('mem://in/Bom.fdx', `\uFEFF${FDX}`);
    storage.nextCreate = { uri: 'mem://out/Bom.fountain', name: '' };
    expect(await importFdxFile(storage, source)).not.toBeNull();
    expect(storage.files.get('mem://out/Bom.fountain')).toBe(importFdx(FDX));
  });
});

describe('export dialog formats', () => {
  const script = 'Title: T\nVar-HERO: Jack\n\nINT. A - DAY\n\n{{HERO}} waits.\n\nINT. B - DAY';
  const ctx = (options: Partial<ExportOptions> = {}): ExportContext => ({
    text: script,
    options: { ...DEFAULT_EXPORT_OPTIONS, ...options },
    now: new Date('2026-11-14T10:00:00Z'),
    fonts: () => Promise.reject(new Error('text formats never load fonts')),
  });

  it('lists PDF first, then FDX and Fountain', () => {
    expect(EXPORT_FORMATS.map((f) => f.id)).toEqual(['pdf', 'fdx', 'fountain']);
    expect(formatById('fdx')).toBe(FDX_FORMAT);
  });

  it('FDX follows the variables and scene-number options', async () => {
    const fill = (await FDX_FORMAT.run(ctx())) as string;
    expect(fill).toContain('Jack waits.');
    expect(fill).not.toContain('Number=');
    expect(await FDX_FORMAT.run(ctx({ variables: 'keep' }))).toContain('{{HERO}} waits.');
    expect(await FDX_FORMAT.run(ctx({ sceneNumbers: 'both' }))).toContain('Number="2"');
  });

  it('Fountain fills values in, or keeps the script as written', async () => {
    const fill = (await FOUNTAIN_FORMAT.run(ctx())) as string;
    expect(fill).toContain('Jack waits.');
    expect(fill).not.toMatch(/Var-|\{\{/);
    const keep = (await FOUNTAIN_FORMAT.run(ctx({ variables: 'keep' }))) as string;
    expect(keep).toContain('Var-HERO: Jack');
    expect(keep).toContain('{{HERO}} waits.');
  });

  it('gates undefined variables for both formats, and names files from the title', () => {
    for (const f of [FDX_FORMAT, FOUNTAIN_FORMAT]) {
      expect(blockingKeys(['X'], ctx().options, f.controls, false)).toEqual(['X']);
      expect(suggestedExportName('Big Fish', ctx().now, f.extension)).toMatch(
        /^Big Fish – 2026-11-14\.(fdx|fountain)$/,
      );
    }
  });
});

export type LayoutMode = 'editor' | 'print' | 'both';

export const LAYOUT_KEY = 'layoutMode';
export const LAYOUT_MODES: [LayoutMode, string][] = [
  ['editor', 'Editor'],
  ['print', 'Print'],
  ['both', 'Side by side'],
];

export function parseLayout(v: string | null): LayoutMode | null {
  return v === 'editor' || v === 'print' || v === 'both' ? v : null;
}

/** Ctrl+P cycles Editor only → Print view only → Side by side. */
export function nextLayout(m: LayoutMode): LayoutMode {
  return m === 'editor' ? 'print' : m === 'print' ? 'both' : 'editor';
}

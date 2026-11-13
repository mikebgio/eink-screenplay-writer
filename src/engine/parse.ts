import type { ScriptDocument, ScriptElement } from './types';

const SCENE_PREFIX = /^(INT\.\/EXT\.|INT\/EXT|INT\.|EXT\.|EST\.|I\/E)(\s|$)/i;

function isSceneHeading(line: string): boolean {
  if (line.startsWith('.') && !line.startsWith('..')) return line.length > 1;
  return SCENE_PREFIX.test(line);
}

function isCharacter(line: string): boolean {
  return /[A-Z]/.test(line) && line === line.toUpperCase();
}

/** Minimal Fountain parser (ticket 01): scene heading, character, dialogue, action. */
export function parse(text: string): ScriptDocument {
  const lines = text.split(/\r?\n/);
  const elements: ScriptElement[] = [];
  const isBlank = (n: number) => (lines[n] ?? '').trim() === '';
  let i = 0;
  while (i < lines.length) {
    if (isBlank(i)) {
      i++;
      continue;
    }
    // Collect one block of consecutive non-blank lines.
    const start = i;
    while (i < lines.length && !isBlank(i)) i++;
    const block = lines.slice(start, i);
    const first = (block[0] ?? '').trim();
    /** Push the block's first line as `head`, then any remaining lines as one `rest` element. */
    const pushSplit = (
      head: ScriptElement['type'],
      headText: string,
      rest: ScriptElement['type'],
    ) => {
      elements.push({ type: head, text: headText, startLine: start, endLine: start });
      if (block.length > 1) {
        elements.push({
          type: rest,
          text: block.slice(1).join('\n'),
          startLine: start + 1,
          endLine: i - 1,
        });
      }
    };

    if (isSceneHeading(first)) {
      pushSplit('scene-heading', first.startsWith('.') ? first.slice(1).trim() : first, 'action');
    } else if (block.length > 1 && isCharacter(first)) {
      pushSplit('character', first, 'dialogue');
    } else {
      elements.push({ type: 'action', text: block.join('\n'), startLine: start, endLine: i - 1 });
    }
  }
  return { elements };
}

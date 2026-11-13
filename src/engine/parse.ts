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
  let i = 0;
  while (i < lines.length) {
    if ((lines[i] ?? '').trim() === '') {
      i++;
      continue;
    }
    // Collect one block of consecutive non-blank lines.
    const start = i;
    while (i < lines.length && (lines[i] ?? '').trim() !== '') i++;
    const block = lines.slice(start, i);
    const first = block[0] ?? '';

    if (isSceneHeading(first)) {
      elements.push({
        type: 'scene-heading',
        text: first.startsWith('.') ? first.slice(1).trim() : first.trim(),
        startLine: start,
        endLine: start,
      });
      if (block.length > 1) {
        elements.push({
          type: 'action',
          text: block.slice(1).join('\n'),
          startLine: start + 1,
          endLine: i - 1,
        });
      }
    } else if (block.length > 1 && isCharacter(first.trim())) {
      elements.push({ type: 'character', text: first.trim(), startLine: start, endLine: start });
      elements.push({
        type: 'dialogue',
        text: block.slice(1).join('\n'),
        startLine: start + 1,
        endLine: i - 1,
      });
    } else {
      elements.push({ type: 'action', text: block.join('\n'), startLine: start, endLine: i - 1 });
    }
  }
  return { elements };
}

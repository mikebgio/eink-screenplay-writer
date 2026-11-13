/** New-script template: title page plus FADE IN: and an empty scene heading. */
export function newScriptTemplate(today: Date = new Date()): string {
  // Local calendar date (toISOString would give the UTC date).
  const pad = (n: number) => String(n).padStart(2, '0');
  const iso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  return [
    'Title: Untitled',
    'Credit: Written by',
    'Author: ',
    `Draft date: ${iso}`,
    '',
    '',
    'FADE IN:',
    '',
    'INT. ',
    '',
  ].join('\n');
}

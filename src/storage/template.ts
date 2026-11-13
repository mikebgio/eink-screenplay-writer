/** New-script template: title page plus FADE IN: and an empty scene heading. */
export function newScriptTemplate(today: Date = new Date()): string {
  const iso = today.toISOString().slice(0, 10);
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

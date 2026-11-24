import { describe, expect, it } from 'vitest';
import { diffTitleValues, rebaseTitleValues, titleValues, updateTitlePage } from '../src/engine';

const OPENED = 'Title: Old Title\nAuthor: Me\n\nINT. ROOM - DAY';
const RELOADED = 'Title: Title From The Mac\nAuthor: Me\nContact: mac@example.test\n\nINT. ROOM - DAY';

/** What saving the form writes into the text that is there now. */
const save = (text: string, opened: string, edit: Record<string, string>) => {
  const initial = titleValues(opened);
  const values = rebaseTitleValues(text, initial, { ...initial, ...edit });
  return updateTitlePage(text, diffTitleValues(text, values));
};

describe('saving a title form that was open across a reload', () => {
  it('writes only the fields the writer changed', () => {
    const saved = titleValues(save(RELOADED, OPENED, { author: 'Me Too' }));
    expect(saved).toMatchObject({
      title: 'Title From The Mac',
      author: 'Me Too',
      contact: 'mac@example.test',
    });
  });

  it('changes nothing when the writer changed nothing', () => {
    expect(save(RELOADED, OPENED, {})).toBe(RELOADED);
  });

  it('the writer’s change to a field wins over the other device’s', () => {
    expect(titleValues(save(RELOADED, OPENED, { title: 'Mine' })).title).toBe('Mine');
  });
});

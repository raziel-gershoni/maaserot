import { describe, expect, it } from 'vitest';
import he from '../messages/he.json';
import en from '../messages/en.json';

/** 'bot.card.title'-style paths of every string in a message tree. */
function keys(tree: object, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([k, v]) =>
    v !== null && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]
  );
}

describe('messages', () => {
  // A key missing in one locale renders as its raw path ("bot.card.title")
  // to every user of that locale, and nothing else would catch it.
  it('has exactly the same keys in Hebrew and English', () => {
    expect(keys(he).sort()).toEqual(keys(en).sort());
  });
});

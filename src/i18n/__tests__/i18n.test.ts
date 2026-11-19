import { describe, expect, it } from 'vitest';
import { TRANSLATIONS } from '../translations';

describe('i18n translations', () => {
  it('has identical, non-empty keys across EN and ZH dictionaries', () => {
    const enKeys = Object.keys(TRANSLATIONS.en).sort();
    const zhKeys = Object.keys(TRANSLATIONS.zh).sort();

    expect(enKeys).toEqual(zhKeys);

    for (const key of enKeys) {
      const k = key as keyof typeof TRANSLATIONS.en;
      expect(TRANSLATIONS.en[k].trim().length).toBeGreaterThan(0);
      expect(TRANSLATIONS.zh[k].trim().length).toBeGreaterThan(0);
    }
  });
});

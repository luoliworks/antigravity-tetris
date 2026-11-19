import { appStorage } from '../storage/storage';
import type { Language } from '../storage/storage';
import { TRANSLATIONS } from './translations';
import type { TranslationKey } from './translations';

export type { TranslationKey };

export function getLanguage(): Language {
  return appStorage.getPreferences().language;
}

export function t(key: TranslationKey, lang: Language = getLanguage()): string {
  return TRANSLATIONS[lang][key];
}

export function toggleLanguage(): Language {
  const next: Language = getLanguage() === 'en' ? 'zh' : 'en';
  appStorage.updatePreferences({ language: next });
  return next;
}

import { setLanguage, t } from './i18n.js';
export const resolvedTheme = (theme, prefersDark) => theme === 'auto' ? prefersDark ? 'dark' : 'light' : theme;
export function applyPreferences(preferences, prefersDark = matchMedia('(prefers-color-scheme: dark)').matches) {
  setLanguage(preferences.language);
  document.documentElement.lang = preferences.language;
  document.documentElement.dataset.theme = resolvedTheme(preferences.theme,prefersDark);
  document.documentElement.dataset.themeMode = preferences.theme;
  document.title = `Nina — ${t('сімейні фінанси')}`;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content',resolvedTheme(preferences.theme,prefersDark) === 'dark' ? '#24211e' : '#f8f5ef');
}

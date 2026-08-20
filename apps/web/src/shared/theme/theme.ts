import type { UiDensity, UserRole, LandingPage } from '@/shared/types';

export type ThemeId = 'mint';

const THEME_KEY = 'monai-rag-theme';
const PREFS_KEY = 'monai-rag-prefs';

export interface StoredPreferences {
  density: UiDensity;
  landingPage: LandingPage;
  role: UserRole;
  showHealthCards: boolean;
}

const defaultPrefs: StoredPreferences = {
  density: 'comfortable',
  landingPage: 'home',
  role: 'admin',
  showHealthCards: true,
};

export function readStoredTheme(): ThemeId {
  return (localStorage.getItem(THEME_KEY) as ThemeId) || 'mint';
}

export function applyTheme(_id: ThemeId = 'mint'): void {
  document.documentElement.dataset.theme = 'mint';
  document.documentElement.style.colorScheme = 'light';
}

export function readPreferences(): StoredPreferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...defaultPrefs };
    return { ...defaultPrefs, ...JSON.parse(raw) };
  } catch {
    return { ...defaultPrefs };
  }
}

export function savePreferences(prefs: StoredPreferences): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}
